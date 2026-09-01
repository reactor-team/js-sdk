import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // When this example lives inside a monorepo checkout, Next's output
  // tracing can guess the wrong workspace root from a parent pnpm-lock.yaml
  // and print a noisy warning on every `next dev` / `next build`. Pin the
  // root to this directory so the standalone-clone case and the in-repo case
  // both resolve here. If you copy this folder OUT to its own project, this
  // line is harmless.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
