// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

/**
 * Tests for {@link RecordingClient} in isolation, against a fake
 * {@link RecordingClientHost}. The reactor-level integration is
 * exercised separately in `reactor-recording.test.ts`.
 */

import { describe, it, expect, vi } from "vitest";
import {
  RecordingClient,
  type RecordingClientHost,
} from "../../src/core/RecordingClient";
import type { ClipReadyPayload } from "../../src/utils/recording";
import type { ReactorStatus } from "../../src/types";

interface FakeHostHandles {
  host: RecordingClientHost;
  /** Push a runtime message to all subscribers. */
  emitRuntimeMessage: (msg: unknown) => void;
  /** Push a status change to all subscribers. */
  emitStatus: (status: ReactorStatus) => void;
  /** Spy on outgoing runtime commands. */
  sendRuntimeCommand: ReturnType<typeof vi.fn>;
  /** Set the status returned by `getStatus()`. */
  setStatus: (status: ReactorStatus) => void;
  /** True once the runtime-message subscription was unsubscribed. */
  isRuntimeMessageUnsubscribed: () => boolean;
}

function makeHost(initial: ReactorStatus = "ready"): FakeHostHandles {
  let status: ReactorStatus = initial;
  const runtimeListeners = new Set<(msg: unknown) => void>();
  const statusListeners = new Set<(s: ReactorStatus) => void>();
  let runtimeMessageUnsubCalled = false;
  const sendRuntimeCommand = vi.fn().mockResolvedValue(undefined);

  const host: RecordingClientHost = {
    onRuntimeMessage(handler) {
      runtimeListeners.add(handler);
      return () => {
        runtimeListeners.delete(handler);
        runtimeMessageUnsubCalled = true;
      };
    },
    onStatusChanged(handler) {
      statusListeners.add(handler);
      return () => statusListeners.delete(handler);
    },
    sendRuntimeCommand,
    getStatus: () => status,
    getLocalCoordinatorBaseUrl: () => undefined,
  };

  return {
    host,
    emitRuntimeMessage: (msg) =>
      runtimeListeners.forEach((handler) => handler(msg)),
    emitStatus: (s) => {
      status = s;
      statusListeners.forEach((handler) => handler(s));
    },
    sendRuntimeCommand,
    setStatus: (s) => {
      status = s;
    },
    isRuntimeMessageUnsubscribed: () => runtimeMessageUnsubCalled,
  };
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
      predicted_ready_at_ms: 9_999_999_999_999,
      playlist_url:
        "https://api.reactor.inc/clips?session_id=rec-1&start=120&end=150",
      ...overrides,
    },
  };
}

describe("RecordingClient", () => {
  describe("requestClip / requestRecording", () => {
    it("rejects with INVALID_DURATION on non-positive durations", async () => {
      const fake = makeHost();
      const client = new RecordingClient(fake.host);
      await expect(client.requestClip(0)).rejects.toMatchObject({
        code: "INVALID_DURATION",
      });
      await expect(client.requestClip(-1)).rejects.toMatchObject({
        code: "INVALID_DURATION",
      });
      await expect(client.requestClip(Number.NaN)).rejects.toMatchObject({
        code: "INVALID_DURATION",
      });
      client.destroy();
    });

    it("rejects with DISCONNECTED when host is not ready", async () => {
      const fake = makeHost("disconnected");
      const client = new RecordingClient(fake.host);
      await expect(client.requestClip(30)).rejects.toMatchObject({
        code: "DISCONNECTED",
      });
      await expect(client.requestRecording()).rejects.toMatchObject({
        code: "DISCONNECTED",
      });
      client.destroy();
    });

    it("sends requestClip and resolves on clipReady", async () => {
      const fake = makeHost();
      const client = new RecordingClient(fake.host);
      const promise = client.requestClip(30);

      expect(fake.sendRuntimeCommand).toHaveBeenCalledWith("requestClip", {
        duration_seconds: 30,
      });

      fake.emitRuntimeMessage(buildClipReady());
      const clip = await promise;
      expect(clip.sessionId).toBe("rec-1");
      expect(clip.kind).toBe("snap");
      client.destroy();
    });

    it("sends requestRecording with empty body", async () => {
      const fake = makeHost();
      const client = new RecordingClient(fake.host);
      const promise = client.requestRecording();

      expect(fake.sendRuntimeCommand).toHaveBeenCalledWith(
        "requestRecording",
        {}
      );

      fake.emitRuntimeMessage(buildClipReady({ kind: "recording" }));
      const clip = await promise;
      expect(clip.kind).toBe("recording");
      client.destroy();
    });
  });

  describe("FIFO correlator", () => {
    it("matches concurrent requests in receipt order", async () => {
      const fake = makeHost();
      const client = new RecordingClient(fake.host);
      const p1 = client.requestClip(10);
      const p2 = client.requestClip(20);

      fake.emitRuntimeMessage(buildClipReady({ session_id: "first" }));
      fake.emitRuntimeMessage(buildClipReady({ session_id: "second" }));

      const [c1, c2] = await Promise.all([p1, p2]);
      expect(c1.sessionId).toBe("first");
      expect(c2.sessionId).toBe("second");
      client.destroy();
    });

    it("ignores non-clip runtime messages", async () => {
      const fake = makeHost();
      const client = new RecordingClient(fake.host);
      const promise = client.requestClip(30);

      fake.emitRuntimeMessage({ type: "modelCapabilities", data: {} });
      fake.emitRuntimeMessage({ type: "ping", data: {} });
      fake.emitRuntimeMessage(buildClipReady());

      const clip = await promise;
      expect(clip.sessionId).toBe("rec-1");
      client.destroy();
    });

    it("ignores stray clipReady when no requests are pending", async () => {
      const fake = makeHost();
      const client = new RecordingClient(fake.host);
      // Should not throw; no pending request to resolve.
      fake.emitRuntimeMessage(buildClipReady());
      client.destroy();
    });
  });

  describe("clipFailed handling", () => {
    it("maps 'recorder disabled' to RECORDER_DISABLED", async () => {
      const fake = makeHost();
      const client = new RecordingClient(fake.host);
      const promise = client.requestClip(30);

      fake.emitRuntimeMessage({
        type: "clipFailed",
        data: { reason: "recorder disabled" },
      });

      await expect(promise).rejects.toMatchObject({
        code: "RECORDER_DISABLED",
        reason: "recorder disabled",
      });
      client.destroy();
    });

    it("maps unknown reasons to INTERNAL_ERROR", async () => {
      const fake = makeHost();
      const client = new RecordingClient(fake.host);
      const promise = client.requestClip(30);

      fake.emitRuntimeMessage({
        type: "clipFailed",
        data: { reason: "internal error: boom" },
      });

      await expect(promise).rejects.toMatchObject({
        code: "INTERNAL_ERROR",
        reason: "internal error: boom",
      });
      client.destroy();
    });
  });

  describe("local-mode URL rewrite", () => {
    it("rewrites playlist_url through the host's coordinator base URL", async () => {
      const fake = makeHost();
      // Override just the URL hook.
      const host: RecordingClientHost = {
        ...fake.host,
        getLocalCoordinatorBaseUrl: () => "http://localhost:9000",
      };
      const client = new RecordingClient(host);
      const promise = client.requestClip(30);

      fake.emitRuntimeMessage(
        buildClipReady({
          playlist_url:
            "http://0.0.0.0:8080/clips?session_id=rec-1&start=120&end=150",
        })
      );

      const clip = await promise;
      expect(clip.playlistUrl).toBe(
        "http://localhost:9000/clips?session_id=rec-1&start=120&end=150"
      );
      client.destroy();
    });
  });

  describe("lifecycle", () => {
    it("rejects pending requests with DISCONNECTED on disconnect", async () => {
      const fake = makeHost();
      const client = new RecordingClient(fake.host);
      const p1 = client.requestClip(10);
      const p2 = client.requestRecording();

      fake.emitStatus("disconnected");

      await expect(p1).rejects.toMatchObject({ code: "DISCONNECTED" });
      await expect(p2).rejects.toMatchObject({ code: "DISCONNECTED" });
      client.destroy();
    });

    it("rejects pending requests with DISCONNECTED on destroy", async () => {
      const fake = makeHost();
      const client = new RecordingClient(fake.host);
      const p = client.requestClip(10);

      client.destroy();
      await expect(p).rejects.toMatchObject({ code: "DISCONNECTED" });
    });

    it("unsubscribes from host events on destroy", () => {
      const fake = makeHost();
      const client = new RecordingClient(fake.host);
      expect(fake.isRuntimeMessageUnsubscribed()).toBe(false);
      client.destroy();
      expect(fake.isRuntimeMessageUnsubscribed()).toBe(true);
    });

    it("rejects with REQUEST_TIMEOUT when no response arrives", async () => {
      vi.useFakeTimers();
      try {
        const fake = makeHost();
        const client = new RecordingClient(fake.host, { requestTimeoutMs: 50 });

        // Attach the rejection assertion *before* advancing timers so
        // the rejection handler is in place when the timeout fires;
        // otherwise vitest treats it as an unhandled rejection.
        const settled = expect(client.requestClip(30)).rejects.toMatchObject({
          code: "REQUEST_TIMEOUT",
        });

        await vi.advanceTimersByTimeAsync(60);
        await settled;

        client.destroy();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
