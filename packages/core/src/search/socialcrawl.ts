// SocialCrawl API — real Instagram photos for artists.
// Base URL and REST shape confirmed from https://github.com/socialcrawl/mcp (src/client.ts, src/data/endpoints.ts):
//   GET {base}/v1/{platform}/{resource}?...params, header `x-api-key`.
// Response envelope confirmed by direct API calls during build:
//   { success, platform, endpoint, data: { author } | { items: [{ author }] } | { items: [{ post: { author, content } }] } }

import { groqChatJSON, GROQ_MODELS } from "../ai/groq";

const BASE_URL = process.env.SOCIALCRAWL_BASE_URL || "https://www.socialcrawl.dev";
const API_KEY = process.env.SOCIALCRAWL_API_KEY || "";

interface Author {
  username?: string;
  display_name?: string;
  bio?: string;
  verified?: boolean;
  followers?: number;
  avatar_url?: string;
}

interface SearchProfilesResponse {
  data?: { items?: Array<{ author?: Author }> };
}

interface ProfileResponse {
  data?: { author?: Author };
}

interface ProfilePostsResponse {
  data?: {
    items?: Array<{ post?: { content?: { thumbnail_url?: string; media_urls?: string } } }>;
  };
}

async function scRequest<T = unknown>(platform: string, resource: string, params: Record<string, string>): Promise<T | null> {
  if (!API_KEY) return null;
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE_URL}/v1/${platform}/${resource}?${qs}`, {
    headers: { "x-api-key": API_KEY },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export interface InstagramCandidate {
  username: string;
  displayName: string;
  bio: string;
  verified: boolean;
  followers: number;
}

/** Raw candidate accounts for an artist-name search. */
export async function searchInstagramCandidates(artistName: string): Promise<InstagramCandidate[]> {
  const data = await scRequest<SearchProfilesResponse>("instagram", "search/profiles", { query: artistName });
  const items = data?.data?.items ?? [];
  return items
    .map((i) => i.author)
    .filter((a): a is Author => Boolean(a?.username))
    .map((a) => ({
      username: a.username!,
      displayName: a.display_name ?? "",
      bio: (a.bio ?? "").slice(0, 200),
      verified: Boolean(a.verified),
      followers: a.followers ?? 0,
    }));
}

interface Disambiguation {
  username: string | null;
  confidence: number;
  reason: string;
}

const DISAMBIGUATION_SYSTEM = `You identify the official Instagram account of music artists for a concert booking agency
operating in the French/international rap and afrobeats scene. Given the artist name and candidate accounts,
reply strict JSON: {"username": string|null, "confidence": number, "reason": string}.
Use your knowledge of the music scene (group affiliations, labels, aliases, booking contacts in bios).
Pick null if no candidate is plausibly the official account of that music artist.
Beware of same-named celebrities from other fields — choosing the wrong person is far worse than choosing none.`;

/**
 * Resolve which candidate account actually belongs to the artist. A text model over profile
 * metadata is far more reliable here than face recognition — validated on the Leto case,
 * where the reasoning model correctly picked letopsothug over Jared Leto via PSO Thug / label
 * knowledge (originally run on DeepSeek-V4-Pro via Nebius; ported to Groq 2026-07-10 after a
 * stale Nebius key took down every VLM-dependent tier — see groq.ts).
 */
export async function resolveOfficialAccount(
  artistName: string,
  candidates: InstagramCandidate[]
): Promise<{ username: string; confidence: number } | null> {
  if (candidates.length === 0) return null;
  const payload = {
    artist: artistName,
    context: "music artist booked by Amaze Live, an international nightlife/concert agency (Europe, Morocco, Middle East, Africa)",
    candidates,
  };
  const models = [GROQ_MODELS.reasoner, GROQ_MODELS.reasonerFallback];
  for (const model of models) {
    try {
      const pick = await groqChatJSON<Disambiguation>(model, [
        { role: "system", content: DISAMBIGUATION_SYSTEM },
        { role: "user", content: JSON.stringify(payload) },
      ]);
      if (pick.username && pick.confidence >= 0.7 && candidates.some((c) => c.username === pick.username)) {
        return { username: pick.username, confidence: pick.confidence };
      }
      return null; // a confident "none of these" is an answer, not an error — don't escalate
    } catch {
      // model unavailable — try the fallback
    }
  }
  return null;
}

/** Fetch profile picture URL for a known Instagram handle. */
export async function getInstagramProfilePhoto(handle: string): Promise<string | null> {
  const data = await scRequest<ProfileResponse>("instagram", "profile", { handle });
  return data?.data?.author?.avatar_url ?? null;
}

/** Recent post photo candidates for a handle — higher-res than avatars (which cap ~320px). */
export async function getInstagramPostPhotos(handle: string, max = 3): Promise<string[]> {
  const data = await scRequest<ProfilePostsResponse>("instagram", "profile/posts", { handle });
  const items = data?.data?.items ?? [];
  return items
    .map((i) => i.post?.content?.thumbnail_url)
    .filter((u): u is string => typeof u === "string" && u.startsWith("http"))
    .slice(0, max);
}
