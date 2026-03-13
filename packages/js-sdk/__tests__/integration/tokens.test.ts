// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect } from "vitest";
import { fetchInsecureToken } from "../../src/utils/tokens";
import { DEFAULT_BASE_URL } from "../../src/core/Reactor";

const API_KEY = process.env.REACTOR_API_KEY;
const COORDINATOR_URL = process.env.REACTOR_COORDINATOR_URL ?? DEFAULT_BASE_URL;

describe.skipIf(!API_KEY)("fetchInsecureToken — integration", () => {
  it("returns a valid JWT (3-segment base64 string)", async () => {
    const jwt = await fetchInsecureToken(API_KEY!, COORDINATOR_URL);
    expect(typeof jwt).toBe("string");
    expect(jwt.split(".")).toHaveLength(3);
  }, 15_000);

  it("rejects an invalid API key", async () => {
    await expect(
      fetchInsecureToken("rk_invalid_key_12345", COORDINATOR_URL)
    ).rejects.toThrow();
  }, 15_000);
});
