// Copyright (c) 2024-2026 Reactor Technologies, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CoordinatorClient } from "../../src/core/CoordinatorClient";

const MOCK_SESSION_ID = "85ded560-014c-42df-8902-89dfbca8fa00";

const MOCK_CLUSTER = "sup.us-west-2.aws.prod.reactor.inc";
const MOCK_SERVER_INFO = { server_version: "1.5.0" };

const MOCK_INITIAL_RESPONSE = {
  session_id: MOCK_SESSION_ID,
  model: { name: "echo" },
  server_info: MOCK_SERVER_INFO,
  state: "CREATED",
  cluster: MOCK_CLUSTER,
};

const MOCK_FULL_SESSION_RESPONSE = {
  session_id: MOCK_SESSION_ID,
  model: { name: "echo" },
  server_info: MOCK_SERVER_INFO,
  state: "ACTIVE",
  cluster: MOCK_CLUSTER,
  selected_transport: { protocol: "webrtc", version: "1.0" },
  capabilities: {
    protocol_version: "1.0",
    tracks: [{ name: "main_video", kind: "video", direction: "recvonly" }],
  },
};

describe("CoordinatorClient (extended)", () => {
  const mockFetch = vi.fn();
  let client: CoordinatorClient;

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();

    client = new CoordinatorClient({
      baseUrl: "https://api.test.com",
      jwtToken: "test-jwt",
      model: "echo",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function createSessionHelper() {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
    });
    await client.createSession();
  }

  // ── pollSessionReady() edge cases ──────────────────────────────────────

  describe("pollSessionReady() edge cases", () => {
    it("throws on non-OK response during polling", async () => {
      await createSessionHelper();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });

      await expect(client.pollSessionReady()).rejects.toThrow(
        "Failed to poll session: 500"
      );
    });

    it("checks version mismatch during polling", async () => {
      await createSessionHelper();

      mockFetch.mockResolvedValueOnce({ ok: false, status: 426 });
      await expect(client.pollSessionReady()).rejects.toThrow(
        "CLIENT_VERSION_TOO_OLD"
      );
    });
  });

  // ── sleep / abort interaction ──────────────────────────────────────────

  describe("sleep / abort interaction", () => {
    it("abort() rejects pending pollSessionReady with AbortError", async () => {
      await createSessionHelper();

      // Return PENDING responses so it keeps polling
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            session_id: MOCK_SESSION_ID,
            model: { name: "echo" },
            server_info: MOCK_SERVER_INFO,
            state: "PENDING",
            cluster: MOCK_CLUSTER,
          }),
      });

      const promise = client.pollSessionReady({ maxAttempts: 20 });

      await new Promise((r) => setTimeout(r, 50));
      client.abort();

      await expect(promise).rejects.toThrow(/aborted/i);
    });

    it("abort() still allows subsequent requests", async () => {
      client.abort();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
      });

      await expect(client.createSession()).resolves.toBeDefined();
    });
  });

  // ── Multi-attempt backoff ──────────────────────────────────────────────

  describe("Multi-attempt backoff", () => {
    it("polls with exponential backoff before success", async () => {
      vi.useFakeTimers();
      try {
        await createSessionHelper();

        // First poll — PENDING
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              session_id: MOCK_SESSION_ID,
              model: { name: "echo" },
              server_info: MOCK_SERVER_INFO,
              state: "PENDING",
              cluster: MOCK_CLUSTER,
            }),
        });

        // Second poll — still PENDING
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              session_id: MOCK_SESSION_ID,
              model: { name: "echo" },
              server_info: MOCK_SERVER_INFO,
              state: "WAITING",
              cluster: MOCK_CLUSTER,
            }),
        });

        // Third poll — capabilities ready
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(MOCK_FULL_SESSION_RESPONSE),
        });

        const promise = client.pollSessionReady({ maxAttempts: 10 });

        // Advance through first backoff (500ms)
        await vi.advanceTimersByTimeAsync(500);
        // Advance through second backoff (1000ms)
        await vi.advanceTimersByTimeAsync(1000);

        const result = await promise;
        expect(result.session_id).toBe(MOCK_SESSION_ID);
        expect(result.capabilities.tracks).toHaveLength(1);
        // createSession (1) + 3 polls = 4 total
        expect(mockFetch).toHaveBeenCalledTimes(4);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ── getSessionInfo() error path ────────────────────────────────────────

  describe("getSessionInfo() error path", () => {
    it("throws on non-OK response", async () => {
      await createSessionHelper();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });

      await expect(client.getSessionInfo()).rejects.toThrow(
        "Failed to get session info: 500"
      );
    });
  });

  // ── restartSession() error path ────────────────────────────────────────

  describe("restartSession() error path", () => {
    it("throws on non-OK response", async () => {
      await createSessionHelper();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });

      await expect(client.restartSession()).rejects.toThrow(
        "Failed to restart session: 500"
      );
    });
  });
});
