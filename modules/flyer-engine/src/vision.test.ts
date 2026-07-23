import { describe, it, expect } from "vitest";
import { passesAutoSourceGate, passesWebSearchGate, type PhotoScreenResult } from "./vision";

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

describe("passesAutoSourceGate", () => {
  it("passes a clean photo above the quality floor", () => {
    expect(passesAutoSourceGate(screen())).toBe(true);
  });

  it("rejects when no person is present", () => {
    expect(passesAutoSourceGate(screen({ personPresent: false }))).toBe(false);
  });

  it("rejects when the VLM flags a different recognizable public figure", () => {
    expect(passesAutoSourceGate(screen({ differentFamousPerson: true }))).toBe(false);
  });

  it("rejects designed graphics (flyers, album covers, screenshots)", () => {
    expect(passesAutoSourceGate(screen({ isGraphic: true }))).toBe(false);
  });

  it("enforces the 0.55 quality floor at the boundary", () => {
    expect(passesAutoSourceGate(screen({ posterQuality: 0.54 }))).toBe(false);
    expect(passesAutoSourceGate(screen({ posterQuality: 0.55 }))).toBe(true);
  });
});

describe("passesWebSearchGate", () => {
  it("rejects whatever the auto-source gate would reject, even with a matching name", () => {
    const result = screen({ isGraphic: true, recognizedAs: "Booba" });
    expect(passesWebSearchGate(result, "Booba")).toBe(false);
  });

  it("rejects when the VLM couldn't positively identify anyone, even if the base checks pass", () => {
    // this is the case a negative-only gate would wrongly let through — no account to anchor
    // identity to, so an unrecognized face is not enough for a web-search-sourced photo.
    const result = screen({ recognizedAs: null });
    expect(passesWebSearchGate(result, "Some Rare Artist")).toBe(false);
  });

  it("rejects a photo of a real but different, unflagged person (the Paul Wall / Booba case)", () => {
    // The VLM recognized *someone* but didn't flag them as "differentFamousPerson" (it didn't
    // know they were famous) — this is exactly the failure mode that shipped a Paul Wall photo
    // for a Booba search. The positive-ID gate must still reject it.
    const result = screen({ recognizedAs: "Paul Wall" });
    expect(passesWebSearchGate(result, "Booba")).toBe(false);
  });

  it("accepts an exact name match", () => {
    const result = screen({ recognizedAs: "Booba" });
    expect(passesWebSearchGate(result, "Booba")).toBe(true);
  });

  it("accepts when the recognized name is a substring of a longer claimed name", () => {
    // "Freeze Corleone 667" normalizes to "freezecorleone667"; the VLM might only surface
    // "Freeze Corleone" — that should still count as a match.
    const result = screen({ recognizedAs: "Freeze Corleone" });
    expect(passesWebSearchGate(result, "Freeze Corleone 667")).toBe(true);
  });

  it("matches case-insensitively and ignores accents/punctuation", () => {
    const result = screen({ recognizedAs: "NINHO" });
    expect(passesWebSearchGate(result, "  Ninho!  ")).toBe(true);
  });

  it("rejects a completely unrelated name", () => {
    const result = screen({ recognizedAs: "Jared Leto" });
    expect(passesWebSearchGate(result, "Some Other Rapper")).toBe(false);
  });
});
