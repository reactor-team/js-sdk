// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["__tests__/setup.ts"],
    include: ["__tests__/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    clearMocks: true,
    unstubGlobals: true,
  },
});
