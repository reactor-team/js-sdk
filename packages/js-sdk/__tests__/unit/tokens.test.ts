// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchInsecureJwtToken } from "../../src/utils/tokens";
import { DEFAULT_BASE_URL } from "../../src/core/Reactor";

describe("fetchInsecureJwtToken", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("returns the JWT token on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ jwt: "test-jwt" }),
    });

    const token = await fetchInsecureJwtToken("rk_test_key");
    expect(token).toBe("test-jwt");
  });

  it("uses DEFAULT_BASE_URL by default", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ jwt: "token" }),
    });

    await fetchInsecureJwtToken("rk_test_key");
    expect(mockFetch).toHaveBeenCalledWith(
      `${DEFAULT_BASE_URL}/tokens`,
      expect.any(Object)
    );
  });

  it("uses custom coordinator URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ jwt: "token" }),
    });

    await fetchInsecureJwtToken("rk_test_key", "https://custom.api.example");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://custom.api.example/tokens",
      expect.any(Object)
    );
  });

  it("sends API key in X-API-Key header", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ jwt: "token" }),
    });

    await fetchInsecureJwtToken("rk_my_secret_key");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "GET",
        headers: { "X-API-Key": "rk_my_secret_key" },
      })
    );
  });

  it("logs a security warning", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ jwt: "token" }),
    });

    await fetchInsecureJwtToken("rk_test_key");
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("SECURITY WARNING")
    );
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    await expect(fetchInsecureJwtToken("rk_bad_key")).rejects.toThrow(
      "Failed to create token: 401 Unauthorized"
    );
  });

  it("throws with error text on 500", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    await expect(fetchInsecureJwtToken("rk_test_key")).rejects.toThrow(
      "Failed to create token: 500 Internal Server Error"
    );
  });
});
