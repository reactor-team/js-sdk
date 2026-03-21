// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CoordinatorClient } from "../../src/core/CoordinatorClient";
import {
  REACTOR_API_VERSION,
  REACTOR_SDK_VERSION,
  REACTOR_SDK_TYPE,
  REACTOR_WEBRTC_VERSION,
  API_VERSION_HEADER,
  API_ACCEPT_VERSION_HEADER,
  SessionState,
} from "../../src/core/types";

const MOCK_SESSION_ID = "85ded560-014c-42df-8902-89dfbca8fa00";

const MOCK_INITIAL_RESPONSE = {
  session_id: MOCK_SESSION_ID,
  model: { name: "echo" },
  state: "CREATED",
  cluster: "sup.us-west-2.aws.prod.reactor.inc",
};

const MOCK_FULL_SESSION_RESPONSE = {
  session_id: MOCK_SESSION_ID,
  model: { name: "echo" },
  state: "ACTIVE",
  selected_transport: { protocol: "webrtc", version: "1.0" },
  capabilities: {
    protocol_version: "1.0",
    tracks: [
      { name: "main_video", kind: "video", direction: "recvonly" },
    ],
  },
};

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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── createSession() ────────────────────────────────────────────────────

  describe("createSession()", () => {
    it("sends correct request body and returns InitialSessionResponse", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
      });

      const result = await client.createSession();

      expect(result.session_id).toBe(MOCK_SESSION_ID);
      expect(result.state).toBe("CREATED");
      expect(result.model.name).toBe("echo");

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.test.com/sessions");
      expect(opts.method).toBe("POST");

      const body = JSON.parse(opts.body);
      expect(body.model.name).toBe("echo");
      expect(body.client_info.sdk_version).toBe(REACTOR_SDK_VERSION);
      expect(body.client_info.sdk_type).toBe(REACTOR_SDK_TYPE);
      expect(body.supported_transports).toEqual([
        { protocol: "webrtc", version: REACTOR_WEBRTC_VERSION },
      ]);
    });

    it("sends versioning headers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
      });

      await client.createSession();

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers[API_VERSION_HEADER]).toBe(String(REACTOR_API_VERSION));
      expect(headers[API_ACCEPT_VERSION_HEADER]).toBe(
        String(REACTOR_API_VERSION)
      );
      expect(headers["Authorization"]).toBe("Bearer test-jwt");
    });

    it("passes extra_args when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
      });

      await client.createSession({ custom_param: "value" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.extra_args).toEqual({ custom_param: "value" });
    });

    it("throws on server error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });
      await expect(client.createSession()).rejects.toThrow(
        "Failed to create session: 500"
      );
    });

    it("throws on 426 version mismatch", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 426 });
      await expect(client.createSession()).rejects.toThrow(
        "CLIENT_VERSION_TOO_OLD"
      );
    });

    it("throws on 501 version mismatch", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 501 });
      await expect(client.createSession()).rejects.toThrow(
        "SERVER_VERSION_TOO_OLD"
      );
    });
  });

  // ── pollSessionReady() ────────────────────────────────────────────────

  describe("pollSessionReady()", () => {
    it("throws when no session has been created", async () => {
      await expect(client.pollSessionReady()).rejects.toThrow(
        "No active session"
      );
    });

    it("returns immediately when capabilities are present on first poll", async () => {
      // createSession first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
      });
      await client.createSession();

      // pollSessionReady — first poll returns full response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_FULL_SESSION_RESPONSE),
      });

      const result = await client.pollSessionReady();
      expect(result.session_id).toBe(MOCK_SESSION_ID);
      expect(result.capabilities.tracks).toHaveLength(1);
      expect(result.selected_transport.protocol).toBe("webrtc");
    });

    it("polls multiple times until capabilities are available", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
      });
      await client.createSession();

      // First poll — no capabilities yet
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            session_id: MOCK_SESSION_ID,
            model: { name: "echo" },
            state: "PENDING",
          }),
      });

      // Second poll — capabilities present
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_FULL_SESSION_RESPONSE),
      });

      const result = await client.pollSessionReady({ maxAttempts: 5 });
      expect(result.capabilities).toBeDefined();
      // createSession (1) + 2 polls
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("throws on terminal state CLOSED", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
      });
      await client.createSession();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            session_id: MOCK_SESSION_ID,
            model: { name: "echo" },
            state: SessionState.CLOSED,
          }),
      });

      await expect(client.pollSessionReady()).rejects.toThrow(
        "terminal state"
      );
    });

    it("throws on terminal state INACTIVE", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
      });
      await client.createSession();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            session_id: MOCK_SESSION_ID,
            model: { name: "echo" },
            state: SessionState.INACTIVE,
          }),
      });

      await expect(client.pollSessionReady()).rejects.toThrow(
        "terminal state"
      );
    });

    it("throws after exhausting max attempts", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
      });
      await client.createSession();

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            session_id: MOCK_SESSION_ID,
            model: { name: "echo" },
            state: "PENDING",
          }),
      });

      await expect(
        client.pollSessionReady({ maxAttempts: 2 })
      ).rejects.toThrow("maximum attempts");
    });
  });

  // ── getSession() ──────────────────────────────────────────────────────

  describe("getSession()", () => {
    it("throws when no session has been created", async () => {
      await expect(client.getSession()).rejects.toThrow("No active session");
    });

    it("returns full session details after creation", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
      });
      await client.createSession();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_FULL_SESSION_RESPONSE),
      });

      const result = await client.getSession();
      expect(result.session_id).toBe(MOCK_SESSION_ID);
      expect(result.capabilities.tracks).toHaveLength(1);
    });

    it("throws on non-OK response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
      });
      await client.createSession();

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

  // ── getSessionInfo() ──────────────────────────────────────────────────

  describe("getSessionInfo()", () => {
    it("throws when no session has been created", async () => {
      await expect(client.getSessionInfo()).rejects.toThrow(
        "No active session"
      );
    });

    it("returns slim session info", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
      });
      await client.createSession();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            session_id: MOCK_SESSION_ID,
            state: "ACTIVE",
            cluster: "sup.us-west-2.aws.prod.reactor.inc",
          }),
      });

      const result = await client.getSessionInfo();
      expect(result.session_id).toBe(MOCK_SESSION_ID);
      expect(result.state).toBe("ACTIVE");
    });
  });

  // ── restartSession() ──────────────────────────────────────────────────

  describe("restartSession()", () => {
    it("throws when no session has been created", async () => {
      await expect(client.restartSession()).rejects.toThrow(
        "No active session"
      );
    });

    it("sends PUT to /sessions/{id}", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
      });
      await client.createSession();

      mockFetch.mockResolvedValueOnce({ ok: true, status: 202 });
      await client.restartSession();

      const [url, opts] = mockFetch.mock.calls[1];
      expect(url).toBe(`https://api.test.com/sessions/${MOCK_SESSION_ID}`);
      expect(opts.method).toBe("PUT");
    });
  });

  // ── terminateSession() ────────────────────────────────────────────────

  describe("terminateSession()", () => {
    it("is a no-op without an active session", async () => {
      await client.terminateSession();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("sends DELETE to the correct URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
      });
      await client.createSession();

      mockFetch.mockResolvedValueOnce({ ok: true });
      await client.terminateSession();

      const [url, opts] = mockFetch.mock.calls[1];
      expect(url).toBe(`https://api.test.com/sessions/${MOCK_SESSION_ID}`);
      expect(opts.method).toBe("DELETE");
    });

    it("includes reason in request body when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
      });
      await client.createSession();

      mockFetch.mockResolvedValueOnce({ ok: true });
      await client.terminateSession("User terminated");

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.reason).toBe("User terminated");
    });

    it("clears local state on 404 (session already gone)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
      });
      await client.createSession();

      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      await expect(client.terminateSession()).resolves.toBeUndefined();

      mockFetch.mockClear();
      await client.terminateSession();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("throws on unexpected error codes", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
      });
      await client.createSession();

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

  // ── getSessionId() ─────────────────────────────────────────────────────

  describe("getSessionId()", () => {
    it("returns undefined initially", () => {
      expect(client.getSessionId()).toBeUndefined();
    });

    it("returns session id after createSession", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
      });
      await client.createSession();
      expect(client.getSessionId()).toBe(MOCK_SESSION_ID);
    });
  });

  // ── abort() ───────────────────────────────────────────────────────────

  describe("abort()", () => {
    it("aborts in-flight requests and remains reusable", async () => {
      expect(() => client.abort()).not.toThrow();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
      });
      await expect(client.createSession()).resolves.toBeDefined();
    });
  });
});
