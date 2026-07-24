import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Resolve the "@/*" alias explicitly at the webpack layer. Next normally derives this from
  // tsconfig `paths`, but that derivation needs `baseUrl` and can silently drop the alias in
  // some build environments (Vercel's production build failed with "Can't resolve '@/lib/...'"
  // while local builds passed). Pinning it here makes bundling deterministic across machines.
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@": path.join(__dirname, "src"),
    };
    return config;
  },
  // Native addons (@napi-rs/canvas, sharp, onnxruntime) must be required at runtime, not bundled by Turbopack/webpack.
  serverExternalPackages: ["@napi-rs/canvas", "sharp", "onnxruntime-node"],
  // Monorepo: npm workspaces hoists shared deps (sharp, onnxruntime-node, @napi-rs/canvas —
  // consumed via @club-os/core and @club-os/flyer-engine) into the workspace root's
  // node_modules, outside this app's own directory. Output file tracing defaults to treating
  // this directory (wherever next.config.ts lives) as the tracing root, which would miss them —
  // point it at the actual monorepo root instead.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Fonts, the matting model, and native bindings must ship with the serverless function bundle.
  // onnxruntime-node's .node binding dlopen()s its .so at runtime rather than require()-ing it,
  // which static file tracing can't follow — it has to be listed explicitly, or the function
  // crashes at import time with "cannot open shared object file". A directory glob (matching
  // Next's own documented pattern for native runtime assets) is what actually gets picked up —
  // literal file paths here silently resolve to nothing despite the glob module reporting a
  // match in isolation. The linux/x64 folder also ships CUDA/TensorRT provider libs (~459MB,
  // irrelevant on Vercel's CPU-only functions and well past the function size limit), so those
  // are explicitly excluded.
  outputFileTracingIncludes: {
    "/api/events/[id]/generate": [
      "./assets/fonts/**",
      "./assets/models/**",
      "../../node_modules/onnxruntime-node/bin/**",
    ],
  },
  outputFileTracingExcludes: {
    "/api/events/[id]/generate": [
      "../../node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime_providers_cuda.so",
      "../../node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime_providers_tensorrt.so",
      "../../node_modules/onnxruntime-node/bin/napi-v3/darwin/**",
      "../../node_modules/onnxruntime-node/bin/napi-v3/win32/**",
    ],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }],
  },
};

export default nextConfig;
