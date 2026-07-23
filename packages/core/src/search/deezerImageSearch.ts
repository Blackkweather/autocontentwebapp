// Deezer's public artist search — free, no API key, no rate-limit signup required (public
// endpoints allow ~50 req/5s per IP, far more than this pipeline needs). Deezer's catalog has
// particularly strong coverage of the French/francophone rap scene this app targets, often
// better than Spotify's for that specific niche. Returns each artist's official profile photo
// (picture_xl, 1000x1000) directly tied to a real catalog entry — no scraping, no key rotation.

interface DeezerArtist {
  id: number;
  name: string;
  picture_xl?: string;
  picture_big?: string;
}

interface DeezerSearchResponse {
  data?: DeezerArtist[];
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Best-matching artist photo from Deezer's catalog, or null if no name-matching artist exists. */
export async function findArtistPhotoViaDeezer(artistName: string): Promise<string | null> {
  const res = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=5`);
  if (!res.ok) return null;
  const data = (await res.json()) as DeezerSearchResponse;
  const candidates = data.data ?? [];

  const claimed = normalize(artistName);
  const match = candidates.find((a) => {
    const candidate = normalize(a.name);
    return candidate.length > 0 && (candidate === claimed || candidate.includes(claimed) || claimed.includes(candidate));
  });
  if (!match) return null;

  return match.picture_xl || match.picture_big || null;
}
