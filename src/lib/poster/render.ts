import { createCanvas, loadImage, type SKRSContext2D, type Image } from "@napi-rs/canvas";
import { COLOR, CANVAS, MANIFESTO, KICKER, WORLDWIDE, CITY_STACK, coordsForCity, romanYear } from "./brand";
import { ensureFontsRegistered } from "./fonts";
import { getPaperTexture } from "./texture";
import {
  drawTrackedText,
  drawTrackedBlock,
  drawSkewedDisplayLine,
  drawDistressedDisplayLine,
  measureDisplay,
  drawRadialGlow,
  drawCrosshair,
  drawGlobeIcon,
  drawEyeGlobeIcon,
  drawLogoMark,
  drawBarcodeTag,
  drawScratches,
  drawDust,
  applyFilmGrain,
  applyVignette,
} from "./draw-helpers";

export type PosterVariant = "masthead" | "light" | "flyer" | "halo";

export interface RenderPosterInput {
  artistName: string;
  utilityLine: string; // e.g. "SECRET ROOM — MARRAKECH — JULY 19"
  tagline?: string; // e.g. "LEGEND NEVER ENDS"
  subject: Buffer; // trimmed transparent-background cutout, high-contrast B&W
  backdrop?: Buffer; // original photo, darkened — the environment layer
  city: string;
  eventDate: string; // ISO date
  variant?: PosterVariant;
}

/** Dispatches to one of four layouts — same brand system (colors/fonts/grain/corner metadata
 *  vocabulary), different composition, matching the range across the client's reference set. */
export async function renderPoster(input: RenderPosterInput): Promise<Buffer> {
  ensureFontsRegistered();
  const variant = input.variant ?? "masthead";
  const ctx = await setupCanvas();
  const subjectImg = await loadImage(input.subject);
  const backdropImg = input.backdrop ? await loadImage(input.backdrop).catch(() => null) : null;

  switch (variant) {
    case "light":
      await renderLight(ctx.ctx, input, subjectImg);
      break;
    case "flyer":
      await renderFlyer(ctx.ctx, input, subjectImg, backdropImg);
      break;
    case "halo":
      await renderHalo(ctx.ctx, input, subjectImg, backdropImg);
      break;
    case "masthead":
    default:
      await renderMasthead(ctx.ctx, input, subjectImg, backdropImg);
      break;
  }

  return ctx.canvas.toBuffer("image/png");
}

async function setupCanvas() {
  const { width, height } = CANVAS;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  return { canvas, ctx };
}

// ─────────────────────────────────────────────────────────────────────────
// Variant 1 — "masthead": giant AMAZE LIVE overlapped by the subject, dark ground.
// ─────────────────────────────────────────────────────────────────────────
async function renderMasthead(ctx: SKRSContext2D, input: RenderPosterInput, subjectImg: Image, backdropImg: Image | null) {
  const { width, height, margin } = CANVAS;

  ctx.fillStyle = COLOR.ink;
  ctx.fillRect(0, 0, width, height);
  await drawGroundTexture(ctx, "overlay", 0.4);

  if (backdropImg) {
    drawCoverImage(ctx, backdropImg, width, height, 0.32);
  }
  ctx.fillStyle = "rgba(11,11,10,0.58)";
  ctx.fillRect(0, 0, width, height);
  fillGradient(ctx, 0, height * 0.45, 0, height, "rgba(11,11,10,0)", "rgba(11,11,10,0.85)", width, height * 0.55, height * 0.45);

  drawRadialGlow(ctx, width / 2, height * 0.46, width * 0.58, 0.3);
  drawRadialGlow(ctx, width / 2, height * 0.44, width * 0.26, 0.22);

  const ghostSize = fitDisplaySize(ctx, input.artistName, width * 0.98, 400);
  drawSkewedDisplayLine(ctx, input.artistName, width / 2, height * 0.55, {
    size: ghostSize,
    color: COLOR.offWhite,
    alpha: 0.04,
    skew: -0.12,
  });

  const amazeSize = fitDisplaySize(ctx, "AMAZE", width * 0.86, 300);
  const lineGap = amazeSize * 0.92;
  const headlineBaseline = margin + 112 + amazeSize * 0.72;
  await drawDistressedDisplayLine(ctx, "AMAZE", width / 2, headlineBaseline, { size: amazeSize, color: COLOR.offWhite, skew: -0.12 });
  await drawDistressedDisplayLine(ctx, "LIVE", width / 2, headlineBaseline + lineGap, { size: amazeSize, color: COLOR.offWhite, skew: -0.12 });

  const liveBaseline = headlineBaseline + lineGap;
  const subjectTop = liveBaseline - lineGap * 0.28;
  const { sw, sh } = fitSubject(subjectImg, width * 0.96, height - subjectTop);
  ctx.drawImage(subjectImg, (width - sw) / 2, height - sh, sw, sh);

  fillGradient(ctx, 0, height - 430, 0, height, "rgba(11,11,10,0)", "rgba(11,11,10,0.9)", width, 430, height - 430, [
    [0.45, "rgba(11,11,10,0.62)"],
  ]);

  const nameBaseline = height - 218;
  drawTextScrim(ctx, nameBaseline - 20, 160, 0.6);
  drawTrackedText(ctx, "LIVE PERFORMANCE BY", width / 2, nameBaseline - 128, {
    size: 15,
    weight: 700,
    color: COLOR.offWhite,
    letterSpacing: 7,
    align: "center",
    shadow: true,
    outline: COLOR.ink,
  });
  const nameSize = fitDisplaySize(ctx, input.artistName, width * 0.8, 120, 14);
  drawSkewedDisplayLine(ctx, input.artistName, width / 2, nameBaseline, {
    size: nameSize,
    color: COLOR.offWhite,
    skew: 0,
    tracking: 14,
    shadow: true,
    outline: COLOR.ink,
  });
  const hasTagline = Boolean(input.tagline?.trim());
  if (hasTagline) {
    drawTrackedText(ctx, input.tagline!, width / 2, nameBaseline + 44, {
      size: 17,
      weight: 700,
      color: COLOR.offWhite,
      letterSpacing: 6,
      align: "center",
      alpha: 0.9,
      shadow: true,
      outline: COLOR.ink,
    });
  }
  const ruleY = nameBaseline + (hasTagline ? 72 : 46);
  drawGoldRule(ctx, width / 2 - 44, ruleY, width / 2 + 44);
  drawTrackedText(ctx, input.utilityLine, width / 2, ruleY + 40, {
    size: 19,
    weight: 700,
    color: COLOR.offWhite,
    letterSpacing: 4,
    align: "center",
    shadow: true,
  });

  drawDarkCornerMetadata(ctx, input);
  applyDistress(ctx, width, height, 0.5, 15);
}

// ─────────────────────────────────────────────────────────────────────────
// Variant 2 — "light": off-white ground editorial (the Booba cream reference).
// ─────────────────────────────────────────────────────────────────────────
async function renderLight(ctx: SKRSContext2D, input: RenderPosterInput, subjectImg: Image) {
  const { width, height, margin } = CANVAS;

  ctx.fillStyle = COLOR.offWhite;
  ctx.fillRect(0, 0, width, height);
  await drawGroundTexture(ctx, "multiply", 0.2);

  const metaY = margin + 26;
  drawLogoMark(ctx, margin, metaY - 8, { size: 30, lines: ["AMAZE LIVE", "PRESENTS"], color: COLOR.ink, align: "left" });
  drawTrackedBlock(ctx, WORLDWIDE, width - margin, metaY, { size: 12, color: COLOR.concrete, letterSpacing: 3, align: "right" });
  drawCrosshair(ctx, margin + 8, metaY + 74, 9, COLOR.concrete, 0.7);
  drawCrosshair(ctx, width - margin - 8, metaY + 74, 9, COLOR.concrete, 0.7);

  const amazeSize = fitDisplaySize(ctx, "AMAZE", width * 0.86, 200);
  const lineGap = amazeSize * 0.92;
  const headlineBaseline = margin + 100 + amazeSize * 0.72;
  await drawDistressedDisplayLine(ctx, "AMAZE", width / 2, headlineBaseline, { size: amazeSize, color: COLOR.ink, skew: -0.12, distressStrength: 0.35 });
  await drawDistressedDisplayLine(ctx, "LIVE", width / 2, headlineBaseline + lineGap, { size: amazeSize, color: COLOR.ink, skew: -0.12, distressStrength: 0.35 });

  const subjectZoneTop = headlineBaseline + lineGap + 10;
  const subjectZoneBottom = height - 230;
  const { sw, sh } = fitSubject(subjectImg, width * 0.85, subjectZoneBottom - subjectZoneTop);
  const sx = (width - sw) / 2;
  const sy = subjectZoneBottom - sh;
  // soft ink contact-shadow grounds the subject on the light ground
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = COLOR.ink;
  ctx.beginPath();
  ctx.ellipse(width / 2, subjectZoneBottom + 6, sw * 0.32, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.drawImage(subjectImg, sx, sy, sw, sh);

  const nameY = height - 190;
  drawTrackedText(ctx, input.artistName, width / 2, nameY, {
    size: 30,
    weight: 700,
    color: COLOR.ink,
    letterSpacing: 4,
    align: "center",
    font: "Anton",
  });
  drawGoldRule(ctx, width / 2 - 30, nameY + 26, width / 2 + 30);
  drawTrackedText(ctx, input.tagline?.trim() || input.utilityLine, width / 2, nameY + 62, {
    size: 15,
    weight: 700,
    color: COLOR.concrete,
    letterSpacing: 3,
    align: "center",
  });

  drawTrackedBlock(ctx, CITY_STACK, margin, height - margin - 90, { size: 12, color: COLOR.ink, letterSpacing: 2, align: "left", lineHeight: 19 });
  drawBarcodeTag(ctx, width - margin - 90, height - margin - 44, 22, `AL:${input.eventDate.replaceAll("-", "").slice(2)}`, COLOR.ink);

  applyDistress(ctx, width, height, 0.22, 10, true);
}

// ─────────────────────────────────────────────────────────────────────────
// Variant 3 — "flyer": hero name dominant, event-details block (JUL / SCH flyer references).
// ─────────────────────────────────────────────────────────────────────────
async function renderFlyer(ctx: SKRSContext2D, input: RenderPosterInput, subjectImg: Image, backdropImg: Image | null) {
  const { width, height, margin } = CANVAS;

  ctx.fillStyle = COLOR.ink;
  ctx.fillRect(0, 0, width, height);
  await drawGroundTexture(ctx, "overlay", 0.3);
  if (backdropImg) {
    drawCoverImage(ctx, backdropImg, width, height, 0.55);
    ctx.fillStyle = "rgba(11,11,10,0.35)";
    ctx.fillRect(0, 0, width, height);
  }

  const metaY = margin + 20;
  drawTrackedText(ctx, KICKER, margin, metaY, { size: 13, weight: 700, color: COLOR.offWhite, letterSpacing: 5, align: "left", shadow: true });
  drawEyeGlobeIcon(ctx, width - margin - 12, metaY - 4, 10, COLOR.offWhite, 0.85);

  const date = new Date(input.eventDate + "T00:00:00Z");
  const dayName = date.toLocaleString("en-US", { weekday: "long", timeZone: "UTC" }).toUpperCase();
  const dayMonth = `${String(date.getUTCDate()).padStart(2, "0")}.${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  drawTrackedText(ctx, dayName, width - margin, metaY + 30, { size: 13, weight: 700, color: COLOR.offWhite, letterSpacing: 2, align: "right", shadow: true });
  drawTrackedText(ctx, dayMonth, width - margin, metaY + 58, { size: 26, weight: 700, color: COLOR.gold, letterSpacing: 1, align: "right", shadow: true });

  const subjectZoneTop = height * 0.22;
  const subjectZoneBottom = height * 0.72;
  const { sw, sh } = fitSubject(subjectImg, width * 0.92, subjectZoneBottom - subjectZoneTop);
  ctx.drawImage(subjectImg, (width - sw) / 2, subjectZoneBottom - sh, sw, sh);

  fillGradient(ctx, 0, subjectZoneBottom - 60, 0, height, "rgba(11,11,10,0)", "rgba(11,11,10,0.92)", width, height - subjectZoneBottom + 60, subjectZoneBottom - 60);

  const kickerY = subjectZoneBottom + 44;
  drawTextScrim(ctx, kickerY + 60, 140, 0.55);
  drawTrackedText(ctx, "LIVE PERFORMANCE BY", width / 2, kickerY, {
    size: 15,
    weight: 700,
    color: COLOR.offWhite,
    letterSpacing: 6,
    align: "center",
    shadow: true,
    outline: COLOR.ink,
  });
  const heroSize = fitDisplaySize(ctx, input.artistName, width * 0.9, 165, 0);
  drawSkewedDisplayLine(ctx, input.artistName, width / 2, kickerY + 28 + heroSize * 0.78, {
    size: heroSize,
    color: COLOR.offWhite,
    skew: 0,
    shadow: true,
    outline: COLOR.ink,
  });

  const footerRuleY = height - margin - 70;
  ctx.save();
  ctx.strokeStyle = COLOR.concrete;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin, footerRuleY);
  ctx.lineTo(width - margin, footerRuleY);
  ctx.stroke();
  ctx.restore();

  drawTrackedBlock(ctx, ["DOORS OPEN", "22H00"], margin, footerRuleY + 30, { size: 12, color: COLOR.offWhite, letterSpacing: 2, align: "left", lineHeight: 20, alpha: 0.9 });
  const amazeSmall = fitDisplaySize(ctx, "AMAZE", width * 0.3, 34);
  drawSkewedDisplayLine(ctx, "AMAZE", width / 2, footerRuleY + 30, { size: amazeSmall, color: COLOR.offWhite, skew: -0.12 });
  drawSkewedDisplayLine(ctx, "LIVE", width / 2, footerRuleY + 30 + amazeSmall * 0.95, { size: amazeSmall, color: COLOR.offWhite, skew: -0.12 });
  drawTrackedBlock(ctx, [input.city.toUpperCase(), input.utilityLine.split("—")[0]?.trim() ?? ""], width - margin, footerRuleY + 30, {
    size: 12,
    color: COLOR.offWhite,
    letterSpacing: 2,
    align: "right",
    lineHeight: 20,
    alpha: 0.9,
  });

  drawCrosshair(ctx, margin + 8, margin + 8, 8, COLOR.concrete, 0.6);
  drawCrosshair(ctx, width - margin - 8, margin + 96, 8, COLOR.concrete, 0.6);

  applyDistress(ctx, width, height, 0.55, 16);
}

// ─────────────────────────────────────────────────────────────────────────
// Variant 4 — "halo": radial glow / moon portrait (NINHO reference).
// ─────────────────────────────────────────────────────────────────────────
async function renderHalo(ctx: SKRSContext2D, input: RenderPosterInput, subjectImg: Image, backdropImg: Image | null) {
  const { width, height, margin } = CANVAS;

  ctx.fillStyle = COLOR.ink;
  ctx.fillRect(0, 0, width, height);
  await drawGroundTexture(ctx, "overlay", 0.3);
  if (backdropImg) drawCoverImage(ctx, backdropImg, width, height, 0.18);
  ctx.fillStyle = "rgba(11,11,10,0.7)";
  ctx.fillRect(0, 0, width, height);

  const metaY = margin + 20;
  drawTrackedText(ctx, "AMAZE LIVE", width / 2, metaY, { size: 16, weight: 700, color: COLOR.offWhite, letterSpacing: 6, align: "center", alpha: 0.95 });
  drawGlobeIcon(ctx, width / 2, metaY + 24, 10, COLOR.offWhite, 0.75);

  const glowCx = width / 2;
  const glowCy = height * 0.4;
  drawRadialGlow(ctx, glowCx, glowCy, width * 0.85, 0.55);
  drawRadialGlow(ctx, glowCx, glowCy, width * 0.4, 0.35);
  // the eclipse terminator line
  ctx.save();
  ctx.globalAlpha = 0.5;
  const rim = ctx.createLinearGradient(0, glowCy - 2, 0, glowCy + 2);
  rim.addColorStop(0, "rgba(245,242,234,0)");
  rim.addColorStop(0.5, "rgba(245,242,234,0.9)");
  rim.addColorStop(1, "rgba(245,242,234,0)");
  ctx.fillStyle = rim;
  ctx.fillRect(0, glowCy - 2, width, 4);
  ctx.restore();

  const ghostSize = fitDisplaySize(ctx, input.artistName, width * 1.02, 420);
  drawSkewedDisplayLine(ctx, input.artistName, width / 2, glowCy + ghostSize * 0.32, {
    size: ghostSize,
    color: COLOR.offWhite,
    alpha: 0.16,
    skew: 0,
  });

  const subjectZoneBottom = height - 280;
  const { sw, sh } = fitSubject(subjectImg, width * 0.62, height * 0.62);
  ctx.drawImage(subjectImg, (width - sw) / 2, subjectZoneBottom - sh, sw, sh);

  fillGradient(ctx, 0, subjectZoneBottom - 200, 0, height, "rgba(11,11,10,0)", "rgba(11,11,10,0.92)", width, 200 + (height - subjectZoneBottom), subjectZoneBottom - 200);

  const nameY = height - margin - 140;
  drawTrackedText(ctx, input.artistName, width / 2, nameY, { size: 34, weight: 700, color: COLOR.offWhite, letterSpacing: 6, align: "center", font: "Anton", shadow: true });
  if (input.tagline?.trim()) {
    drawTrackedText(ctx, input.tagline, width / 2, nameY + 32, { size: 15, weight: 700, color: COLOR.offWhite, letterSpacing: 4, align: "center", alpha: 0.85, shadow: true });
  }
  const ruleY = nameY + (input.tagline?.trim() ? 58 : 30);
  drawGoldRule(ctx, width / 2 - 40, ruleY, width / 2 + 40);
  drawTrackedText(ctx, input.utilityLine, width / 2, ruleY + 36, { size: 17, weight: 700, color: COLOR.offWhite, letterSpacing: 3, align: "center", shadow: true });

  drawCrosshair(ctx, margin + 8, margin + 8, 8, COLOR.concrete, 0.6);
  drawCrosshair(ctx, width - margin - 8, margin + 8, 8, COLOR.concrete, 0.6);
  drawBarcodeTag(ctx, margin, height - margin - 30, 20, `AL:${input.eventDate.replaceAll("-", "").slice(2)}`, COLOR.concrete);

  applyDistress(ctx, width, height, 0.6, 18);
}

// ─────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────

function drawDarkCornerMetadata(ctx: SKRSContext2D, input: RenderPosterInput) {
  const { width, margin } = CANVAS;
  const metaY = margin + 26;
  drawTrackedText(ctx, KICKER, width / 2, metaY, { size: 14, weight: 700, color: COLOR.offWhite, letterSpacing: 8, align: "center", alpha: 0.9 });
  drawEyeGlobeIcon(ctx, width / 2, metaY + 26, 11, COLOR.offWhite, 0.8);
  drawTrackedBlock(ctx, MANIFESTO, margin, metaY, { size: 12, color: COLOR.concrete, letterSpacing: 3, align: "left", alpha: 0.95 });
  drawTrackedBlock(ctx, WORLDWIDE, width - margin, metaY, { size: 12, color: COLOR.concrete, letterSpacing: 3, align: "right", alpha: 0.95 });
  drawCrosshair(ctx, margin + 8, metaY + 74, 9, COLOR.concrete, 0.7);
  drawCrosshair(ctx, width - margin - 8, metaY + 74, 9, COLOR.concrete, 0.7);

  const { height } = CANVAS;
  const year = Number(input.eventDate.slice(0, 4)) || new Date().getFullYear();
  const footerY = height - margin - 42;
  drawBarcodeTag(ctx, margin, footerY, 24, `AL:${input.eventDate.replaceAll("-", "").slice(2)}`, COLOR.concrete);
  const coords = coordsForCity(input.city);
  const footerRight: string[] = coords ? [...coords, romanYear(year)] : ["EST. 2024", romanYear(year)];
  drawTrackedBlock(ctx, footerRight, width - margin, footerY - (footerRight.length - 1) * 21 + 18, {
    size: 12,
    color: COLOR.concrete,
    letterSpacing: 3,
    align: "right",
    lineHeight: 21,
  });
}

/**
 * Guarantees legibility for text printed over the subject regardless of pose — a raised hand
 * or bright garment can sit anywhere in frame, so the general fade isn't reliable on its own.
 * Draws a soft, feathered dark band centered on the text's vertical position.
 */
function drawTextScrim(ctx: SKRSContext2D, centerY: number, bandHeight: number, opacity = 0.55) {
  const { width } = CANVAS;
  ctx.save();
  const gradient = ctx.createLinearGradient(0, centerY - bandHeight, 0, centerY + bandHeight);
  gradient.addColorStop(0, "rgba(11,11,10,0)");
  gradient.addColorStop(0.5, `rgba(11,11,10,${opacity})`);
  gradient.addColorStop(1, "rgba(11,11,10,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, centerY - bandHeight, width, bandHeight * 2);
  ctx.restore();
}

/** Mottled paper/canvas texture under the whole ground — the materiality flat color can't fake. */
async function drawGroundTexture(ctx: SKRSContext2D, mode: "multiply" | "overlay", alpha: number) {
  const { width, height } = CANVAS;
  const texture = await getPaperTexture();
  ctx.save();
  ctx.globalCompositeOperation = mode;
  ctx.globalAlpha = alpha;
  ctx.drawImage(texture, 0, 0, width, height);
  ctx.restore();
}

function drawGoldRule(ctx: SKRSContext2D, x1: number, y: number, x2: number) {
  ctx.save();
  ctx.strokeStyle = COLOR.gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

function drawCoverImage(ctx: SKRSContext2D, img: Image, width: number, height: number, alpha: number) {
  const scale = Math.max(width / img.width, height / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
  ctx.restore();
}

function fitSubject(img: Image, maxWidth: number, maxHeight: number): { sw: number; sh: number } {
  let scale = maxHeight / img.height;
  if (img.width * scale > maxWidth) scale = maxWidth / img.width;
  return { sw: img.width * scale, sh: img.height * scale };
}

function fillGradient(
  ctx: SKRSContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  from: string,
  to: string,
  rectW: number,
  rectH: number,
  rectY: number,
  midStops: Array<[number, string]> = []
) {
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  gradient.addColorStop(0, from);
  for (const [stop, color] of midStops) gradient.addColorStop(stop, color);
  gradient.addColorStop(1, to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, rectY, rectW, rectH);
}

/** Analog distress pass — scratches, dust, vignette, grain — in that order, once. */
function applyDistress(ctx: SKRSContext2D, width: number, height: number, vignette: number, grain: number, light = false) {
  drawScratches(ctx, width, height, light ? 4 : 7);
  drawDust(ctx, width, height, light ? 60 : 90);
  applyVignette(ctx, width, height, vignette);
  applyFilmGrain(ctx, width, height, grain);
}

/** Largest font size (capped) at which the text fits the given width. */
function fitDisplaySize(ctx: SKRSContext2D, text: string, maxWidth: number, cap: number, tracking = 0): number {
  let size = cap;
  while (measureDisplay(ctx, text, size, tracking) > maxWidth && size > 20) {
    size -= 4;
  }
  return size;
}
