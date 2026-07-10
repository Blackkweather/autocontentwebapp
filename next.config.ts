import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native addons (@napi-rs/canvas, sharp, onnxruntime) must be required at runtime, not bundled by Turbopack/webpack.
  serverExternalPackages: ["@napi-rs/canvas", "sharp", "onnxruntime-node"],
  // Fonts, the matting model, and native bindings must ship with the serverless function bundle.
  outputFileTracingIncludes: {
    "/api/events/[id]/generate": ["./assets/fonts/**", "./assets/models/**"],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }],
  },
};

export default nextConfig;
