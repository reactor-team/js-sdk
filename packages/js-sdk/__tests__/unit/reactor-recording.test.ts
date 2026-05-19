import { describe, it, expect, vi, beforeEach } from "vitest";
import { Reactor } from "../../src/core/Reactor";
import type { ClipReadyPayload } from "../../src/utils/recording";

const MOCK_SESSION_ID = "85ded560-014c-42df-8902-89dfbca8fa00";

const MOCK_INITIAL_RESPONSE = {
  session_id: MOCK_SESSION_ID,
  model: { name: "echo" },
  state: "CREATED",
};

const MOCK_FULL_SESSION_RESPONSE = {
  session_id: MOCK_SESSION_ID,
  model: { name: "echo" },
  state: "ACTIVE",
  selected_transport: { protocol: "webrtc", version: "1.0" },
  capabilities: {
    protocol_version: "1.0",
    tracks: [
      { name: "main_video", kind: "video", direction: "recvonly" as const },
    ],
  },
};

let transportHandlers: Record<string, (...args: any[]) => void> = {};
let mockTransportClient: any;

vi.mock("../../src/core/CoordinatorClient", () => ({
  CoordinatorClient: vi.fn().mockImplementation(() => ({
    createSession: vi.fn().mockResolvedValue(MOCK_INITIAL_RESPONSE),
    pollSessionReady: vi.fn().mockResolvedValue(MOCK_FULL_SESSION_RESPONSE),
    getSession: vi.fn().mockResolvedValue(MOCK_FULL_SESSION_RESPONSE),
    terminateSession: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn(),
    getSessionId: vi.fn().mockReturnValue(MOCK_SESSION_ID),
  })),
}));

vi.mock("../../src/core/LocalCoordinatorClient", () => ({
  LocalCoordinatorClient: vi.fn().mockImplementation(() => ({
    createSession: vi.fn().mockResolvedValue(MOCK_INITIAL_RESPONSE),
    pollSessionReady: vi.fn().mockResolvedValue(MOCK_FULL_SESSION_RESPONSE),
    getSession: vi.fn().mockResolvedValue(MOCK_FULL_SESSION_RESPONSE),
    terminateSession: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn(),
  })),
}));

vi.mock("../../src/core/WebRTCTransportClient", () => ({
  WebRTCTransportClient: vi.fn().mockImplementation(() => {
    transportHandlers = {};
    mockTransportClient = {
      warmup: vi.fn().mockResolvedValue(undefined),
      prepare: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn(),
      publishTrack: vi.fn().mockResolvedValue(undefined),
      unpublishTrack: vi.fn().mockResolvedValue(undefined),
      on: vi.fn((event: string, handler: any) => {
        transportHandlers[event] = handler;
      }),
      off: vi.fn(),
      getStats: vi.fn().mockReturnValue(undefined),
      getTransportTimings: vi.fn().mockReturnValue(undefined),
      abort: vi.fn(),
    };
    return mockTransportClient;
  }),
}));

/**
 * Drive the Reactor to "ready" state via its mocked transport so the
 * recording API guards pass.
 */
async function connectedReactor(local = false): Promise<Reactor> {
  const r = new Reactor({ modelName: "echo", local });
  if (local) {
    await r.connect();
  } else {
    await r.connect("jwt-token");
  }
  // Drive the transport to "connected" so status flips to "ready".
  transportHandlers["statusChanged"]?.("connected");
  return r;
}

function emitRuntimeMessage(message: unknown): void {
  // Mirrors WebRTCTransportClient.onmessage: emits ("message", inner, scope)
  transportHandlers["message"]?.(message, "runtime");
}

function buildClipReady(overrides: Partial<ClipReadyPayload> = {}): {
  type: string;
  data: ClipReadyPayload;
} {
  return {
    type: "clipReady",
    data: {
      session_id: "rec-1",
      kind: "snap",
      start_marker: 120,
      end_marker: 150,
      now_marker: 150,
      // Far-future epoch so any test that surfaces predictedReadyAtMs
      // without overriding it doesn't accidentally trip a past-deadline
      // path inside fetchPlaylist (these tests never go on-network).
      predicted_ready_at_ms: 9_999_999_999_999,
      playlist_url:
        "https://api.reactor.inc/clips?session_id=rec-1&start=120&end=150",
      ...overrides,
    },
  };
}

describe("Reactor recording API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transportHandlers = {};
    mockTransportClient = undefined;
  });

  // ── Pre-flight guards ──────────────────────────────────────────────────

  describe("requestClip()", () => {
    it("rejects with INVALID_DURATION on zero", async () => {
      const r = await connectedReactor();
      await expect(r.requestClip(0)).rejects.toMatchObject({
        code: "INVALID_DURATION",
      });
      await r.disconnect();
    });

    it("rejects with INVALID_DURATION on negative", async () => {
      const r = await connectedReactor();
      await expect(r.requestClip(-5)).rejects.toMatchObject({
        code: "INVALID_DURATION",
      });
      await r.disconnect();
    });

    it("rejects with INVALID_DURATION on NaN", async () => {
      const r = await connectedReactor();
      await expect(r.requestClip(Number.NaN)).rejects.toMatchObject({
        code: "INVALID_DURATION",
      });
      await r.disconnect();
    });

    it("rejects with INVALID_DURATION on Infinity", async () => {
      const r = await connectedReactor();
      await expect(
        r.requestClip(Number.POSITIVE_INFINITY)
      ).rejects.toMatchObject({
        code: "INVALID_DURATION",
      });
      await r.disconnect();
    });

    it("rejects with DISCONNECTED before connect", async () => {
      const r = new Reactor({ modelName: "echo" });
      await expect(r.requestClip(30)).rejects.toMatchObject({
        code: "DISCONNECTED",
      });
    });

    it("sends a runtime requestClip message", async () => {
      const r = await connectedReactor();
      // Don't await — would hang waiting for clipReady.
      const promise = r.requestClip(30);
      expect(mockTransportClient.sendCommand).toHaveBeenCalledWith(
        "requestClip",
        { duration_seconds: 30 },
        "runtime",
        undefined
      );
      // Resolve so the test cleans up.
      emitRuntimeMessage(buildClipReady());
      await promise;
      await r.disconnect();
    });

    it("resolves with a Clip when clipReady arrives", async () => {
      const r = await connectedReactor();
      const promise = r.requestClip(30);
      emitRuntimeMessage(buildClipReady());
      const clip = await promise;
      expect(clip.sessionId).toBe("rec-1");
      expect(clip.kind).toBe("snap");
      expect(clip.startMarker).toBe(120);
      expect(clip.endMarker).toBe(150);
      expect(clip.nowMarker).toBe(150);
      expect(clip.predictedReadyAtMs).toBe(9_999_999_999_999);
      expect(clip.playlistUrl).toContain("session_id=rec-1");
      await r.disconnect();
    });

    it("rejects with RECORDER_DISABLED on clipFailed { reason: 'recorder disabled' }", async () => {
      const r = await connectedReactor();
      const promise = r.requestClip(30);
      emitRuntimeMessage({
        type: "clipFailed",
        data: { reason: "recorder disabled" },
      });
      await expect(promise).rejects.toMatchObject({
        code: "RECORDER_DISABLED",
        reason: "recorder disabled",
      });
      await r.disconnect();
    });

    it("rejects with INTERNAL_ERROR on unrecognized clipFailed reason", async () => {
      const r = await connectedReactor();
      const promise = r.requestClip(30);
      emitRuntimeMessage({
        type: "clipFailed",
        data: { reason: "internal error: boom" },
      });
      await expect(promise).rejects.toMatchObject({
        code: "INTERNAL_ERROR",
        reason: "internal error: boom",
      });
      await r.disconnect();
    });

    it("rejects with INTERNAL_ERROR on malformed clipReady", async () => {
      const r = await connectedReactor();
      const promise = r.requestClip(30);
      emitRuntimeMessage({
        type: "clipReady",
        data: { session_id: "rec-1" },
      });
      await expect(promise).rejects.toMatchObject({
        code: "INTERNAL_ERROR",
      });
      await r.disconnect();
    });
  });

  describe("requestRecording()", () => {
    it("sends a runtime requestRecording message with empty body", async () => {
      const r = await connectedReactor();
      const promise = r.requestRecording();
      expect(mockTransportClient.sendCommand).toHaveBeenCalledWith(
        "requestRecording",
        {},
        "runtime",
        undefined
      );
      emitRuntimeMessage(
        buildClipReady({
          kind: "recording",
          start_marker: 0,
          end_marker: 60,
          now_marker: 60,
        })
      );
      const clip = await promise;
      expect(clip.kind).toBe("recording");
      expect(clip.startMarker).toBe(0);
      await r.disconnect();
    });

    it("rejects with DISCONNECTED before connect", async () => {
      const r = new Reactor({ modelName: "echo" });
      await expect(r.requestRecording()).rejects.toMatchObject({
        code: "DISCONNECTED",
      });
    });
  });

  // ── FIFO correlation ──────────────────────────────────────────────────

  describe("FIFO correlator", () => {
    it("matches two concurrent requests in receipt order", async () => {
      const r = await connectedReactor();
      const p1 = r.requestClip(10);
      const p2 = r.requestClip(20);

      emitRuntimeMessage(buildClipReady({ session_id: "first" }));
      emitRuntimeMessage(buildClipReady({ session_id: "second" }));

      const [clip1, clip2] = await Promise.all([p1, p2]);
      expect(clip1.sessionId).toBe("first");
      expect(clip2.sessionId).toBe("second");
      await r.disconnect();
    });

    it("ignores extra clipReady envelopes when no requests are pending", async () => {
      const r = await connectedReactor();
      // Should not throw.
      emitRuntimeMessage(buildClipReady());
      await r.disconnect();
    });

    it("does not interfere with non-clip runtime messages", async () => {
      const r = await connectedReactor();
      const promise = r.requestClip(30);

      // Random platform message should be ignored by the correlator.
      emitRuntimeMessage({ type: "modelCapabilities", data: {} });

      // Now resolve the actual request.
      emitRuntimeMessage(buildClipReady());
      await promise;
      await r.disconnect();
    });
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────

  describe("lifecycle", () => {
    it("rejects pending requests with DISCONNECTED on disconnect", async () => {
      const r = await connectedReactor();
      const p1 = r.requestClip(10);
      const p2 = r.requestRecording();

      await r.disconnect();

      await expect(p1).rejects.toMatchObject({ code: "DISCONNECTED" });
      await expect(p2).rejects.toMatchObject({ code: "DISCONNECTED" });
    });
  });

  // ── URL rewrite for local mode ────────────────────────────────────────

  describe("local mode", () => {
    it("rewrites playlist URL to the configured coordinator URL", async () => {
      const r = await connectedReactor(true);
      const promise = r.requestClip(30);
      emitRuntimeMessage(
        buildClipReady({
          playlist_url:
            "http://0.0.0.0:8080/clips?session_id=rec-1&start=0&end=30",
        })
      );
      const clip = await promise;
      // LOCAL_COORDINATOR_URL is http://localhost:8080.
      expect(clip.playlistUrl).toBe(
        "http://localhost:8080/clips?session_id=rec-1&start=0&end=30"
      );
      await r.disconnect();
    });

    it("does NOT rewrite playlist URL in remote mode", async () => {
      const r = await connectedReactor(false);
      const promise = r.requestClip(30);
      emitRuntimeMessage(
        buildClipReady({
          playlist_url:
            "https://api.reactor.inc/clips?session_id=rec-1&start=0&end=30",
        })
      );
      const clip = await promise;
      expect(clip.playlistUrl).toBe(
        "https://api.reactor.inc/clips?session_id=rec-1&start=0&end=30"
      );
      await r.disconnect();
    });
  });
});
