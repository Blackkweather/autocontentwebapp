import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { COLOR, FONT, CANVAS } from "./brand";
import { distressCanvas } from "./texture";

type Align = "left" | "center" | "right";

/** Draws all-caps utility/label text with tracked letter-spacing (kicker lines, dates, credits). */
export function drawTrackedText(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  opts: {
    size: number;
    weight?: number;
    color?: string;
    letterSpacing?: number;
    align?: Align;
    font?: string;
    alpha?: number;
    shadow?: boolean;
    outline?: string;
  }
) {
  const { size, weight = 700, color = COLOR.offWhite, letterSpacing = 2, align = "left", font = FONT.body, alpha = 1, shadow = false, outline } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (shadow) {
    // text printed over photo carries a soft dark halo, like the references
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 10;
  }
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.letterSpacing = `${letterSpacing}px`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  const upper = text.toUpperCase();
  if (outline) {
    // guarantees legibility over unpredictable photo content (rings, bright fabric) —
    // a background scrim alone isn't reliable since it can't out-darken a bright highlight
    ctx.lineJoin = "round";
    ctx.lineWidth = size * 0.28;
    ctx.strokeStyle = outline;
    ctx.strokeText(upper, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(upper, x, y);
  ctx.restore();
}

/** Small stacked block of tracked utility lines (manifesto, coordinates, city list). */
export function drawTrackedBlock(
  ctx: SKRSContext2D,
  lines: readonly string[],
  x: number,
  y: number,
  opts: { size: number; lineHeight?: number; color?: string; letterSpacing?: number; align?: Align; alpha?: number }
) {
  const { size, lineHeight = size * 1.75, ...rest } = opts;
  lines.forEach((line, i) => {
    drawTrackedText(ctx, line, x, y + i * lineHeight, { size, ...rest });
  });
}

/**
 * The signature display move from the references: huge condensed all-caps type with a
 * slight italic shear. Shear is applied around the line's own baseline (local origin),
 * never the canvas origin. Returns the font size actually used after fitting.
 */
export function drawSkewedDisplayLine(
  ctx: SKRSContext2D,
  text: string,
  cx: number,
  baseline: number,
  opts: {
    size: number;
    maxWidth?: number;
    color?: string;
    alpha?: number;
    skew?: number;
    align?: Align;
    tracking?: number;
    shadow?: boolean;
    outline?: string;
  }
) {
  const { size, maxWidth, color = COLOR.offWhite, alpha = 1, skew = -0.12, align = "center", tracking = 0, shadow = false, outline } = opts;
  const upper = text.toUpperCase();
  ctx.save();
  if (shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 14;
  }
  ctx.letterSpacing = `${tracking}px`;
  let fontSize = size;
  ctx.font = `${fontSize}px ${FONT.display}`;
  if (maxWidth) {
    while (ctx.measureText(upper).width > maxWidth && fontSize > 24) {
      fontSize -= 4;
      ctx.font = `${fontSize}px ${FONT.display}`;
    }
  }
  ctx.globalAlpha = alpha;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.translate(cx, baseline);
  ctx.transform(1, 0, skew, 1, 0, 0);
  if (outline) {
    ctx.lineJoin = "round";
    ctx.lineWidth = fontSize * 0.16;
    ctx.strokeStyle = outline;
    ctx.strokeText(upper, 0, 0);
  }
  ctx.fillStyle = color;
  ctx.fillText(upper, 0, 0);
  ctx.restore();
  return fontSize;
}

/**
 * The masthead treatment from the SCH/Booba references: the giant display type isn't a flat
 * fill, it has weathered concrete/paper tone variation baked into the letterforms. Renders
 * the line on an offscreen layer, then distresses just the glyph shapes (see texture.ts) and
 * composites the result onto the real canvas — same signature as drawSkewedDisplayLine.
 */
export async function drawDistressedDisplayLine(
  mainCtx: SKRSContext2D,
  text: string,
  cx: number,
  baseline: number,
  opts: {
    size: number;
    maxWidth?: number;
    color?: string;
    skew?: number;
    align?: Align;
    tracking?: number;
    distressStrength?: number;
  }
): Promise<number> {
  const { color = COLOR.offWhite, distressStrength = 0.55, ...rest } = opts;
  const { width, height } = CANVAS;
  const layer = createCanvas(width, height);
  const lctx = layer.getContext("2d");
  const fontSize = drawSkewedDisplayLine(lctx, text, cx, baseline, { ...rest, color });
  await distressCanvas(layer, color, distressStrength);
  mainCtx.drawImage(layer, 0, 0, width, height);
  return fontSize;
}

/** Measures a display line at a given size/tracking without drawing. */
export function measureDisplay(ctx: SKRSContext2D, text: string, size: number, tracking = 0): number {
  ctx.save();
  ctx.letterSpacing = `${tracking}px`;
  ctx.font = `${size}px ${FONT.display}`;
  const w = ctx.measureText(text.toUpperCase()).width;
  ctx.restore();
  return w;
}

/** Soft radial backlight behind the subject — the halo that carves them out of the dark. */
export function drawRadialGlow(
  ctx: SKRSContext2D,
  cx: number,
  cy: number,
  radius: number,
  intensity = 0.3,
  color = "255,255,255"
) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, `rgba(${color},${intensity})`);
  gradient.addColorStop(0.55, `rgba(${color},${intensity * 0.35})`);
  gradient.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();
}

/** Minimal crosshair/reticle corner instrument accent. */
export function drawCrosshair(ctx: SKRSContext2D, cx: number, cy: number, r: number, color: string = COLOR.concrete, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  const tick = r * 0.5;
  const arms: Array<[number, number, number, number]> = [
    [cx - r - tick, cy, cx - r + tick * 0.3, cy],
    [cx + r - tick * 0.3, cy, cx + r + tick, cy],
    [cx, cy - r - tick, cx, cy - r + tick * 0.3],
    [cx, cy + r - tick * 0.3, cx, cy + r + tick],
  ];
  for (const [x1, y1, x2, y2] of arms) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** Minimal globe icon: circle + meridian ellipse + equator — the agency's worldwide mark. */
export function drawGlobeIcon(ctx: SKRSContext2D, cx: number, cy: number, r: number, color: string = COLOR.offWhite, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.42, r, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.stroke();
  ctx.restore();
}

/** Eye-inside-a-globe mark, from the SCH reference — the agency's "watching the world" motif. */
export function drawEyeGlobeIcon(ctx: SKRSContext2D, cx: number, cy: number, r: number, color: string = COLOR.offWhite, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.4;
  // almond eye shape: two arcs meeting at inner/outer corners
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.quadraticCurveTo(cx, cy - r * 0.62, cx + r, cy);
  ctx.quadraticCurveTo(cx, cy + r * 0.62, cx - r, cy);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Squared "A" logo lockup from the Booba reference: a small filled square mark, a thin
 * divider, and a stacked wordmark beside it. Clear space = the square's own size, per brand.
 */
export function drawLogoMark(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  opts: { size: number; lines: readonly string[]; color?: string; align?: Align }
) {
  const { size, lines, color = COLOR.offWhite, align = "left" } = opts;
  const dividerGap = size * 0.55;
  ctx.save();
  ctx.fillStyle = color;
  const squareX = align === "right" ? x - size : x;
  ctx.font = `900 ${size * 0.82}px ${FONT.display}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillRect(squareX, y, size, size);
  ctx.fillStyle = COLOR.ink;
  ctx.fillText("A", squareX + size / 2, y + size / 2 + size * 0.04);

  ctx.fillStyle = color;
  const dividerX = align === "right" ? squareX - dividerGap / 2 : squareX + size + dividerGap / 2;
  ctx.fillRect(dividerX - 0.5, y, 1, size);

  const textX = align === "right" ? dividerX - dividerGap / 2 : dividerX + dividerGap / 2;
  drawTrackedBlock(ctx, lines, textX, y + size * 0.42, {
    size: size * 0.24,
    color,
    letterSpacing: 1,
    align,
    lineHeight: size * 0.4,
  });
  ctx.restore();
}

/** Barcode bars + code string — the edition stamp from the references. */
export function drawBarcodeTag(ctx: SKRSContext2D, x: number, y: number, height: number, code: string, color: string = COLOR.concrete) {
  ctx.save();
  ctx.fillStyle = color;
  const bars = [2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1];
  let cursor = x;
  for (const w of bars) {
    ctx.fillRect(cursor, y, w, height);
    cursor += w + 2;
  }
  ctx.restore();
  drawTrackedText(ctx, code, x, y + height + 16, { size: 10, weight: 700, color, letterSpacing: 2, align: "left" });
}

/** A few hairline scratches — near-vertical, both light and dark, like a worn print. */
export function drawScratches(ctx: SKRSContext2D, width: number, height: number, count = 7) {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = Math.random() * width;
    const drift = (Math.random() - 0.5) * 60;
    const light = Math.random() > 0.45;
    ctx.strokeStyle = light ? "rgba(245,242,234,0.05)" : "rgba(0,0,0,0.09)";
    ctx.lineWidth = Math.random() * 1.1 + 0.3;
    ctx.beginPath();
    ctx.moveTo(x, -10);
    ctx.bezierCurveTo(x + drift * 0.3, height * 0.33, x + drift * 0.7, height * 0.66, x + drift, height + 10);
    ctx.stroke();
  }
  ctx.restore();
}

/** Dust specks scattered across the frame. */
export function drawDust(ctx: SKRSContext2D, width: number, height: number, count = 90) {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const light = Math.random() > 0.4;
    ctx.fillStyle = light ? "rgba(245,242,234,0.07)" : "rgba(0,0,0,0.1)";
    const r = Math.random() * 1.4 + 0.3;
    ctx.beginPath();
    ctx.arc(Math.random() * width, Math.random() * height, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Uniform analog film grain across the whole canvas — applied once, last, over everything. */
export function applyFilmGrain(ctx: SKRSContext2D, width: number, height: number, intensity = 14) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * intensity;
    data[i] = clamp(data[i] + noise);
    data[i + 1] = clamp(data[i + 1] + noise);
    data[i + 2] = clamp(data[i + 2] + noise);
  }
  ctx.putImageData(imageData, 0, 0);
}

function clamp(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Heavy edge vignette — the frame falls to black at the borders like the references. */
export function applyVignette(ctx: SKRSContext2D, width: number, height: number, strength = 0.55) {
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.3,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72
  );
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
