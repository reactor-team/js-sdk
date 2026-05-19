// Copyright (c) 2024-2026 Reactor Technologies, Inc.
// SPDX-License-Identifier: Apache-2.0

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
