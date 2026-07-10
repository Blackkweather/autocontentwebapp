import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockRow } from "./test-utils/supabaseMock";
import type { PhotoScreenResult } from "./vision";

vi.mock("./supabase", () => ({
  supabaseAdmin: { from: vi.fn(), storage: { from: vi.fn() } },
}));
vi.mock("./socialcrawl", () => ({
  searchInstagramCandidates: vi.fn(),
  resolveOfficialAccount: vi.fn(),
  getInstagramPostPhotos: vi.fn(),
  getInstagramProfilePhoto: vi.fn(),
}));
vi.mock("./googleImageSearch", () => ({ findArtistPhotosViaGoogle: vi.fn() }));
vi.mock("./braveImageSearch", () => ({ findArtistPhotosViaBrave: vi.fn() }));
// Real gate logic (passesAutoSourceGate/passesWebSearchGate) stays wired up — only the network-
// calling screenPhoto is mocked — so these tests exercise the actual trust-ladder decisions,
// not a stand-in for them.
vi.mock("./vision", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./vision")>();
  return { ...actual, screenPhoto: vi.fn() };
});

import { lookupArtistPhoto } from "./photo";
import { supabaseAdmin } from "./supabase";
import { searchInstagramCandidates, resolveOfficialAccount, getInstagramPostPhotos } from "./socialcrawl";
import { findArtistPhotosViaGoogle } from "./googleImageSearch";
import { findArtistPhotosViaBrave } from "./braveImageSearch";
import { screenPhoto } from "./vision";

const fromMock = vi.mocked(supabaseAdmin.from);
const searchInstagramCandidatesMock = vi.mocked(searchInstagramCandidates);
const resolveOfficialAccountMock = vi.mocked(resolveOfficialAccount);
const getInstagramPostPhotosMock = vi.mocked(getInstagramPostPhotos);
const findArtistPhotosViaGoogleMock = vi.mocked(findArtistPhotosViaGoogle);
const findArtistPhotosViaBraveMock = vi.mocked(findArtistPhotosViaBrave);
const screenPhotoMock = vi.mocked(screenPhoto);

function screen(overrides: Partial<PhotoScreenResult> = {}): PhotoScreenResult {
  return {
    personPresent: true,
    singleSubject: true,
    differentFamousPerson: false,
    isGraphic: false,
    recognizedAs: null,
    posterQuality: 0.7,
    reason: "",
    ...overrides,
  };
}

/** Routes fetch + screenPhoto by URL, so each candidate can be scripted independently even
 *  though the real code screens them all concurrently. */
function wireScreensByUrl(results: Record<string, PhotoScreenResult>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode(String(url)).buffer),
      })
    )
  );
  screenPhotoMock.mockImplementation(async (buffer: Buffer) => {
    const url = Buffer.from(buffer).toString();
    return results[url] ?? screen({ personPresent: false });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  searchInstagramCandidatesMock.mockResolvedValue([]);
  resolveOfficialAccountMock.mockResolvedValue(null);
  findArtistPhotosViaGoogleMock.mockResolvedValue([]);
  findArtistPhotosViaBraveMock.mockResolvedValue([]);
});

const ARTIST_NO_HISTORY = { id: "artist-1", photo_url: null, vlm_checked: false };

describe("lookupArtistPhoto — trust ladder", () => {
  it("prefers the manual library over every auto-sourced tier", async () => {
    fromMock.mockReturnValueOnce(mockRow(ARTIST_NO_HISTORY, null) as never); // upsertArtist
    fromMock.mockReturnValueOnce(
      mockRow(
        [
          { id: "p1", url: "https://x/p1.jpg", quality_score: 0.9 },
          { id: "p2", url: "https://x/p2.jpg", quality_score: 0.4 },
        ],
        null
      ) as never
    ); // library, already scored — no VLM calls needed

    const result = await lookupArtistPhoto("Some Artist");

    expect(result).toEqual({ photoUrl: "https://x/p1.jpg", source: "manual" });
    expect(searchInstagramCandidatesMock).not.toHaveBeenCalled();
    expect(findArtistPhotosViaGoogleMock).not.toHaveBeenCalled();
  });

  it("uses the cached verified photo before touching any external source", async () => {
    fromMock.mockReturnValueOnce(
      mockRow({ id: "artist-1", photo_url: "https://cached/img.jpg", vlm_checked: true }, null) as never
    );
    fromMock.mockReturnValueOnce(mockRow([], null) as never); // no manual library

    const result = await lookupArtistPhoto("Some Artist");

    expect(result).toEqual({ photoUrl: "https://cached/img.jpg", source: "database" });
    expect(searchInstagramCandidatesMock).not.toHaveBeenCalled();
  });

  it("picks the highest-quality passing frame among SocialCrawl candidates screened in parallel", async () => {
    fromMock.mockReturnValueOnce(mockRow(ARTIST_NO_HISTORY, null) as never);
    fromMock.mockReturnValueOnce(mockRow([], null) as never);
    searchInstagramCandidatesMock.mockResolvedValue([
      { username: "real_artist", displayName: "", bio: "", verified: true, followers: 1000 },
    ]);
    resolveOfficialAccountMock.mockResolvedValue({ username: "real_artist", confidence: 0.9 });
    getInstagramPostPhotosMock.mockResolvedValue(["https://ig/1.jpg", "https://ig/2.jpg", "https://ig/3.jpg"]);
    wireScreensByUrl({
      "https://ig/1.jpg": screen({ posterQuality: 0.6 }),
      "https://ig/2.jpg": screen({ posterQuality: 0.85 }), // highest quality passing frame — should win
      "https://ig/3.jpg": screen({ personPresent: false }), // fails the gate entirely
    });
    fromMock.mockReturnValueOnce(mockRow(null, null) as never); // saveVerifiedPhoto

    const result = await lookupArtistPhoto("Some Artist");

    expect(result).toEqual({ photoUrl: "https://ig/2.jpg", source: "socialcrawl" });
  });

  it("requires a positive name match for Google results — rejects a different recognized person (the Paul Wall / Booba case)", async () => {
    fromMock.mockReturnValueOnce(mockRow(ARTIST_NO_HISTORY, null) as never);
    fromMock.mockReturnValueOnce(mockRow([], null) as never);
    findArtistPhotosViaGoogleMock.mockResolvedValue(["https://g/1.jpg", "https://g/2.jpg", "https://g/3.jpg"]);
    wireScreensByUrl({
      // recognized as someone else entirely — must be rejected even though it otherwise passes
      "https://g/1.jpg": screen({ recognizedAs: "Paul Wall", posterQuality: 0.9 }),
      // first frame that actually names the claimed artist — should win despite lower quality
      "https://g/2.jpg": screen({ recognizedAs: "Booba", posterQuality: 0.7 }),
      // would also pass and scores highest, but comes after g/2 — must NOT be picked, proving
      // "first passing in order" (not "best of") is preserved after parallelizing the screen
      "https://g/3.jpg": screen({ recognizedAs: "Booba", posterQuality: 0.99 }),
    });
    fromMock.mockReturnValueOnce(mockRow(null, null) as never); // saveVerifiedPhoto

    const result = await lookupArtistPhoto("Booba");

    expect(result).toEqual({ photoUrl: "https://g/2.jpg", source: "google_cse" });
  });

  it("falls through every tier to 'none' when nothing passes, and flags the artist accordingly", async () => {
    fromMock.mockReturnValueOnce(mockRow(ARTIST_NO_HISTORY, null) as never);
    fromMock.mockReturnValueOnce(mockRow([], null) as never);
    fromMock.mockReturnValueOnce(mockRow(null, null) as never); // final "source: none" update

    const result = await lookupArtistPhoto("Nobody Findable");

    expect(result).toEqual({ photoUrl: null, source: "none" });
    expect(fromMock).toHaveBeenLastCalledWith("artists");
  });
});
