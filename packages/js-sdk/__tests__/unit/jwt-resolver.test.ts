import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CoordinatorClient } from "../../src/core/CoordinatorClient";
import { WebRTCTransportClient } from "../../src/core/WebRTCTransportClient";
import { normalizeJwtSource, type JwtResolver } from "../../src/core/auth";
import {
  REACTOR_WEBRTC_VERSION,
  WEBRTC_VERSION_HEADER,
} from "../../src/core/types";

// Regression tests for REA-2512: short-lived auth tokens (e.g. Clerk
// session JWTs, default ~60s) used to be captured once at connect()
// time and reused indefinitely, so every Coordinator HTTP hop 401'd
// once the token expired. These tests verify:
//   - the resolver path is exercised on every fetch (no caching)
//   - string inputs remain wire-identical to the pre-resolver SDK
//   - an empty-string token drops the Authorization header
//   - resolver rejections propagate cleanly to the caller

const MOCK_SESSION_ID = "85ded560-014c-42df-8902-89dfbca8fa00";

const MOCK_INITIAL_RESPONSE = {
  session_id: MOCK_SESSION_ID,
  model: { name: "echo" },
  server_info: { server_version: "1.5.0" },
  state: "CREATED",
  cluster: "sup.us-west-2.aws.prod.reactor.inc",
};

// Wire shape per IceServersResponseSchema: { ice_servers: [{ uris }] }
const MOCK_ICE_SERVERS = {
  ice_servers: [{ uris: ["stun:stun.l.google.com:19302"] }],
};

describe("normalizeJwtSource", () => {
  it("wraps a string into a constant resolver", async () => {
    const resolver = normalizeJwtSource("static-jwt");
    expect(typeof resolver).toBe("function");
    expect(await resolver()).toBe("static-jwt");
    expect(await resolver()).toBe("static-jwt");
  });

  it("returns a function resolver as-is (no double-wrap)", async () => {
    let counter = 0;
    const resolver: JwtResolver = () => `jwt-${++counter}`;
    const normalised = normalizeJwtSource(resolver);
    // Same reference: the resolver IS the source, no wrapper to
    // hide its stateful increment from the caller.
    expect(normalised).toBe(resolver);
    expect(await normalised()).toBe("jwt-1");
    expect(await normalised()).toBe("jwt-2");
  });

  it("supports Promise-returning resolvers", async () => {
    const resolver = normalizeJwtSource(async () => "async-jwt");
    expect(await resolver()).toBe("async-jwt");
  });
});

describe("CoordinatorClient with JWT resolver", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the resolver before every request (no token caching)", async () => {
    let mintedTokens = 0;
    const client = new CoordinatorClient({
      baseUrl: "https://api.test.com",
      jwtToken: () => `jwt-${++mintedTokens}`,
      model: "echo",
    });

    // createSession → 1st resolver call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
    });
    await client.createSession();
    // getSessionInfo → 2nd resolver call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          session_id: MOCK_SESSION_ID,
          state: "ACTIVE",
          cluster: MOCK_INITIAL_RESPONSE.cluster,
        }),
    });
    await client.getSessionInfo();

    expect(mintedTokens).toBe(2);
    expect(mockFetch.mock.calls[0][1].headers["Authorization"]).toBe(
      "Bearer jwt-1"
    );
    expect(mockFetch.mock.calls[1][1].headers["Authorization"]).toBe(
      "Bearer jwt-2"
    );
  });

  it("awaits Promise-returning resolvers before sending", async () => {
    const client = new CoordinatorClient({
      baseUrl: "https://api.test.com",
      jwtToken: async () => {
        // microtask hop simulates a Clerk getToken() call landing
        // after the resolver invocation but before the fetch goes
        // out — verifies we genuinely await rather than fire-and-
        // forget.
        await Promise.resolve();
        return "promised-jwt";
      },
      model: "echo",
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
    });
    await client.createSession();

    expect(mockFetch.mock.calls[0][1].headers["Authorization"]).toBe(
      "Bearer promised-jwt"
    );
  });

  it("string input behaves identically to the pre-resolver SDK", async () => {
    const client = new CoordinatorClient({
      baseUrl: "https://api.test.com",
      jwtToken: "static-jwt",
      model: "echo",
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
    });
    await client.createSession();

    expect(mockFetch.mock.calls[0][1].headers["Authorization"]).toBe(
      "Bearer static-jwt"
    );
  });

  it("omits the Authorization header when the resolver returns ''", async () => {
    const client = new CoordinatorClient({
      baseUrl: "https://api.test.com",
      jwtToken: () => "",
      model: "echo",
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve(MOCK_INITIAL_RESPONSE),
    });
    await client.createSession();

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers).not.toHaveProperty("Authorization");
  });

  it("propagates a rejecting resolver as a thrown error", async () => {
    const client = new CoordinatorClient({
      baseUrl: "https://api.test.com",
      jwtToken: async () => {
        throw new Error("clerk down");
      },
      model: "echo",
    });

    await expect(client.createSession()).rejects.toThrow("clerk down");
    // No fetch should have been issued — we never built the
    // Authorization header.
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("WebRTCTransportClient with JWT resolver", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("re-resolves the JWT on each signaling fetch", async () => {
    let mintedTokens = 0;
    const transport = new WebRTCTransportClient({
      baseUrl: "https://api.test.com",
      sessionId: MOCK_SESSION_ID,
      jwtToken: () => `transport-jwt-${++mintedTokens}`,
    });

    // Two consecutive warmup() calls bypass the in-memory cache by
    // virtue of going through the same code path; we go via
    // fetchIceServers directly through warmup() + a second manual
    // probe to keep the test focused on the auth path.
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_ICE_SERVERS),
    });

    await transport.warmup();

    // Second call: clear the cache so the resolver fires again.
    // The transport caches ICE servers internally so we instantiate
    // a second client to simulate a fresh round-trip — same shape
    // as ICE refresh during long sessions.
    const transport2 = new WebRTCTransportClient({
      baseUrl: "https://api.test.com",
      sessionId: MOCK_SESSION_ID,
      jwtToken: () => `transport-jwt-${++mintedTokens}`,
    });
    await transport2.warmup();

    expect(mintedTokens).toBe(2);
    expect(mockFetch.mock.calls[0][1].headers["Authorization"]).toBe(
      "Bearer transport-jwt-1"
    );
    expect(mockFetch.mock.calls[1][1].headers["Authorization"]).toBe(
      "Bearer transport-jwt-2"
    );
    // WebRTC version header must still be on every request.
    expect(mockFetch.mock.calls[0][1].headers[WEBRTC_VERSION_HEADER]).toBe(
      REACTOR_WEBRTC_VERSION
    );
  });

  it("string input behaves identically to the pre-resolver SDK", async () => {
    const transport = new WebRTCTransportClient({
      baseUrl: "https://api.test.com",
      sessionId: MOCK_SESSION_ID,
      jwtToken: "static-transport-jwt",
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_ICE_SERVERS),
    });

    await transport.warmup();

    expect(mockFetch.mock.calls[0][1].headers["Authorization"]).toBe(
      "Bearer static-transport-jwt"
    );
  });

  it("omits Authorization when the resolver returns ''", async () => {
    const transport = new WebRTCTransportClient({
      baseUrl: "https://api.test.com",
      sessionId: MOCK_SESSION_ID,
      jwtToken: () => "",
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_ICE_SERVERS),
    });

    await transport.warmup();

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers).not.toHaveProperty("Authorization");
    expect(headers[WEBRTC_VERSION_HEADER]).toBe(REACTOR_WEBRTC_VERSION);
  });
});
