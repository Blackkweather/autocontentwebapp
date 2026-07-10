// onnxruntime-node@1.17.3 (pinned: newer builds require macOS 14+) declares
// "types": "dist/index.d.ts" but doesn't ship the file. Its actual API surface
// is a re-export of onnxruntime-common, which does ship types.
declare module "onnxruntime-node" {
  export * from "onnxruntime-common";
}
