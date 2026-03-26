// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LocalCoordinatorClient } from "../../src/core/LocalCoordinatorClient";
import {
  API_VERSION_HEADER,
  API_ACCEPT_VERSION_HEADER,
  REACTOR_API_VERSION,
} from "../../src/core/types";

const MOCK_LOCAL_SESSION_RESPONSE = {
  session_id: "local",
  model: { name: "echo" },
  server_info: { server_version: "1.0.0" },
  state: "ACTIVE",
  cluster: "local",
  selected_transport: { protocol: "webrtc", version: "1.0" },
  capabilities: {
    protocol_version: "1.0",
    tracks: [{ name: "main_video", kind: "video", direction: "recvonly" }],
  },
};

describe("LocalCoordinatorClient", () => {
  const mockFetch = vi.fn();
  let client: LocalCoordinatorClient;

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    client = new LocalCoordinatorClient("http://localhost:8080", "echo");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── createSession() ────────────────────────────────────────────────────

  describe("createSession()", () => {
    it("posts to /start_session and returns CreateSessionResponse", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_LOCAL_SESSION_RESPONSE),
      });

      const result = await client.createSession();

      expect(result.session_id).toBe("local");
      expect(result.model.name).toBe("echo");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8080/start_session",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("sends version headers but no auth header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_LOCAL_SESSION_RESPONSE),
      });

      await client.createSession();

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers[API_VERSION_HEADER]).toBe(String(REACTOR_API_VERSION));
      expect(headers[API_ACCEPT_VERSION_HEADER]).toBe(
        String(REACTOR_API_VERSION)
      );
      expect(headers["Authorization"]).toBeUndefined();
    });

    it("passes extra_args when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_LOCAL_SESSION_RESPONSE),
      });

      await client.createSession({ custom: "value" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.extra_args).toEqual({ custom: "value" });
    });

    it("throws on failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Server Error"),
      });
      await expect(client.createSession()).rejects.toThrow(
        "Failed to start session: 500"
      );
    });
  });

  // ── pollSessionReady() ────────────────────────────────────────────────

  describe("pollSessionReady()", () => {
    it("returns cached response immediately after createSession", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_LOCAL_SESSION_RESPONSE),
      });
      await client.createSession();

      const result = await client.pollSessionReady();
      expect(result.session_id).toBe("local");
      expect(result.capabilities.tracks).toHaveLength(1);
      expect(result.selected_transport.protocol).toBe("webrtc");

      // No additional fetch calls — response was cached
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("throws when called before createSession", async () => {
      await expect(client.pollSessionReady()).rejects.toThrow(
        "No cached session response"
      );
    });
  });

  // ── terminateSession() ────────────────────────────────────────────────

  describe("terminateSession()", () => {
    it("is a no-op without an active session", async () => {
      await client.terminateSession();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("posts to /stop_session", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_LOCAL_SESSION_RESPONSE),
      });
      await client.createSession();

      mockFetch.mockResolvedValueOnce({ ok: true });
      await client.terminateSession();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8080/stop_session",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("clears session state after termination", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_LOCAL_SESSION_RESPONSE),
      });
      await client.createSession();

      mockFetch.mockResolvedValueOnce({ ok: true });
      await client.terminateSession();

      expect(client.getSessionId()).toBeUndefined();
    });

    it("continues even if stop_session fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_LOCAL_SESSION_RESPONSE),
      });
      await client.createSession();

      vi.spyOn(console, "error").mockImplementation(() => {});
      mockFetch.mockRejectedValueOnce(new Error("network error"));
      await expect(client.terminateSession()).resolves.toBeUndefined();
    });
  });

  // ── getSessionId() ─────────────────────────────────────────────────────

  describe("getSessionId()", () => {
    it("returns session id after createSession", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_LOCAL_SESSION_RESPONSE),
      });
      await client.createSession();
      expect(client.getSessionId()).toBe("local");
    });

    it("returns undefined initially", () => {
      expect(client.getSessionId()).toBeUndefined();
    });
  });
});
