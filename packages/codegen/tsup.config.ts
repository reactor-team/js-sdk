// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    entry: ["src/cli.ts"],
    format: ["cjs"],
    sourcemap: true,
    banner: { js: "#!/usr/bin/env node" },
  },
]);
