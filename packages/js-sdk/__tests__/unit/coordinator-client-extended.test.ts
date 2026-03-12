// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CoordinatorClient } from "../../src/core/CoordinatorClient";

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

  async function createSessionHelper(): Promise<string> {
    const sid = "550e8400-e29b-41d4-a716-446655440000";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ session_id: sid }),
    });
    await client.createSession("v=0");
    return sid;
  }

  // ── getSession() error path ────────────────────────────────────────────

  describe("getSession() error path", () => {
    it("throws on non-OK response", async () => {
      await createSessionHelper();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });

      await expect(client.getSession()).rejects.toThrow(
        "Failed to get session: 500"
      );
    });
  });

  // ── getSessionId() ─────────────────────────────────────────────────────

  describe("getSessionId()", () => {
    it("returns session id after createSession", async () => {
      const sid = await createSessionHelper();
      expect(client.getSessionId()).toBe(sid);
    });

    it("returns undefined initially", () => {
      expect(client.getSessionId()).toBeUndefined();
    });
  });

  // ── sleep / abort interaction ──────────────────────────────────────────

  describe("sleep / abort interaction", () => {
    it("abort() rejects pending connect with AbortError", async () => {
      mockFetch.mockResolvedValue({ status: 202, ok: true });

      const promise = client.connect("session-123", "offer-sdp", 20);

      // Let the async chain resolve fetches and enter sleep()
      await new Promise((r) => setTimeout(r, 50));

      client.abort();

      await expect(promise).rejects.toThrow(/aborted/i);
    });

    it("abort() still allows subsequent requests", async () => {
      client.abort();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ice_servers: [] }),
      });

      const servers = await client.getIceServers();
      expect(servers).toEqual([]);
    });
  });

  // ── sendSdpOffer error path (through connect) ─────────────────────────

  describe("sendSdpOffer error path", () => {
    it("throws on unexpected PUT status", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 500,
        ok: false,
        text: () => Promise.resolve("server error"),
      });

      await expect(client.connect("session-123", "offer-sdp")).rejects.toThrow(
        "Failed to send SDP offer: 500"
      );
    });
  });

  // ── Multi-attempt backoff ──────────────────────────────────────────────

  describe("Multi-attempt backoff", () => {
    it("polls multiple times with backoff before success", async () => {
      vi.useFakeTimers();
      try {
        // PUT → 202, GET → 202, GET → 202, GET → 200
        mockFetch
          .mockResolvedValueOnce({ status: 202, ok: true })
          .mockResolvedValueOnce({ status: 202, ok: true })
          .mockResolvedValueOnce({ status: 202, ok: true })
          .mockResolvedValueOnce({
            status: 200,
            ok: true,
            json: () =>
              Promise.resolve({
                sdp_answer: "final-answer",
                extra_args: {},
              }),
          });

        const promise = client.connect("session-123", "offer-sdp", 5);

        // Advance through first backoff (500ms) — triggers second poll (202)
        await vi.advanceTimersByTimeAsync(500);
        // Advance through second backoff (1000ms) — triggers third poll (200)
        await vi.advanceTimersByTimeAsync(1000);

        const answer = await promise;
        expect(answer).toBe("final-answer");
        expect(mockFetch).toHaveBeenCalledTimes(4);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
