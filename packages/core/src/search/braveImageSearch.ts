// Brave Search API (Image mode) — second-tier fallback artist photo source.
//
// Why this exists: Pinterest's official API only searches the *authenticated user's own*
// pins (no public cross-platform search — confirmed against their v5 docs), so it can't
// serve as a lookup source at all. Bing Image Search API was retired by Microsoft in
// August 2025. Brave Search is the remaining actively-maintained, official image search
// API with a real (if small) free credit tier — genuinely stable, not a scraper.
//
// Endpoint confirmed against https://api-dashboard.search.brave.com/app/documentation/image-search:
//   GET https://api.search.brave.com/res/v1/images/search
//   header: X-Subscription-Token
//   result image URL: item.properties.url

const API_KEY = process.env.BRAVE_API_KEY || "";

interface BraveImageResult {
  properties?: { url?: string };
}

/** Search Brave Images for real photos of the artist. Returns direct image URLs, best-first.
 *  Biased toward live/stage shots rather than studio press photos — same reasoning as
 *  googleImageSearch.ts: a stage photo's own dark background and dramatic lighting is what the
 *  poster's vignette treatment needs to read as photography, not a flat studio headshot. */
export async function findArtistPhotosViaBrave(artistName: string, max = 3): Promise<string[]> {
  if (!API_KEY) return [];
  const query = `${artistName} live concert stage performance photo`;
  const url = `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(query)}&count=${Math.max(max, 5)}&safesearch=strict`;
  const res = await fetch(url, { headers: { "X-Subscription-Token": API_KEY, Accept: "application/json" } });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: BraveImageResult[] };
  return (data.results ?? [])
    .map((r) => r.properties?.url)
    .filter((u): u is string => typeof u === "string" && u.startsWith("http"))
    .slice(0, max);
}
