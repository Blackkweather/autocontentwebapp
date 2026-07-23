import { createHash } from "node:crypto";
import sharp from "sharp";
import { supabaseAdmin } from "@club-os/core/database/supabase";
import {
  searchInstagramCandidates,
  resolveOfficialAccount,
  getInstagramPostPhotos,
  getInstagramProfilePhoto,
} from "@club-os/core/search/socialcrawl";
import { findArtistPhotosViaGoogle } from "@club-os/core/search/googleImageSearch";
import { findArtistPhotosViaBrave } from "@club-os/core/search/braveImageSearch";
import { findArtistPhotoViaDeezer } from "@club-os/core/search/deezerImageSearch";
import { removeBackground, removeBackgroundHQ } from "@club-os/core/ai/replicate";
import { removeBackgroundLocal } from "@club-os/core/media/bgremove";
import type { ArtistRow } from "./types";
import { screenPhoto, passesAutoSourceGate, passesWebSearchGate, type PhotoScreenResult } from "./vision";

export interface PhotoLookupResult {
  photoUrl: string | null;
  source: ArtistRow["source"];
}

interface ArtistPhotoRow {
  id: string;
  url: string;
  quality_score: number | null;
}

/**
 * Full photo resolution, in trust order:
 *  1. Manual library (user-uploaded, identity vouched) — VLM picks the best frame.
 *  2. Previously VLM-verified auto-sourced photo cached on the artist row.
 *  3. Deezer's artist catalog — free, no API key, no LLM cost. A name match against a real
 *     music catalog is higher-confidence than a generic web search but not as strong as a
 *     verified social account, so it still passes the negative gate (see passesAutoSourceGate).
 *  4. SocialCrawl: text-LLM resolves the official account, VLM screens the actual photos
 *     against the negative gate (identity is anchored by the verified account already).
 *  5. Google CSE results — no account to anchor identity to, so these require the VLM to
 *     positively name the person as the claimed artist (see passesWebSearchGate).
 *  6. Brave Search image results — same positive-ID requirement as Google.
 *  7. Nothing usable → photo_missing (never guess — wrong faces don't ship).
 *
 * Pinterest and Bing were evaluated and dropped: Pinterest's public API only searches the
 * authenticated user's own pins (no cross-platform keyword search), and Bing's Image Search
 * API was retired by Microsoft in August 2025. Brave Search is the remaining actively
 * maintained, official image-search API — not a scraper — so it's the second web fallback.
 */
/** Every tier is a black box without this — logs exactly what each source returned and why
 *  it was accepted or rejected, so a "photo_missing" outcome is diagnosable from Vercel's
 *  Runtime Logs instead of requiring a manual re-run with ad-hoc instrumentation. */
function logSourceAttempt(tier: string, artistName: string, detail: Record<string, unknown>) {
  console.log("[photo-source]", JSON.stringify({ tier, artistName, ...detail }));
}

export async function lookupArtistPhoto(artistName: string): Promise<PhotoLookupResult> {
  const artist = await upsertArtist(artistName);

  // 1 — manual library
  const { data: library } = await supabaseAdmin
    .from("artist_photos")
    .select("id, url, quality_score")
    .eq("artist_id", artist.id)
    .order("created_at", { ascending: true });
  if (library && library.length > 0) {
    const best = await pickBestLibraryPhoto(library, artistName);
    if (best) return { photoUrl: best, source: "manual" };
  }

  // 2 — cached, previously verified
  if (artist.photo_url && artist.vlm_checked) {
    return { photoUrl: artist.photo_url, source: "database" };
  }

  // 3 — Deezer catalog match
  const deezerUrl = await findArtistPhotoViaDeezer(artistName).catch((err) => {
    logSourceAttempt("deezer", artistName, { error: err instanceof Error ? err.message : String(err) });
    return null;
  });
  if (deezerUrl) {
    const screen = await screenUrl(deezerUrl, artistName);
    logSourceAttempt("deezer", artistName, { url: deezerUrl, screen });
    if (screen && passesAutoSourceGate(screen)) {
      await saveVerifiedPhoto(artist.id, deezerUrl, "deezer");
      return { photoUrl: deezerUrl, source: "deezer" };
    }
  } else {
    logSourceAttempt("deezer", artistName, { url: null, reason: "no catalog match" });
  }

  // 4 — SocialCrawl with account disambiguation + photo screening
  const viaSocial = await resolveViaSocialCrawl(artistName, logSourceAttempt).catch((err) => {
    logSourceAttempt("socialcrawl", artistName, { error: err instanceof Error ? err.message : String(err) });
    return null;
  });
  if (viaSocial) {
    await saveVerifiedPhoto(artist.id, viaSocial, "socialcrawl");
    return { photoUrl: viaSocial, source: "socialcrawl" };
  }

  // 5 — Google fallback: no verified account to anchor identity to, so this requires the
  // stricter positive-ID gate (the VLM must actually name the person as the claimed artist).
  const googleUrls = await findArtistPhotosViaGoogle(artistName).catch(() => []);
  const googleHit = await firstPassing(googleUrls, artistName, passesWebSearchGate, (results) =>
    logSourceAttempt("google_cse", artistName, { candidateCount: googleUrls.length, results })
  );
  if (googleHit) {
    await saveVerifiedPhoto(artist.id, googleHit, "google_cse");
    return { photoUrl: googleHit, source: "google_cse" };
  }

  // 6 — Brave Search fallback: same reasoning as Google above — positive-ID gate required.
  const braveUrls = await findArtistPhotosViaBrave(artistName).catch(() => []);
  const braveHit = await firstPassing(braveUrls, artistName, passesWebSearchGate, (results) =>
    logSourceAttempt("brave", artistName, { candidateCount: braveUrls.length, results })
  );
  if (braveHit) {
    await saveVerifiedPhoto(artist.id, braveHit, "brave");
    return { photoUrl: braveHit, source: "brave" };
  }

  await supabaseAdmin.from("artists").update({ source: "none" }).eq("id", artist.id);
  return { photoUrl: null, source: "none" };
}

async function resolveViaSocialCrawl(
  artistName: string,
  log: (tier: string, artistName: string, detail: Record<string, unknown>) => void
): Promise<string | null> {
  const candidates = await searchInstagramCandidates(artistName);
  const account = await resolveOfficialAccount(artistName, candidates);
  log("socialcrawl", artistName, {
    candidateCount: candidates.length,
    candidateUsernames: candidates.map((c) => c.username),
    resolvedAccount: account?.username ?? null,
  });
  if (!account) return null;

  // screen several recent posts concurrently and keep the best passing frame — rappers' feeds
  // are full of flyers and promo graphics, so first-pass-wins picks garbage
  const postPhotos = await getInstagramPostPhotos(account.username, 5);
  const screened = await Promise.all(postPhotos.map((url) => screenUrl(url, artistName).then((screen) => ({ url, screen }))));
  log("socialcrawl", artistName, {
    account: account.username,
    postPhotoCount: postPhotos.length,
    screens: screened.map((s) => ({ url: s.url, screen: s.screen })),
  });
  const best = screened
    .filter((s): s is { url: string; screen: PhotoScreenResult } => s.screen !== null && passesAutoSourceGate(s.screen))
    .sort((a, b) => b.screen.posterQuality - a.screen.posterQuality)[0];
  if (best) return best.url;

  // avatars cap around 320px — last resort only
  const avatar = await getInstagramProfilePhoto(account.username);
  if (avatar) {
    const screen = await screenUrl(avatar, artistName);
    log("socialcrawl", artistName, { avatar, screen });
    if (screen && passesAutoSourceGate(screen)) return avatar;
  }
  return null;
}

async function screenUrl(url: string, artistName: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log("[photo-source] screenUrl fetch failed", JSON.stringify({ url, status: res.status }));
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return await screenPhoto(buffer, artistName);
  } catch (err) {
    console.log(
      "[photo-source] screenUrl threw",
      JSON.stringify({ url, error: err instanceof Error ? err.message : String(err) })
    );
    return null;
  }
}

/** Screens every candidate concurrently, then returns the first URL (in input order) whose
 *  screen passes `gate` — same "first passing wins" semantics as a sequential loop, without
 *  paying for each VLM round-trip back to back. */
async function firstPassing(
  urls: string[],
  artistName: string,
  gate: (screen: PhotoScreenResult, artistName: string) => boolean,
  onScreened?: (results: Array<{ url: string; screen: PhotoScreenResult | null }>) => void
): Promise<string | null> {
  const screens = await Promise.all(urls.map((url) => screenUrl(url, artistName)));
  onScreened?.(urls.map((url, i) => ({ url, screen: screens[i] })));
  for (let i = 0; i < urls.length; i++) {
    const screen = screens[i];
    if (screen && gate(screen, artistName)) return urls[i];
  }
  return null;
}

/** Scores unscored library photos with the VLM (once, cached, in parallel), returns the
 *  highest-quality URL. */
async function pickBestLibraryPhoto(library: ArtistPhotoRow[], artistName: string): Promise<string | null> {
  const scored = await Promise.all(
    library.map(async (photo) => {
      if (photo.quality_score != null) return { url: photo.url, score: photo.quality_score };
      let score: number;
      try {
        const res = await fetch(photo.url);
        const buffer = Buffer.from(await res.arrayBuffer());
        const screen = await screenPhoto(buffer, artistName);
        // uploads are identity-vouched by the user; only composition quality matters here
        score = screen.personPresent ? screen.posterQuality : 0;
      } catch {
        score = 0;
      }
      await supabaseAdmin.from("artist_photos").update({ quality_score: score }).eq("id", photo.id);
      return { url: photo.url, score };
    })
  );
  scored.sort((a, b) => b.score - a.score);
  return scored[0] && scored[0].score > 0 ? scored[0].url : null;
}

export interface PhotoCandidate {
  url: string;
  source: ArtistRow["source"];
  quality: number; // the VLM's posterQuality score (0-1) from the same screen that gates auto-sourcing
}

/**
 * Same tiers as lookupArtistPhoto, but breadth instead of first-match: runs every tier
 * concurrently and returns every candidate that clears its tier's identity gate, for a human to
 * pick from — rather than the pipeline silently auto-selecting one. Doesn't touch the
 * artists/artist_photos tables; saving a pick is a separate, explicit action
 * (POST /api/artists/photos/from-url) once the user has actually looked at it.
 */
export async function findPhotoCandidates(artistName: string, limit = 8): Promise<PhotoCandidate[]> {
  const [deezerUrl, socialAccount, googleUrls, braveUrls] = await Promise.all([
    findArtistPhotoViaDeezer(artistName).catch(() => null),
    searchInstagramCandidates(artistName)
      .catch(() => [])
      .then((candidates) => resolveOfficialAccount(artistName, candidates).catch(() => null)),
    findArtistPhotosViaGoogle(artistName).catch(() => []),
    findArtistPhotosViaBrave(artistName).catch(() => []),
  ]);
  const socialPhotos = socialAccount ? await getInstagramPostPhotos(socialAccount.username, 4).catch(() => []) : [];

  const candidateUrls: Array<{ url: string; source: ArtistRow["source"]; gate: "auto" | "web" }> = [
    ...(deezerUrl ? [{ url: deezerUrl, source: "deezer" as const, gate: "auto" as const }] : []),
    ...socialPhotos.map((url) => ({ url, source: "socialcrawl" as const, gate: "auto" as const })),
    ...googleUrls.map((url) => ({ url, source: "google_cse" as const, gate: "web" as const })),
    ...braveUrls.map((url) => ({ url, source: "brave" as const, gate: "web" as const })),
  ];

  const screened = await Promise.all(candidateUrls.map(async (c) => ({ ...c, screen: await screenUrl(c.url, artistName) })));

  const seen = new Set<string>();
  const results: PhotoCandidate[] = [];
  for (const c of screened) {
    if (!c.screen || seen.has(c.url)) continue;
    const passes = c.gate === "auto" ? passesAutoSourceGate(c.screen) : passesWebSearchGate(c.screen, artistName);
    if (!passes) continue;
    seen.add(c.url);
    results.push({ url: c.url, source: c.source, quality: c.screen.posterQuality });
  }
  results.sort((a, b) => b.quality - a.quality);
  return results.slice(0, limit);
}

async function upsertArtist(name: string): Promise<{ id: string; photo_url: string | null; vlm_checked: boolean }> {
  const { data: existing } = await supabaseAdmin
    .from("artists")
    .select("id, photo_url, vlm_checked")
    .ilike("name", name)
    .maybeSingle();
  if (existing) return existing;
  const { data: created, error } = await supabaseAdmin
    .from("artists")
    .insert({ name, source: "none" })
    .select("id, photo_url, vlm_checked")
    .single();
  if (error || !created) throw new Error(`Failed to upsert artist: ${error?.message}`);
  return created;
}

async function saveVerifiedPhoto(artistId: string, photoUrl: string, source: ArtistRow["source"]) {
  await supabaseAdmin.from("artists").update({ photo_url: photoUrl, source, vlm_checked: true }).eq("id", artistId);
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url} (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** Softens a cutout's alpha edge with a blur, so the boundary reads as a natural falloff instead
 *  of a hard vector cutline — the single biggest tell that a subject was "cut out" rather than
 *  shot/lit that way to begin with (the reference posters never show a hard edge, because their
 *  subjects were never actually matted — the photographer's own background already worked).
 *  Verified against a synthetic hard-edge test image: alpha goes from a single-pixel step to a
 *  smooth ~12px gradient at this sigma. */
async function featherAlphaEdge(cutout: Buffer, blurSigma = 2.5): Promise<Buffer> {
  const { data: alphaRaw, info: alphaInfo } = await sharp(cutout)
    .ensureAlpha()
    .extractChannel(3)
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data: blurredData, info: blurredInfo } = await sharp(alphaRaw, {
    raw: { width: alphaInfo.width, height: alphaInfo.height, channels: 1 },
  })
    .blur(blurSigma)
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });
  // .flatten() (not .removeAlpha()) to guarantee a true 3-channel raw buffer — removeAlpha alone
  // was observed to keep reporting 4 channels with alpha pinned to 255, which silently misaligns
  // the raw byte layout if you then declare `channels: 3` for a joinChannel call.
  const { data: rgbData, info: rgbInfo } = await sharp(cutout).flatten({ background: "#000000" }).raw().toBuffer({ resolveWithObject: true });
  return sharp(rgbData, { raw: rgbInfo })
    .joinChannel(blurredData, { raw: { width: blurredInfo.width, height: blurredInfo.height, channels: 1 } })
    .png()
    .toBuffer();
}

export interface TreatedPhoto {
  /** Transparent PNG of just the artist, trimmed to the subject's bounding box, high-contrast B&W.
   *  Only used by the "light" layout, which genuinely needs isolation against a plain ground. */
  subject: Buffer;
  /** The original photo, B&W + darkened + heavily softened — a subtle full-bleed ambient texture
   *  layer sitting far behind the display type, not meant to be looked at directly. */
  backdrop: Buffer;
  /** The FULL (uncut) photo, B&W + contrast-popped + sharpened — no matting involved at all.
   *  This is what drawPhotoVignette composites for the dark layouts' hero visual: the reference
   *  posters never show a person-shaped cutout, just a photo whose own edges fade to black, so
   *  this needs the whole frame, not a silhouette. */
  portrait: Buffer;
}

/**
 * Produces the two photographic layers the reference posters are built from:
 * the environment (original frame, pushed down) and the subject (cutout, punched up).
 * Grain/vignette/scratches are applied later, once, across the whole poster canvas.
 *
 * Results are cached in the artist-photos bucket keyed by source-URL hash, so each
 * artist photo only ever costs one Replicate call — batch reruns are free and instant.
 */
export async function treatArtistPhoto(sourcePhotoUrl: string): Promise<TreatedPhoto> {
  const key = createHash("sha1").update(sourcePhotoUrl).digest("hex").slice(0, 16);
  // v3: bumped again for the portrait layer (2026-07-11) — v2 only fixed the cutout's edge
  // quality, still relying on a matted silhouette for the hero visual, which read as a sticker
  // no matter how clean the matte was. v3 adds a full-frame, uncut layer for that job instead.
  const subjectPath = `treated/v3/${key}-subject.png`;
  const backdropPath = `treated/v3/${key}-backdrop.jpg`;
  const portraitPath = `treated/v3/${key}-portrait.jpg`;

  const [cachedSubject, cachedBackdrop, cachedPortrait] = await Promise.all([
    downloadFromBucket(subjectPath),
    downloadFromBucket(backdropPath),
    downloadFromBucket(portraitPath),
  ]);
  if (cachedSubject && cachedBackdrop && cachedPortrait) {
    return { subject: cachedSubject, backdrop: cachedBackdrop, portrait: cachedPortrait };
  }

  const originalBuffer = await fetchImageBuffer(sourcePhotoUrl);

  // Highest-quality matte first (BiRefNet via Replicate) — the local ONNX model's fixed 320x320
  // input can't resolve hair/jewelry/complex-clothing edges cleanly, which is what read as a
  // "cut out sticker" against the reference posters' naturally-blended subjects. Falls back to
  // local ONNX (free, no rate limits), then the older Replicate rembg, so a missing token or a
  // failed HQ call never blocks generation entirely.
  let cutoutBuffer: Buffer;
  try {
    cutoutBuffer = await removeBackgroundHQ(originalBuffer, sourcePhotoUrl);
  } catch {
    try {
      cutoutBuffer = await removeBackgroundLocal(originalBuffer);
    } catch {
      const cutoutUrl = await removeBackground(sourcePhotoUrl);
      cutoutBuffer = await fetchImageBuffer(cutoutUrl);
    }
  }
  cutoutBuffer = await featherAlphaEdge(cutoutBuffer);

  const subject = await sharp(cutoutBuffer)
    .trim({ threshold: 10 }) // drop the transparent padding so layout math sees the real subject box
    .grayscale()
    // local-contrast pop (CLAHE) is what makes auto-sourced photos read as "lit" rather than
    // "filtered" — a flat linear() contrast bump alone can't recover shadow/highlight detail
    .clahe({ width: 90, height: 90, maxSlope: 3 })
    .linear(1.12, -10)
    .sharpen({ sigma: 1.1, m1: 0.6, m2: 2.2 })
    .png()
    .toBuffer();

  const backdrop = await sharp(originalBuffer)
    .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
    .grayscale()
    .linear(0.82, -12) // sink the environment so the subject owns the light
    .blur(2.4)
    .jpeg({ quality: 88 })
    .toBuffer();

  // Same tonal treatment as `subject` (grayscale, CLAHE, contrast, sharpen) but on the full,
  // uncut frame — no matting step, so it's cheaper too. This is genuinely lighter-weight than
  // the cutout path, not just a different look.
  const portrait = await sharp(originalBuffer)
    .resize(2200, 2200, { fit: "inside", withoutEnlargement: true })
    .grayscale()
    .clahe({ width: 90, height: 90, maxSlope: 3 })
    .linear(1.12, -10)
    .sharpen({ sigma: 1.1, m1: 0.6, m2: 2.2 })
    .jpeg({ quality: 92 })
    .toBuffer();

  await Promise.all([
    uploadToBucket(subjectPath, subject, "image/png"),
    uploadToBucket(backdropPath, backdrop, "image/jpeg"),
    uploadToBucket(portraitPath, portrait, "image/jpeg"),
  ]);

  return { subject, backdrop, portrait };
}

async function downloadFromBucket(path: string): Promise<Buffer | null> {
  const { data, error } = await supabaseAdmin.storage.from("artist-photos").download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

async function uploadToBucket(path: string, buffer: Buffer, contentType: string): Promise<void> {
  // cache write failures are non-fatal — the poster still renders from memory
  await supabaseAdmin.storage.from("artist-photos").upload(path, buffer, { contentType, upsert: true }).catch(() => {});
}
