// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { LocalCoordinatorClient } from "../../src/core/LocalCoordinatorClient";
import { ConflictError } from "../../src/types";

describe("LocalCoordinatorClient", () => {
  const mockFetch = vi.fn();
  let client: LocalCoordinatorClient;

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    client = new LocalCoordinatorClient("http://localhost:8080");
  });

  // ── getIceServers() ────────────────────────────────────────────────────

  describe("getIceServers()", () => {
    it("fetches from /ice_servers without auth headers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ice_servers: [{ uris: ["stun:stun.l.google.com:19302"] }],
          }),
      });

      const servers = await client.getIceServers();

      expect(servers).toEqual([{ urls: ["stun:stun.l.google.com:19302"] }]);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8080/ice_servers",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("throws on failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      await expect(client.getIceServers()).rejects.toThrow(
        "Failed to get ICE servers"
      );
    });
  });

  // ── createSession() ────────────────────────────────────────────────────

  describe("createSession()", () => {
    it("posts to /start_session and always returns 'local'", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const id = await client.createSession("v=0\r\noffer");

      expect(id).toBe("local");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8080/start_session",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("throws on failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      await expect(client.createSession("v=0")).rejects.toThrow(
        "Failed to send local start session"
      );
    });
  });

  // ── connect() ─────────────────────────────────────────────────────────

  describe("connect()", () => {
    it("sends the SDP offer and returns the answer", async () => {
      // createSession first to stash the SDP
      mockFetch.mockResolvedValueOnce({ ok: true });
      await client.createSession("v=0\r\noffer");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sdp: "answer-sdp", type: "answer" }),
      });

      const result = await client.connect("local", "");
      expect(result.sdpAnswer).toBe("answer-sdp");
      expect(result.sdpPollingAttempts).toBe(0);
    });

    it("throws ConflictError on 409", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      await client.createSession("v=0");

      mockFetch.mockResolvedValueOnce({ ok: false, status: 409 });
      await expect(client.connect("local", "offer")).rejects.toThrow(
        ConflictError
      );
    });

    it("throws on other errors", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      await client.createSession("v=0");

      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      await expect(client.connect("local", "offer")).rejects.toThrow(
        "Failed to get SDP answer"
      );
    });
  });

  // ── terminateSession() ────────────────────────────────────────────────

  describe("terminateSession()", () => {
    it("posts to /stop_session", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      await client.terminateSession();
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8080/stop_session",
        expect.objectContaining({ method: "POST" })
      );
    });
  });
});
