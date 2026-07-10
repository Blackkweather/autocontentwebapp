import { createHash } from "node:crypto";
import sharp from "sharp";
import { supabaseAdmin, type ArtistRow } from "./supabase";
import {
  searchInstagramCandidates,
  resolveOfficialAccount,
  getInstagramPostPhotos,
  getInstagramProfilePhoto,
} from "./socialcrawl";
import { findArtistPhotosViaGoogle } from "./googleImageSearch";
import { findArtistPhotosViaBrave } from "./braveImageSearch";
import { findArtistPhotoViaDeezer } from "./deezerImageSearch";
import { removeBackground } from "./replicate";
import { removeBackgroundLocal } from "./bgremove";
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
  const deezerUrl = await findArtistPhotoViaDeezer(artistName).catch(() => null);
  if (deezerUrl) {
    const screen = await screenUrl(deezerUrl, artistName);
    if (screen && passesAutoSourceGate(screen)) {
      await saveVerifiedPhoto(artist.id, deezerUrl, "deezer");
      return { photoUrl: deezerUrl, source: "deezer" };
    }
  }

  // 4 — SocialCrawl with account disambiguation + photo screening
  const viaSocial = await resolveViaSocialCrawl(artistName).catch(() => null);
  if (viaSocial) {
    await saveVerifiedPhoto(artist.id, viaSocial, "socialcrawl");
    return { photoUrl: viaSocial, source: "socialcrawl" };
  }

  // 5 — Google fallback: no verified account to anchor identity to, so this requires the
  // stricter positive-ID gate (the VLM must actually name the person as the claimed artist).
  const googleUrls = await findArtistPhotosViaGoogle(artistName).catch(() => []);
  const googleHit = await firstPassing(googleUrls, artistName, passesWebSearchGate);
  if (googleHit) {
    await saveVerifiedPhoto(artist.id, googleHit, "google_cse");
    return { photoUrl: googleHit, source: "google_cse" };
  }

  // 6 — Brave Search fallback: same reasoning as Google above — positive-ID gate required.
  const braveUrls = await findArtistPhotosViaBrave(artistName).catch(() => []);
  const braveHit = await firstPassing(braveUrls, artistName, passesWebSearchGate);
  if (braveHit) {
    await saveVerifiedPhoto(artist.id, braveHit, "brave");
    return { photoUrl: braveHit, source: "brave" };
  }

  await supabaseAdmin.from("artists").update({ source: "none" }).eq("id", artist.id);
  return { photoUrl: null, source: "none" };
}

async function resolveViaSocialCrawl(artistName: string): Promise<string | null> {
  const candidates = await searchInstagramCandidates(artistName);
  const account = await resolveOfficialAccount(artistName, candidates);
  if (!account) return null;

  // screen several recent posts concurrently and keep the best passing frame — rappers' feeds
  // are full of flyers and promo graphics, so first-pass-wins picks garbage
  const postPhotos = await getInstagramPostPhotos(account.username, 5);
  const screened = await Promise.all(postPhotos.map((url) => screenUrl(url, artistName).then((screen) => ({ url, screen }))));
  const best = screened
    .filter((s): s is { url: string; screen: PhotoScreenResult } => s.screen !== null && passesAutoSourceGate(s.screen))
    .sort((a, b) => b.screen.posterQuality - a.screen.posterQuality)[0];
  if (best) return best.url;

  // avatars cap around 320px — last resort only
  const avatar = await getInstagramProfilePhoto(account.username);
  if (avatar) {
    const screen = await screenUrl(avatar, artistName);
    if (screen && passesAutoSourceGate(screen)) return avatar;
  }
  return null;
}

async function screenUrl(url: string, artistName: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return await screenPhoto(buffer, artistName);
  } catch {
    return null;
  }
}

/** Screens every candidate concurrently, then returns the first URL (in input order) whose
 *  screen passes `gate` — same "first passing wins" semantics as a sequential loop, without
 *  paying for each VLM round-trip back to back. */
async function firstPassing(
  urls: string[],
  artistName: string,
  gate: (screen: PhotoScreenResult, artistName: string) => boolean
): Promise<string | null> {
  const screens = await Promise.all(urls.map((url) => screenUrl(url, artistName)));
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

export interface TreatedPhoto {
  /** Transparent PNG of just the artist, trimmed to the subject's bounding box, high-contrast B&W. */
  subject: Buffer;
  /** The original photo, B&W + darkened + softened — used as the full-bleed environment layer. */
  backdrop: Buffer;
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
  const subjectPath = `treated/${key}-subject.png`;
  const backdropPath = `treated/${key}-backdrop.jpg`;

  const [cachedSubject, cachedBackdrop] = await Promise.all([
    downloadFromBucket(subjectPath),
    downloadFromBucket(backdropPath),
  ]);
  if (cachedSubject && cachedBackdrop) {
    return { subject: cachedSubject, backdrop: cachedBackdrop };
  }

  const originalBuffer = await fetchImageBuffer(sourcePhotoUrl);

  // local ONNX matting is primary (free, no rate limits); Replicate remains as fallback
  let cutoutBuffer: Buffer;
  try {
    cutoutBuffer = await removeBackgroundLocal(originalBuffer);
  } catch {
    const cutoutUrl = await removeBackground(sourcePhotoUrl);
    cutoutBuffer = await fetchImageBuffer(cutoutUrl);
  }

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

  await Promise.all([
    uploadToBucket(subjectPath, subject, "image/png"),
    uploadToBucket(backdropPath, backdrop, "image/jpeg"),
  ]);

  return { subject, backdrop };
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
