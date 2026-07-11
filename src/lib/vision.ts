// Photo screening via Llama 4 Scout's native vision support, on Groq.
//
// Design note, validated empirically (2026-07-10): the VLM CANNOT positively identify
// niche artists' faces (it rejected the real Leto's own avatar), but it reliably
// recognizes famous people (it named Jared Leto unprompted). So SocialCrawl-sourced photos
// are gated NEGATIVELY — reject when the photo shows a *different* recognizable public
// figure, no person, or an unusable composition — because identity there is already
// anchored by a verified Instagram account (resolved by a text model over profile
// metadata, see socialcrawl.ts). The photo just needs to not be visibly someone else.
//
// Google/Brave results have NO such anchor — they're "whatever came up for this text
// search" with no account to verify against. The negative gate is not enough there: it
// shipped a photo of Paul Wall (an American rapper) for "Booba" (a French rapper who
// also shares his name with a children's cartoon character, which crowded out his real
// accounts in SocialCrawl's search) because the VLM didn't recognize Paul Wall specifically
// that time. So web-search-sourced photos require a POSITIVE gate instead — see
// passesWebSearchGate — the VLM must actually name the person and that name must match
// the claimed artist, not just fail to flag them as someone else.

import sharp from "sharp";
import { groqChatJSON, GROQ_MODELS } from "./groq";

export interface PhotoScreenResult {
  personPresent: boolean;
  singleSubject: boolean;
  differentFamousPerson: boolean;
  isGraphic: boolean;
  recognizedAs: string | null;
  posterQuality: number; // 0-1
  reason: string;
}

interface RawScreen {
  person_present: boolean;
  single_subject: boolean;
  different_famous_person: boolean;
  is_graphic: boolean;
  recognized_as: string | null;
  poster_quality: number;
  reason: string;
}

const SCREEN_SYSTEM = `You screen photos for a concert poster pipeline. We need a clean PHOTOGRAPH of the
artist — never an already-designed image. Most layouts use the photo's own background directly (a soft
vignette fades its edges into the poster), so the photo's own lighting and setting matter as much as the
subject. Reply strict JSON:
{"person_present": bool, "single_subject": bool, "different_famous_person": bool, "is_graphic": bool, "recognized_as": string|null, "poster_quality": number, "reason": string}.
"recognized_as": your best guess at the SPECIFIC named individual shown, if you can identify them at all —
  whether or not they match the claimed artist. Use their most commonly known name (stage name if they have one).
  Only use null if you genuinely cannot identify this specific person.
Set different_famous_person=true ONLY if you are confident the person shown is a well-known public figure who is NOT the claimed artist.
Set is_graphic=true for promotional graphics, album covers, flyers, thumbnails with overlaid text or logos,
screenshots, memes, collages, or any image that is a DESIGN rather than a plain photograph — these are unusable.
poster_quality (0-1): plain photograph, sharp, face visible, usable as a concert poster hero shot.
  Score HIGHEST for on-stage / live-performance shots with dramatic, moody lighting and a dark or
  atmospheric background — a rim-lit silhouette, a spotlight, a crowd with phone flashlights raised.
  Score a flat, evenly-lit studio headshot or a snapshot against a plain wall noticeably lower — it's
  still usable, just far less striking once composited. is_graphic=true caps poster_quality at 0.2.`;

/** Downscale + JPEG + data-URI so we control fetching and keep token cost flat. */
async function toDataUri(image: Buffer): Promise<string> {
  const jpeg = await sharp(image).resize(640, 640, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

export async function screenPhoto(image: Buffer, artistName: string): Promise<PhotoScreenResult> {
  const dataUri = await toDataUri(image);
  const raw = await groqChatJSON<RawScreen>(GROQ_MODELS.vision, [
    { role: "system", content: SCREEN_SYSTEM },
    {
      role: "user",
      content: [
        { type: "text", text: `Claimed artist: "${artistName}", a music artist (rap / afrobeats / nightlife scene).` },
        { type: "image_url", image_url: { url: dataUri } },
      ],
    },
  ]);
  return {
    personPresent: Boolean(raw.person_present),
    singleSubject: Boolean(raw.single_subject),
    differentFamousPerson: Boolean(raw.different_famous_person),
    isGraphic: Boolean(raw.is_graphic),
    recognizedAs: raw.recognized_as ?? null,
    posterQuality: Math.max(0, Math.min(1, Number(raw.poster_quality) || 0)),
    reason: String(raw.reason ?? ""),
  };
}

/** Gate for SocialCrawl photos: identity is already anchored by a verified account —
 *  this just needs to not be visibly a stranger, a designed graphic, or unusable. */
export function passesAutoSourceGate(screen: PhotoScreenResult): boolean {
  return screen.personPresent && !screen.differentFamousPerson && !screen.isGraphic && screen.posterQuality >= 0.55;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9]/g, "");
}

/** Gate for Google/Brave photos: no account to anchor identity to, so the negative gate
 *  isn't enough (see the module doc — it let a Paul Wall photo through for "Booba").
 *  Requires the VLM to have positively named the person AND that name to match the claim. */
export function passesWebSearchGate(screen: PhotoScreenResult, artistName: string): boolean {
  if (!passesAutoSourceGate(screen)) return false;
  if (!screen.recognizedAs) return false;
  const claimed = normalizeName(artistName);
  const recognized = normalizeName(screen.recognizedAs);
  return claimed.length > 0 && (recognized.includes(claimed) || claimed.includes(recognized));
}
