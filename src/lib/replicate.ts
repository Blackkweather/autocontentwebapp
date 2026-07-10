// Replicate — background removal via cjwbw/rembg (cheap standard model, not a premium partner model).
// Auth header is `Bearer`, not `Token` (Replicate changed this in 2024).

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
