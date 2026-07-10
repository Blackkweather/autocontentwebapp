// Fetches binary assets (fonts, ONNX model) at build time instead of committing them —
// keeps the repo/deploy payload small. Idempotent: skips any file already present.
import { existsSync, mkdirSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const ASSETS = [
  {
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf",
    dest: "assets/fonts/Anton-Regular.ttf",
  },
  {
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/arimo/Arimo%5Bwght%5D.ttf",
    dest: "assets/fonts/Arimo.ttf",
  },
  {
    url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/silueta.onnx",
    dest: "assets/models/silueta.onnx",
  },
];

async function fetchAsset(url, dest) {
  const fullPath = path.join(process.cwd(), dest);
  if (existsSync(fullPath)) {
    console.log(`[fetch-assets] skip (already present): ${dest}`);
    return;
  }
  mkdirSync(path.dirname(fullPath), { recursive: true });
  console.log(`[fetch-assets] downloading ${dest} ...`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const { createWriteStream } = await import("node:fs");
  await pipeline(res.body, createWriteStream(fullPath));
  console.log(`[fetch-assets] saved ${dest}`);
}

for (const asset of ASSETS) {
  await fetchAsset(asset.url, asset.dest);
}
