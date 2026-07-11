// Amaze Live brand system — Brand Book Edition 01, 2026 + client-approved reference set
// (Freeze Corleone 667 / Booba / SCH / NINHO / JUL / GAZO / Dopebwoy posters, 2026-07-09).

export const COLOR = {
  ink: "#0B0B0A", // primary dark ground — 60%
  offWhite: "#F5F2EA", // primary light ground — 25%
  concrete: "#8A867E", // secondary/neutral — 10%
  gold: "#AD8A3E", // signature accent — 5%, exactly once, never a background
} as const;

export const FONT = {
  display: "Anton", // closest free condensed heavyweight all-caps face to Impact
  body: "Arimo", // Arial-metric-compatible
} as const;

// Canvas: 4:5, safe for social + print crop. Safe margin is 5% of width, per brand grid.
// Bumped 2x (2026-07-11) — 1080x1350 was fine for a phone screen but soft once actually printed
// or viewed full-size; every draw call already scales off `width`/`height`/`margin` rather than
// hardcoded pixel values, so this is a real resolution increase with no layout math to redo.
export const CANVAS = {
  width: 2160,
  height: 2700,
  get margin() {
    return Math.round(this.width * 0.05);
  },
} as const;

// The agency's standing manifesto lines, verbatim from the approved references.
export const MANIFESTO = ["THE CULTURE.", "THE VISION.", "THE MOVEMENT."] as const;
export const KICKER = "AMAZE LIVE PRESENTS";
export const WORLDWIDE = ["WORLDWIDE", "MOVEMENT"] as const;
export const CITY_STACK = ["PARIS", "MIAMI", "DUBAI", "LONDON", "MARRAKECH"] as const;

// Coordinate stamps for the corner metadata block, as seen on the references
// (e.g. "48.8566° N / 2.3522° E" on the Booba poster = Paris).
const CITY_COORDS: Record<string, [string, string]> = {
  paris: ["48.8566° N", "2.3522° E"],
  marrakech: ["31.6295° N", "7.9811° W"],
  marrakesh: ["31.6295° N", "7.9811° W"],
  casablanca: ["33.5731° N", "7.5898° W"],
  rabat: ["34.0209° N", "6.8416° W"],
  agadir: ["30.4278° N", "9.5981° W"],
  tangier: ["35.7595° N", "5.8340° W"],
  dubai: ["25.2048° N", "55.2708° E"],
  "abu dhabi": ["24.4539° N", "54.3773° E"],
  riyadh: ["24.7136° N", "46.6753° E"],
  london: ["51.5074° N", "0.1278° W"],
  miami: ["25.7617° N", "80.1918° W"],
  marseille: ["43.2965° N", "5.3698° E"],
  lyon: ["45.7640° N", "4.8357° E"],
  brussels: ["50.8503° N", "4.3517° E"],
  amsterdam: ["52.3676° N", "4.9041° E"],
  geneva: ["46.2044° N", "6.1432° E"],
  ibiza: ["38.9067° N", "1.4206° E"],
  cairo: ["30.0444° N", "31.2357° E"],
  dakar: ["14.7167° N", "17.4677° W"],
  abidjan: ["5.3600° N", "4.0083° W"],
  lagos: ["6.5244° N", "3.3792° E"],
};

export function coordsForCity(city: string): [string, string] | null {
  return CITY_COORDS[city.trim().toLowerCase()] ?? null;
}

/** Year as roman numerals — the references stamp the year as MMXXIV etc. */
export function romanYear(year: number): string {
  const table: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let n = year;
  let out = "";
  for (const [value, numeral] of table) {
    while (n >= value) {
      out += numeral;
      n -= value;
    }
  }
  return out;
}
