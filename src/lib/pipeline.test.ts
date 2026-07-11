import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockRow } from "./test-utils/supabaseMock";
import type { EventRow } from "./supabase";

vi.mock("./supabase", () => ({
  supabaseAdmin: { from: vi.fn(), storage: { from: vi.fn() } },
}));
vi.mock("./photo", () => ({
  lookupArtistPhoto: vi.fn(),
  treatArtistPhoto: vi.fn(),
}));
vi.mock("./groq", () => ({ generateEventCopy: vi.fn() }));
vi.mock("./poster/render", () => ({ renderPoster: vi.fn() }));
vi.mock("./errorTracking", () => ({ captureGenerationFailure: vi.fn() }));

import { generatePosterForEvent } from "./pipeline";
import { supabaseAdmin } from "./supabase";
import { lookupArtistPhoto, treatArtistPhoto } from "./photo";
import { generateEventCopy } from "./groq";
import { renderPoster } from "./poster/render";
import { captureGenerationFailure } from "./errorTracking";

const fromMock = vi.mocked(supabaseAdmin.from);
const storageFromMock = vi.mocked(supabaseAdmin.storage.from);
const lookupArtistPhotoMock = vi.mocked(lookupArtistPhoto);
const treatArtistPhotoMock = vi.mocked(treatArtistPhoto);
const generateEventCopyMock = vi.mocked(generateEventCopy);
const renderPosterMock = vi.mocked(renderPoster);
const captureGenerationFailureMock = vi.mocked(captureGenerationFailure);

const EVENT: EventRow = {
  id: "evt-1",
  event_date: "2026-08-14",
  artist_name_raw: "Freeze Corleone 667",
  artist_id: null,
  venue: "Secret Room",
  city: "Marrakech",
  utility_line: null,
  status: "generating",
  error_message: null,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-10T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generatePosterForEvent", () => {
  it("reports 'Event not found' when the id doesn't exist", async () => {
    fromMock.mockReturnValueOnce(mockRow(null, null) as never); // claim finds nothing
    fromMock.mockReturnValueOnce(mockRow(null, null) as never); // existence check: also nothing

    const result = await generatePosterForEvent("missing-id");

    expect(result).toEqual({ error: "Event not found" });
  });

  it("refuses to double-run: an unclaimed row that does exist means it's already generating", async () => {
    // The atomic UPDATE...WHERE matched zero rows (claim failed), but the row is there —
    // the only reason the claim fails for an existing row is the lock being held and fresh.
    fromMock.mockReturnValueOnce(mockRow(null, null) as never); // claim fails
    fromMock.mockReturnValueOnce(mockRow({ id: "evt-1" }, null) as never); // row exists

    const result = await generatePosterForEvent("evt-1");

    expect(result).toEqual({ error: "Generation already in progress for this event — try again shortly." });
    expect(lookupArtistPhotoMock).not.toHaveBeenCalled();
  });

  it("surfaces the claim query's own error directly, and reports it", async () => {
    fromMock.mockReturnValueOnce(mockRow(null, { message: "connection reset" }) as never);

    const result = await generatePosterForEvent("evt-1");

    expect(result).toEqual({ error: "connection reset" });
    expect(captureGenerationFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "connection reset" }),
      expect.objectContaining({ eventId: "evt-1", stage: "claim" })
    );
  });

  it("flags photo_missing and stops when no photo can be sourced, without reporting it as an error", async () => {
    fromMock.mockReturnValueOnce(mockRow(EVENT, null) as never); // claim succeeds
    lookupArtistPhotoMock.mockResolvedValue({ photoUrl: null, source: "none" });
    fromMock.mockReturnValueOnce(mockRow(null, null) as never); // status -> photo_missing

    const result = await generatePosterForEvent("evt-1");

    expect(result).toEqual({ error: "No photo found — flagged for manual upload" });
    expect(renderPosterMock).not.toHaveBeenCalled();
    // an artist with no findable photo is a routine, expected outcome — not a bug to page anyone about
    expect(captureGenerationFailureMock).not.toHaveBeenCalled();
  });

  it("renders with the requested variant, uploads, and marks the event done", async () => {
    fromMock.mockReturnValueOnce(mockRow(EVENT, null) as never); // claim
    lookupArtistPhotoMock.mockResolvedValue({ photoUrl: "https://x/photo.jpg", source: "manual" });
    generateEventCopyMock.mockResolvedValue({
      artistName: "Freeze Corleone 667",
      utilityLine: "SECRET ROOM — MARRAKECH — AUGUST 14",
      tagline: "LEGEND NEVER ENDS",
    });
    treatArtistPhotoMock.mockResolvedValue({ subject: Buffer.from("s"), backdrop: Buffer.from("b"), portrait: Buffer.from("p") });
    fromMock.mockReturnValueOnce(mockRow({ id: "artist-1" }, null) as never); // artist lookup
    renderPosterMock.mockResolvedValue(Buffer.from("poster-bytes"));
    storageFromMock.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://cdn/poster.png" } }),
    } as never);
    fromMock.mockReturnValueOnce(mockRow(null, null) as never); // posters insert
    fromMock.mockReturnValueOnce(mockRow(null, null) as never); // final status -> done

    const result = await generatePosterForEvent("evt-1", "flyer");

    expect(result).toEqual({ posterUrl: "https://cdn/poster.png" });
    expect(renderPosterMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "flyer" }));
  });

  it("defaults to the masthead variant when none is requested", async () => {
    fromMock.mockReturnValueOnce(mockRow(EVENT, null) as never);
    lookupArtistPhotoMock.mockResolvedValue({ photoUrl: "https://x/photo.jpg", source: "manual" });
    generateEventCopyMock.mockResolvedValue({ artistName: "X", utilityLine: "U", tagline: "" });
    treatArtistPhotoMock.mockResolvedValue({ subject: Buffer.from("s"), backdrop: Buffer.from("b"), portrait: Buffer.from("p") });
    fromMock.mockReturnValueOnce(mockRow(null, null) as never);
    renderPosterMock.mockResolvedValue(Buffer.from("poster-bytes"));
    storageFromMock.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://cdn/poster.png" } }),
    } as never);
    fromMock.mockReturnValueOnce(mockRow(null, null) as never);
    fromMock.mockReturnValueOnce(mockRow(null, null) as never);

    await generatePosterForEvent("evt-1");

    expect(renderPosterMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "masthead" }));
  });

  it("falls back to deterministic copy when Groq fails, instead of failing the whole run", async () => {
    fromMock.mockReturnValueOnce(mockRow(EVENT, null) as never);
    lookupArtistPhotoMock.mockResolvedValue({ photoUrl: "https://x/photo.jpg", source: "manual" });
    generateEventCopyMock.mockRejectedValue(new Error("GROQ_API_KEY is not set"));
    treatArtistPhotoMock.mockResolvedValue({ subject: Buffer.from("s"), backdrop: Buffer.from("b"), portrait: Buffer.from("p") });
    fromMock.mockReturnValueOnce(mockRow(null, null) as never);
    renderPosterMock.mockResolvedValue(Buffer.from("poster-bytes"));
    storageFromMock.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://cdn/poster.png" } }),
    } as never);
    fromMock.mockReturnValueOnce(mockRow(null, null) as never);
    fromMock.mockReturnValueOnce(mockRow(null, null) as never);

    const result = await generatePosterForEvent("evt-1");

    expect(result).toEqual({ posterUrl: "https://cdn/poster.png" });
    expect(renderPosterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        artistName: "Freeze Corleone 667",
        // unlike Groq's all-caps house style, the deterministic fallback deliberately keeps
        // venue/city as given and only uppercases the month — see fallbackUtilityLine in pipeline.ts
        utilityLine: "Secret Room — Marrakech — AUGUST 14",
        tagline: "",
      })
    );
  });

  it("marks the event failed and returns the error when storage upload fails", async () => {
    fromMock.mockReturnValueOnce(mockRow(EVENT, null) as never);
    lookupArtistPhotoMock.mockResolvedValue({ photoUrl: "https://x/photo.jpg", source: "manual" });
    generateEventCopyMock.mockResolvedValue({ artistName: "X", utilityLine: "U", tagline: "" });
    treatArtistPhotoMock.mockResolvedValue({ subject: Buffer.from("s"), backdrop: Buffer.from("b"), portrait: Buffer.from("p") });
    fromMock.mockReturnValueOnce(mockRow(null, null) as never); // artist lookup
    renderPosterMock.mockResolvedValue(Buffer.from("poster-bytes"));
    storageFromMock.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: { message: "bucket quota exceeded" } }),
      getPublicUrl: vi.fn(),
    } as never);
    fromMock.mockReturnValueOnce(mockRow(null, null) as never); // status -> failed

    const result = await generatePosterForEvent("evt-1");

    expect(result).toEqual({ error: "Storage upload failed: bucket quota exceeded" });
    expect(captureGenerationFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Storage upload failed: bucket quota exceeded" }),
      expect.objectContaining({ eventId: "evt-1", artistName: EVENT.artist_name_raw, stage: "generation" })
    );
  });

  it("marks the event failed and captures the error message when rendering throws", async () => {
    fromMock.mockReturnValueOnce(mockRow(EVENT, null) as never);
    lookupArtistPhotoMock.mockResolvedValue({ photoUrl: "https://x/photo.jpg", source: "manual" });
    generateEventCopyMock.mockResolvedValue({ artistName: "X", utilityLine: "U", tagline: "" });
    treatArtistPhotoMock.mockResolvedValue({ subject: Buffer.from("s"), backdrop: Buffer.from("b"), portrait: Buffer.from("p") });
    fromMock.mockReturnValueOnce(mockRow(null, null) as never); // artist lookup
    renderPosterMock.mockRejectedValue(new Error("canvas allocation failed"));
    // capture what the failure branch actually writes, not just that something was written
    const failedUpdate = vi.fn();
    fromMock.mockImplementationOnce(
      () =>
        ({
          update: (payload: unknown) => {
            failedUpdate(payload);
            return { eq: () => Promise.resolve({ data: null, error: null }) };
          },
        }) as never
    );

    const result = await generatePosterForEvent("evt-1");

    expect(result).toEqual({ error: "canvas allocation failed" });
    expect(failedUpdate).toHaveBeenCalledWith({ status: "failed", error_message: "canvas allocation failed" });
    expect(captureGenerationFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "canvas allocation failed" }),
      expect.objectContaining({ eventId: "evt-1", artistName: EVENT.artist_name_raw, stage: "generation" })
    );
  });
});
