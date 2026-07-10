// Organic texture generation — paper grain, grunge masking for distressed typography.
// The references' materiality (paper fiber, weathered concrete lettering, real film grain
// clumping) is what uniform per-pixel noise can't produce. This builds multi-octave blurred
// noise fields (cheap "value noise", no need for real Perlin) via sharp, cached per process.

import sharp from "sharp";
import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { CANVAS } from "./brand";

function randomNoiseBuffer(width: number, height: number): Buffer {
  const data = Buffer.alloc(width * height);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(Math.random() * 256);
  return data;
}

/** Several octaves of blurred noise combined — large soft blotches + mid clumps + fine grain. */
async function buildOrganicNoise(width: number, height: number): Promise<Buffer> {
  const octaves = [
    { scale: 1 / 14, blur: 0, weight: 0.45 },
    { scale: 1 / 5, blur: 0, weight: 0.3 },
    { scale: 1, blur: 0.5, weight: 0.25 },
  ];
  const layers = await Promise.all(
    octaves.map(async (o) => {
      const w = Math.max(2, Math.round(width * o.scale));
      const h = Math.max(2, Math.round(height * o.scale));
      const noise = randomNoiseBuffer(w, h);
      let pipeline = sharp(noise, { raw: { width: w, height: h, channels: 1 } }).resize(width, height, { kernel: "cubic" });
      if (o.blur > 0) pipeline = pipeline.blur(o.blur);
      return pipeline.raw().toBuffer();
    })
  );
  const out = Buffer.alloc(width * height);
  for (let i = 0; i < out.length; i++) {
    let v = 0;
    for (let l = 0; l < layers.length; l++) v += layers[l][i] * octaves[l].weight;
    out[i] = Math.max(0, Math.min(255, Math.round(v)));
  }
  return out;
}

let paperTexturePromise: Promise<Image> | null = null;
let grungeImagePromise: Promise<Image> | null = null;

/** Subtle mottled paper/canvas texture — multiply/overlay-blended under the whole ground. */
export async function getPaperTexture(): Promise<Image> {
  if (!paperTexturePromise) {
    paperTexturePromise = (async () => {
      const { width, height } = CANVAS;
      const noise = await buildOrganicNoise(width, height);
      // compress around mid-gray so the blend reads as gentle tonal variation, not static
      const png = await sharp(noise, { raw: { width, height, channels: 1 } })
        .linear(0.4, 128 * 0.6)
        .png()
        .toBuffer();
      return loadImage(png);
    })();
  }
  return paperTexturePromise;
}

/** High-contrast grunge field (grayscale, opaque) reused as the multiply layer for distressing type. */
async function getGrungeImage(): Promise<Image> {
  if (!grungeImagePromise) {
    grungeImagePromise = (async () => {
      const { width, height } = CANVAS;
      const noise = await buildOrganicNoise(width, height);
      const png = await sharp(noise, { raw: { width, height, channels: 1 } }).normalize().gamma(1.6).png().toBuffer();
      return loadImage(png);
    })();
  }
  return grungeImagePromise;
}

/**
 * Weathers whatever opaque shape is already drawn on `canvas` (e.g. filled text on an
 * otherwise-transparent layer) with organic tonal variation, strictly clipped to that shape.
 *
 * Two-step Porter-Duff trick: build a fully opaque "plate" the size of the canvas
 * (flat `baseColor` multiply-blended with the grunge field, so the plate itself has the
 * weathered color variation), then `source-atop` composite the plate onto `canvas` — atop
 * replaces color only where the destination already had alpha, and keeps the destination's
 * alpha exactly, so the plate's texture appears strictly inside the existing glyph shapes.
 */
export async function distressCanvas(
  canvas: { getContext(kind: "2d"): SKRSContext2D },
  baseColor: string,
  strength = 0.55
): Promise<void> {
  const { width, height } = CANVAS;
  const grunge = await getGrungeImage();

  const plate = createCanvas(width, height);
  const pctx = plate.getContext("2d");
  pctx.fillStyle = baseColor;
  pctx.fillRect(0, 0, width, height);
  pctx.save();
  pctx.globalCompositeOperation = "multiply";
  pctx.globalAlpha = strength;
  pctx.drawImage(grunge, 0, 0, width, height);
  pctx.restore();

  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.drawImage(plate, 0, 0, width, height);
  ctx.restore();
}
