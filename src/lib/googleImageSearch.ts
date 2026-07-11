// Google Custom Search (Image mode) — fallback artist photo source when SocialCrawl has nothing.

const API_KEY = process.env.GOOGLE_CSE_API_KEY || "";
const CX = process.env.GOOGLE_CSE_CX || "";

interface GoogleImageItem {
  link: string;
  image?: { contextLink?: string };
}

/** Search Google Images for real photos of the artist. Returns direct image URLs, best-first.
 *  Biased toward live/stage shots rather than studio press photos — a stage photo already has a
 *  dark background and dramatic lighting, which is exactly what the poster's vignette treatment
 *  (src/lib/poster/draw-helpers.ts's drawPhotoVignette) needs to look right; a flat studio
 *  headshot vignettes far less convincingly. */
export async function findArtistPhotosViaGoogle(artistName: string, max = 3): Promise<string[]> {
  if (!API_KEY || !CX) return [];
  const query = `${artistName} live concert stage performance photo`;
  const url = `https://www.googleapis.com/customsearch/v1?key=${API_KEY}&cx=${CX}&searchType=image&q=${encodeURIComponent(query)}&num=${Math.max(max, 3)}&safe=active`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: GoogleImageItem[] };
  return (data.items ?? []).map((i) => i.link).filter(Boolean).slice(0, max);
}
