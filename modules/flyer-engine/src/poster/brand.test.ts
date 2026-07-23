import { describe, it, expect } from "vitest";
import { coordsForCity, romanYear } from "./brand";

describe("coordsForCity", () => {
  it("returns coordinates for a known city", () => {
    expect(coordsForCity("Marrakech")).toEqual(["31.6295° N", "7.9811° W"]);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(coordsForCity("  PARIS  ")).toEqual(["48.8566° N", "2.3522° E"]);
  });

  it("returns null for an unknown city", () => {
    expect(coordsForCity("Atlantis")).toBeNull();
  });
});

describe("romanYear", () => {
  it.each([
    [2026, "MMXXVI"],
    [2024, "MMXXIV"],
    [1994, "MCMXCIV"],
    [44, "XLIV"],
    [9, "IX"],
    [1, "I"],
  ])("renders %i as %s", (year, expected) => {
    expect(romanYear(year)).toBe(expected);
  });
});
