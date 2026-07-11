// Replicate — background removal via cjwbw/rembg (cheap standard model, not a premium partner model).
// Auth header is `Bearer`, not `Token` (Replicate changed this in 2024).

import sharp from "sharp";

const API_TOKEN = process.env.REPLICATE_API_TOKEN || "";
const REMBG_VERSION = "fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003"; // cjwbw/rembg latest

interface Prediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[] | null;
  error?: string | null;
}

async function pollPrediction(id: string, timeoutMs = 60_000): Promise<Prediction> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    });
    const prediction = (await res.json()) as Prediction;
    if (prediction.status === "succeeded" || prediction.status === "failed" || prediction.status === "canceled") {
      return prediction;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Replicate prediction timed out");
}

/** Remove the background from an image URL, returning a URL to the cutout PNG (transparent background). */
export async function removeBackground(imageUrl: string): Promise<string> {
  const created = await createPredictionWithRetry(imageUrl);
  const finished = await pollPrediction(created.id);
  if (finished.status !== "succeeded" || !finished.output) {
    throw new Error(`Replicate background removal failed: ${finished.error ?? "unknown error"}`);
  }
  return Array.isArray(finished.output) ? finished.output[0] : finished.output;
}

/** Low-credit accounts are throttled to 6 predictions/min (burst 1) — honor 429 retry_after
 *  so batch runs queue instead of failing. */
async function createPredictionWithRetry(imageUrl: string, maxAttempts = 5): Promise<Prediction> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: REMBG_VERSION,
        input: { image: imageUrl },
      }),
    });
    if (res.ok) return (await res.json()) as Prediction;

    const text = await res.text();
    if (res.status === 429 && attempt < maxAttempts) {
      let waitSeconds = 12;
      try {
        const parsed = JSON.parse(text) as { retry_after?: number };
        if (typeof parsed.retry_after === "number") waitSeconds = Math.max(parsed.retry_after, 3) + 1;
      } catch {
        // keep the default wait
      }
      await new Promise((r) => setTimeout(r, waitSeconds * 1000));
      continue;
    }
    throw new Error(`Replicate prediction create failed: ${res.status} ${text}`);
  }
}

/** Shared retry wrapper for Replicate's official-model prediction endpoint (as opposed to the
 *  pinned-version endpoint rembg above uses) — same 429/retry_after handling, parameterized by
 *  model slug and input payload so each model below isn't duplicating the retry loop. */
async function createModelPredictionWithRetry(
  model: string,
  input: Record<string, unknown>,
  maxAttempts = 5
): Promise<Prediction> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input }),
    });
    if (res.ok) return (await res.json()) as Prediction;

    const text = await res.text();
    if (res.status === 429 && attempt < maxAttempts) {
      let waitSeconds = 12;
      try {
        const parsed = JSON.parse(text) as { retry_after?: number };
        if (typeof parsed.retry_after === "number") waitSeconds = Math.max(parsed.retry_after, 3) + 1;
      } catch {
        // keep the default wait
      }
      await new Promise((r) => setTimeout(r, waitSeconds * 1000));
      continue;
    }
    throw new Error(`${model} prediction create failed: ${res.status} ${text}`);
  }
}

async function downloadPredictionOutput(finished: Prediction, label: string): Promise<Buffer> {
  if (finished.status !== "succeeded" || !finished.output) {
    throw new Error(`${label} failed: ${finished.error ?? "unknown error"}`);
  }
  const imageUrl = Array.isArray(finished.output) ? finished.output[0] : finished.output;
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to download ${label} output: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// High-quality subject matting via BiRefNet (men1scus/birefnet on Replicate) — the local ONNX
// model (silueta, see bgremove.ts) runs at a fixed 320x320 input, which is too coarse to resolve
// hair strands, jewelry, or complex clothing edges cleanly; upscaling that mask to full
// resolution is exactly what produced the "cut like a sticker" complaint (2026-07-11). BiRefNet
// processes at up to 2048x2048 and is the current reference implementation for hair-level matte
// quality — same category of model the reference posters' subjects were presumably shot/cut
// with. Cheap (~$0.004/run) since it's not a premium partner model.
//
// The exact output shape (a ready RGBA cutout vs. a separate grayscale mask to join with the
// source) isn't something this codebase could verify against a live call before shipping — the
// sandbox's egress policy blocks direct requests to api.replicate.com. resolveMattingOutput
// below handles both shapes defensively so a wrong guess here degrades to "mask joined with the
// source" rather than a broken image.
const MATTING_MODEL = "men1scus/birefnet";

async function resolveMattingOutput(outputBuffer: Buffer, sourceBuffer: Buffer): Promise<Buffer> {
  const meta = await sharp(outputBuffer).metadata();
  if (meta.hasAlpha) {
    // Sample for genuine alpha variation — a model that returns a real cutout has both
    // transparent and opaque regions; one that returns an opaque image with an alpha channel
    // present-but-unused (e.g. flattened to 255 everywhere) should be treated as a mask instead.
    const { data, info } = await sharp(outputBuffer).raw().toBuffer({ resolveWithObject: true });
    const channels = info.channels;
    let min = 255;
    let max = 0;
    for (let i = 3; i < data.length; i += channels * 97) {
      // stride-sample rather than scan every pixel — this is just a heuristic check
      if (data[i] < min) min = data[i];
      if (data[i] > max) max = data[i];
    }
    if (max - min > 40) return outputBuffer; // real transparency variation — already a cutout
  }
  // Treat as a grayscale mask: join it as the alpha channel of the original source photo.
  const sourceRaw = await sharp(sourceBuffer).flatten({ background: "#000000" }).raw().toBuffer({ resolveWithObject: true });
  const maskRaw = await sharp(outputBuffer)
    .resize(sourceRaw.info.width, sourceRaw.info.height, { fit: "fill" })
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });
  return sharp(sourceRaw.data, { raw: sourceRaw.info })
    .joinChannel(maskRaw.data, { raw: { width: maskRaw.info.width, height: maskRaw.info.height, channels: 1 } })
    .png()
    .toBuffer();
}

/** Cuts the subject out of a photo with a high-fidelity matte. Meant to be tried first, with the
 *  caller falling back to its own handling (local ONNX, then plain rembg) on any failure. */
export async function removeBackgroundHQ(sourceBuffer: Buffer, sourceUrl: string): Promise<Buffer> {
  if (!API_TOKEN) throw new Error("REPLICATE_API_TOKEN is not set");
  const created = await createModelPredictionWithRetry(MATTING_MODEL, { image: sourceUrl, resolution: "1024x1024" });
  const finished = await pollPrediction(created.id, 60_000);
  const outputBuffer = await downloadPredictionOutput(finished, "BiRefNet matting");
  return resolveMattingOutput(outputBuffer, sourceBuffer);
}

// Text-guided scene generation via Google's Nano Banana (Gemini 2.5 Flash Image) — takes the
// real, identity-verified photo(s) the pipeline already sourced plus a free-text creative brief
// ("Lacrim in GTA 6, 4K showcase") and returns a scene that keeps the subject's actual likeness
// while placing them in whatever the brief describes. Also the one model here that fuses several
// reference photos into one coherent scene (up to 3 — image_input), which is what makes lineup
// posters ("PLK, Jul and Booba as a Street Fighter roster") possible at all.
//
// Originally built on FLUX.1 Kontext [pro], switched 2026-07-11: Kontext is fundamentally a
// photo-editing model, and it showed — outputs read as an obviously-edited photo (flat lighting,
// uncanny blending) rather than the painted-key-art look the brand's other four layouts have.
// Nano Banana independently benchmarks ahead of Kontext on identity preservation and realism
// (LMArena Image Edit leaderboard), and its single input_image/image_input parameter shape is
// close enough that one model now serves both the single-artist and lineup paths. Unlike
// everything else in this pipeline, this costs real money per call (~$0.03-0.04/image on
// Replicate) — no free tier for quality image generation — so it's opt-in per event via the
// creative-brief field, never the default path.
const SCENE_MODEL = "google/nano-banana";
export const MAX_SCENE_REFERENCE_IMAGES = 3;

/**
 * Wraps the user's casual brief with consistent art-direction language so output quality
 * doesn't depend on them knowing prompt-engineering tricks. A bare "Lacrim in GTA 6" reliably
 * produced a flat, obviously-edited-photo look — naming the target medium (painted key art, not
 * a snapshot) and pinning the identity constraint explicitly fixes both failure modes at once.
 */
function buildScenePrompt(brief: string, subjectCount: number): string {
  const identity =
    subjectCount > 1
      ? "Preserve the exact facial identity and likeness of every person shown in the reference photos — do not blend, average, or invent faces."
      : "Preserve the exact facial identity and likeness of the person in the reference photo exactly — do not alter their face or generate a different person.";
  return [
    brief,
    "Render as official cinematic key art / box art illustration quality: painted-photoreal, dramatic lighting, rich saturated color grading, sharp fine detail, 4K, poster-grade composition.",
    "Not a snapshot, not a simple photo filter or overlay.",
    identity,
  ].join(" ");
}

export async function generateSceneImage(brief: string, referenceImageUrls: string[]): Promise<Buffer> {
  if (!API_TOKEN) throw new Error("REPLICATE_API_TOKEN is not set");
  if (referenceImageUrls.length === 0) throw new Error("Scene generation needs at least 1 reference photo");
  const prompt = buildScenePrompt(brief, referenceImageUrls.length);
  const created = await createModelPredictionWithRetry(SCENE_MODEL, { prompt, image_input: referenceImageUrls });
  const finished = await pollPrediction(created.id, 120_000);
  return downloadPredictionOutput(finished, "Scene generation");
}
