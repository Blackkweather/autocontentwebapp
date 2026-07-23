// Local background removal — silueta (U²-Net architecture, Apache-2.0) via onnxruntime-node.
// Same model family as the Replicate endpoint this replaces (cjwbw/rembg), so identical
// output quality, but free, offline, and with no per-minute rate limits.
// Pre/post-processing mirrors rembg's u2net pipeline: 320×320 input, ImageNet
// normalization, min-max normalized mask, upscaled and joined as the alpha channel.

import path from "node:path";
import sharp from "sharp";
import * as ort from "onnxruntime-node";

const INPUT_SIZE = 320;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let sessionPromise: Promise<ort.InferenceSession> | null = null;

function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    const modelPath = path.join(process.cwd(), "assets", "models", "silueta.onnx");
    sessionPromise = ort.InferenceSession.create(modelPath);
  }
  return sessionPromise;
}

/** Cut the subject out of a photo. Returns an RGBA PNG buffer with transparent background. */
export async function removeBackgroundLocal(image: Buffer): Promise<Buffer> {
  const session = await getSession();

  // decode once (EXIF rotation applied) — this buffer's info is the source of truth for dimensions
  const decoded = await sharp(image).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = decoded.info;
  if (channels !== 3) throw new Error(`expected 3 channels after removeAlpha, got ${channels}`);

  const { data: rgb } = await sharp(decoded.data, { raw: { width, height, channels: 3 } })
    .resize(INPUT_SIZE, INPUT_SIZE, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // HWC uint8 → NCHW float32, ImageNet-normalized (rembg divides by the frame max, mirror that)
  const pixels = INPUT_SIZE * INPUT_SIZE;
  let frameMax = 1;
  for (let i = 0; i < rgb.length; i++) if (rgb[i] > frameMax) frameMax = rgb[i];
  const input = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i++) {
    for (let c = 0; c < 3; c++) {
      input[c * pixels + i] = (rgb[i * 3 + c] / frameMax - MEAN[c]) / STD[c];
    }
  }

  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0]; // d0 — the fused, highest-quality mask
  const results = await session.run({
    [inputName]: new ort.Tensor("float32", input, [1, 3, INPUT_SIZE, INPUT_SIZE]),
  });
  const mask = results[outputName].data as Float32Array;

  // min-max normalize → uint8 mask
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < pixels; i++) {
    if (mask[i] < min) min = mask[i];
    if (mask[i] > max) max = mask[i];
  }
  const range = max - min || 1;
  const maskBytes = Buffer.alloc(pixels);
  for (let i = 0; i < pixels; i++) {
    maskBytes[i] = Math.round(((mask[i] - min) / range) * 255);
  }

  // upscale the mask to full resolution — force single-channel output: sharp otherwise
  // converts raw grayscale to 3-channel sRGB during resize, which corrupts the alpha join
  const fullMask = await sharp(maskBytes, { raw: { width: INPUT_SIZE, height: INPUT_SIZE, channels: 1 } })
    .resize(width, height, { fit: "fill" })
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (fullMask.info.channels !== 1) throw new Error(`mask must stay single-channel, got ${fullMask.info.channels}`);

  return sharp(decoded.data, { raw: { width, height, channels: 3 } })
    .joinChannel(fullMask.data, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
}
