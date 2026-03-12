// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CoordinatorClient } from "../../src/core/CoordinatorClient";

describe("CoordinatorClient", () => {
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

  // ── getIceServers() ────────────────────────────────────────────────────

  describe("getIceServers()", () => {
    it("fetches and transforms ICE servers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ice_servers: [
              {
                uris: ["stun:stun.example.com:3478"],
                credentials: { username: "u", password: "p" },
              },
            ],
          }),
      });

      const servers = await client.getIceServers();
      expect(servers).toEqual([
        {
          urls: ["stun:stun.example.com:3478"],
          username: "u",
          credential: "p",
        },
      ]);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/ice_servers?model=echo",
        expect.objectContaining({
          method: "GET",
          headers: { Authorization: "Bearer test-jwt" },
        })
      );
    });

    it("throws on non-OK response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
      await expect(client.getIceServers()).rejects.toThrow(
        "Failed to fetch ICE servers: 401"
      );
    });
  });

  // ── createSession() ────────────────────────────────────────────────────

  describe("createSession()", () => {
    it("sends the correct body and returns the session ID", async () => {
      const sid = "550e8400-e29b-41d4-a716-446655440000";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ session_id: sid }),
      });

      const result = await client.createSession("v=0\r\noffer");

      expect(result).toBe(sid);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model.name).toBe("echo");
      expect(body.sdp_offer).toBe("v=0\r\noffer");
    });

    it("throws on server error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });
      await expect(client.createSession("v=0")).rejects.toThrow(
        "Failed to create session: 500"
      );
    });
  });

  // ── getSession() ──────────────────────────────────────────────────────

  describe("getSession()", () => {
    it("throws when no session has been created", async () => {
      await expect(client.getSession()).rejects.toThrow("No active session");
    });

    it("returns session info after creation", async () => {
      const sid = "550e8400-e29b-41d4-a716-446655440000";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ session_id: sid }),
      });
      await client.createSession("v=0");

      const info = { session_id: sid, state: 4 };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(info),
      });

      const result = await client.getSession();
      expect(result.session_id).toBe(sid);
    });
  });

  // ── terminateSession() ────────────────────────────────────────────────

  describe("terminateSession()", () => {
    it("is a no-op without an active session", async () => {
      await client.terminateSession();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("sends DELETE to the correct URL", async () => {
      const sid = "550e8400-e29b-41d4-a716-446655440000";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ session_id: sid }),
      });
      await client.createSession("v=0");

      mockFetch.mockResolvedValueOnce({ ok: true });
      await client.terminateSession();

      const [url, opts] = mockFetch.mock.calls[1];
      expect(url).toBe(`https://api.test.com/sessions/${sid}`);
      expect(opts.method).toBe("DELETE");
    });

    it("clears local state on 404 (session already gone)", async () => {
      const sid = "550e8400-e29b-41d4-a716-446655440000";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ session_id: sid }),
      });
      await client.createSession("v=0");

      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      await expect(client.terminateSession()).resolves.toBeUndefined();

      // Second terminate should be a no-op (state was cleared)
      mockFetch.mockClear();
      await client.terminateSession();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("throws on unexpected error codes", async () => {
      const sid = "550e8400-e29b-41d4-a716-446655440000";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ session_id: sid }),
      });
      await client.createSession("v=0");

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("oops"),
      });
      await expect(client.terminateSession()).rejects.toThrow(
        "Failed to terminate session: 500"
      );
    });
  });

  // ── connect() / SDP exchange ──────────────────────────────────────────

  describe("connect()", () => {
    it("returns the answer immediately on 200", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({ sdp_answer: "answer-sdp", extra_args: {} }),
      });

      const result = await client.connect("session-123", "offer-sdp");
      expect(result.sdpAnswer).toBe("answer-sdp");
      expect(result.sdpPollingAttempts).toBe(0);
    });

    it("polls when PUT returns 202, then succeeds", async () => {
      // PUT → 202
      mockFetch.mockResolvedValueOnce({ status: 202, ok: true });
      // GET → 202
      mockFetch.mockResolvedValueOnce({ status: 202, ok: true });
      // GET → 200
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({ sdp_answer: "polled-answer", extra_args: {} }),
      });

      const result = await client.connect("session-123", "offer-sdp", 3);
      expect(result.sdpAnswer).toBe("polled-answer");
      expect(result.sdpPollingAttempts).toBe(2);
    });

    it("goes directly to polling when no SDP offer is given", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({ sdp_answer: "direct-answer", extra_args: {} }),
      });

      const result = await client.connect("session-123", undefined, 2);
      expect(result.sdpAnswer).toBe("direct-answer");
      expect(result.sdpPollingAttempts).toBe(1);
      // Should be a GET, not PUT
      expect(mockFetch.mock.calls[0][1].method).toBe("GET");
    });

    it("throws after exhausting max attempts", async () => {
      mockFetch.mockResolvedValue({ status: 202, ok: true });

      await expect(client.connect("session-123", undefined, 2)).rejects.toThrow(
        "exceeded maximum attempts"
      );
    });

    it("throws on unexpected HTTP error during polling", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 500,
        ok: false,
        text: () => Promise.resolve("server error"),
      });

      await expect(client.connect("session-123", undefined, 3)).rejects.toThrow(
        "Failed to poll SDP answer: 500"
      );
    });
  });

  // ── abort() ───────────────────────────────────────────────────────────

  describe("abort()", () => {
    it("aborts in-flight requests and remains reusable", async () => {
      // Just verify it doesn't throw
      expect(() => client.abort()).not.toThrow();

      // Client should still work after abort
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ice_servers: [] }),
      });
      await expect(client.getIceServers()).resolves.toBeDefined();
    });
  });
});
