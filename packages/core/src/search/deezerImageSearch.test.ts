import { describe, it, expect, vi, beforeEach } from "vitest";
import { findArtistPhotoViaDeezer } from "./deezerImageSearch";

beforeEach(() => {
  vi.unstubAllGlobals();
});

function mockDeezerResponse(data: Array<{ id: number; name: string; picture_xl?: string; picture_big?: string }>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data }),
    })
  );
}

describe("findArtistPhotoViaDeezer", () => {
  it("returns picture_xl for an exact name match", async () => {
    mockDeezerResponse([{ id: 1, name: "Niro", picture_xl: "https://deezer/niro-xl.jpg", picture_big: "https://deezer/niro-big.jpg" }]);
    expect(await findArtistPhotoViaDeezer("Niro")).toBe("https://deezer/niro-xl.jpg");
  });

  it("falls back to picture_big when picture_xl is missing", async () => {
    mockDeezerResponse([{ id: 1, name: "Niro", picture_big: "https://deezer/niro-big.jpg" }]);
    expect(await findArtistPhotoViaDeezer("Niro")).toBe("https://deezer/niro-big.jpg");
  });

  it("matches case-insensitively and ignores accents", async () => {
    mockDeezerResponse([{ id: 1, name: "NIRO", picture_xl: "https://deezer/niro-xl.jpg" }]);
    expect(await findArtistPhotoViaDeezer("  niro  ")).toBe("https://deezer/niro-xl.jpg");
  });

  it("returns null when no candidate's name matches", async () => {
    mockDeezerResponse([{ id: 1, name: "Someone Else Entirely", picture_xl: "https://deezer/x.jpg" }]);
    expect(await findArtistPhotoViaDeezer("Niro")).toBeNull();
  });

  it("returns null when the catalog has no results", async () => {
    mockDeezerResponse([]);
    expect(await findArtistPhotoViaDeezer("Some Obscure Name")).toBeNull();
  });

  it("returns null when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await findArtistPhotoViaDeezer("Niro")).toBeNull();
  });
});
