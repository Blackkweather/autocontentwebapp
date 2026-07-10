import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native addons (@napi-rs/canvas, sharp, onnxruntime) must be required at runtime, not bundled by Turbopack/webpack.
  serverExternalPackages: ["@napi-rs/canvas", "sharp", "onnxruntime-node"],
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
    "/api/events/[id]/generate": ["./assets/fonts/**", "./assets/models/**", "./node_modules/onnxruntime-node/bin/**"],
  },
  outputFileTracingExcludes: {
    "/api/events/[id]/generate": [
      "./node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime_providers_cuda.so",
      "./node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime_providers_tensorrt.so",
      "./node_modules/onnxruntime-node/bin/napi-v3/darwin/**",
      "./node_modules/onnxruntime-node/bin/napi-v3/win32/**",
    ],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }],
  },
};

export default nextConfig;
