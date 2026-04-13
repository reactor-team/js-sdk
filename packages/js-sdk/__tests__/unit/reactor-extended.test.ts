// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Reactor, DEFAULT_BASE_URL, FileRef } from "../../src/core/Reactor";

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

const MOCK_UPLOAD_RESPONSE = {
  presigned_id: "cf868483-fa9f-4744-a4ce-aa2724e45f0a",
  presigned_url:
    "https://s3.example.com/sessions/test/uploads/cf868483/ref.jpg?sig=abc",
  path: "sessions/test/uploads/cf868483/ref.jpg",
};

vi.mock("../../src/core/CoordinatorClient", () => ({
  CoordinatorClient: vi.fn().mockImplementation(() => ({
    createSession: vi.fn().mockResolvedValue(MOCK_INITIAL_RESPONSE),
    pollSessionReady: vi.fn().mockResolvedValue(MOCK_FULL_SESSION_RESPONSE),
    getSession: vi.fn().mockResolvedValue(MOCK_FULL_SESSION_RESPONSE),
    terminateSession: vi.fn().mockResolvedValue(undefined),
    createUpload: vi.fn().mockResolvedValue(MOCK_UPLOAD_RESPONSE),
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
    createUpload: vi.fn().mockResolvedValue(MOCK_UPLOAD_RESPONSE),
    abort: vi.fn(),
  })),
}));

vi.mock("../../src/core/WebRTCTransportClient", () => ({
  WebRTCTransportClient: vi.fn().mockImplementation(() => {
    transportHandlers = {};
    mockTransportClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      reconnect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn(),
      publishTrack: vi.fn().mockResolvedValue(undefined),
      unpublishTrack: vi.fn().mockResolvedValue(undefined),
      on: vi.fn((event: string, handler: any) => {
        transportHandlers[event] = handler;
      }),
      off: vi.fn(),
      getStats: vi.fn().mockReturnValue(undefined),
      getTransportTimings: vi.fn().mockReturnValue({
        protocol: "webrtc",
        sdpPollingMs: 100,
        sdpPollingAttempts: 1,
        iceNegotiationMs: 50,
        dataChannelMs: 60,
      }),
      abort: vi.fn(),
    };
    return mockTransportClient;
  }),
}));

const { LocalCoordinatorClient } =
  await import("../../src/core/LocalCoordinatorClient");

async function connectAndReady(r: Reactor, jwt = "jwt") {
  await r.connect(jwt);
  transportHandlers["statusChanged"]("connected");
}

describe("Reactor (extended)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transportHandlers = {};
    mockTransportClient = undefined;
  });

  // ── Constructor ──────────────────────────────────────────────────────────

  describe("constructor", () => {
    it("local mode defaults to LOCAL_COORDINATOR_URL", async () => {
      const r = new Reactor({ modelName: "echo", local: true });
      await r.connect();
      expect(LocalCoordinatorClient).toHaveBeenCalledWith(
        "http://localhost:8080",
        "echo"
      );
      await r.disconnect();
    });
  });

  // ── sendCommand (when ready) ─────────────────────────────────────────────

  describe("sendCommand (when ready)", () => {
    it("delegates to transportClient when ready", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      await r.sendCommand("set_effect", { effect: "blur" });
      expect(mockTransportClient.sendCommand).toHaveBeenCalledWith(
        "set_effect",
        { effect: "blur" },
        "application",
        undefined
      );
      await r.disconnect();
    });

    it("emits MESSAGE_SEND_FAILED on error", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      mockTransportClient.sendCommand.mockImplementation(() => {
        throw new Error("channel closed");
      });

      const errorHandler = vi.fn();
      r.on("error", errorHandler);
      vi.spyOn(console, "error").mockImplementation(() => {});

      await r.sendCommand("boom", {});

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ code: "MESSAGE_SEND_FAILED" })
      );
      await r.disconnect();
    });
  });

  // ── publishTrack (when ready) ────────────────────────────────────────────

  describe("publishTrack (when ready)", () => {
    it("delegates to transportClient when ready", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      const fakeTrack = {} as MediaStreamTrack;
      await r.publishTrack("webcam", fakeTrack);
      expect(mockTransportClient.publishTrack).toHaveBeenCalledWith(
        "webcam",
        fakeTrack
      );
      await r.disconnect();
    });

    it("emits TRACK_PUBLISH_FAILED on error", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      mockTransportClient.publishTrack.mockRejectedValue(
        new Error("publish error")
      );

      const errorHandler = vi.fn();
      r.on("error", errorHandler);
      vi.spyOn(console, "error").mockImplementation(() => {});

      await r.publishTrack("webcam", {} as MediaStreamTrack);

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ code: "TRACK_PUBLISH_FAILED" })
      );
      await r.disconnect();
    });
  });

  // ── unpublishTrack ───────────────────────────────────────────────────────

  describe("unpublishTrack", () => {
    it("delegates to transportClient", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      await r.unpublishTrack("webcam");
      expect(mockTransportClient.unpublishTrack).toHaveBeenCalledWith("webcam");
      await r.disconnect();
    });

    it("emits TRACK_UNPUBLISH_FAILED on error", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      mockTransportClient.unpublishTrack.mockRejectedValue(
        new Error("unpublish error")
      );

      const errorHandler = vi.fn();
      r.on("error", errorHandler);
      vi.spyOn(console, "error").mockImplementation(() => {});

      await r.unpublishTrack("webcam");

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ code: "TRACK_UNPUBLISH_FAILED" })
      );
      await r.disconnect();
    });
  });

  // ── setupTransportHandlers ───────────────────────────────────────────────

  describe("setupTransportHandlers", () => {
    it("routes application messages", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const msgHandler = vi.fn();
      r.on("message", msgHandler);

      transportHandlers["message"]({ cmd: "data" }, "application");
      expect(msgHandler).toHaveBeenCalledWith({ cmd: "data" });
      await r.disconnect();
    });

    it("routes runtime messages", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const rtHandler = vi.fn();
      r.on("runtimeMessage", rtHandler);

      transportHandlers["message"]({ caps: true }, "runtime");
      expect(rtHandler).toHaveBeenCalledWith({ caps: true });
      await r.disconnect();
    });

    it("transitions to ready on connected status", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      transportHandlers["statusChanged"]("connected");
      expect(r.getStatus()).toBe("ready");
      await r.disconnect();
    });

    it("triggers recoverable disconnect on disconnected status", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      transportHandlers["statusChanged"]("disconnected");
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(r.getStatus()).toBe("disconnected");
      expect(r.getSessionId()).toBe(MOCK_SESSION_ID);
    });

    it("emits GPU_CONNECTION_ERROR on error status", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const errorHandler = vi.fn();
      r.on("error", errorHandler);

      transportHandlers["statusChanged"]("error");
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ code: "GPU_CONNECTION_ERROR" })
      );
    });

    it("forwards trackReceived events", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const trackHandler = vi.fn();
      r.on("trackReceived", trackHandler);

      transportHandlers["trackReceived"]("name", "track", "stream");
      expect(trackHandler).toHaveBeenCalledWith("name", "track", "stream");
      await r.disconnect();
    });

    it("forwards statsUpdate events with connectionTimings", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const statsHandler = vi.fn();
      r.on("statsUpdate", statsHandler);

      transportHandlers["statsUpdate"]({ rtt: 25 });
      expect(statsHandler).toHaveBeenCalledWith(
        expect.objectContaining({ rtt: 25 })
      );
      await r.disconnect();
    });

    it("ignores events from stale transportClient", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const staleHandlers = { ...transportHandlers };

      await r.disconnect(false);

      await r.connect("jwt");

      const msgHandler = vi.fn();
      r.on("message", msgHandler);

      staleHandlers["message"]({ old: true }, "application");
      expect(msgHandler).not.toHaveBeenCalled();
      await r.disconnect();
    });
  });

  // ── reconnect ────────────────────────────────────────────────────────────

  describe("reconnect", () => {
    it("reconnects using transport client", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");
      transportHandlers["statusChanged"]("connected");

      await r.disconnect(true);
      expect(r.getSessionId()).toBe(MOCK_SESSION_ID);

      await r.reconnect();
      expect(mockTransportClient.reconnect).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: "main_video" }),
        ])
      );
      await r.disconnect();
    });

    it("warns when already ready", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await r.reconnect();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Already connected")
      );
      await r.disconnect();
    });
  });

  // ── disconnect ───────────────────────────────────────────────────────────

  describe("disconnect", () => {
    it("calls abort() on coordinator", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const { CoordinatorClient } =
        await import("../../src/core/CoordinatorClient");
      const coordInstance = (CoordinatorClient as any).mock.results.at(
        -1
      )!.value;

      await r.disconnect();
      expect(coordInstance.abort).toHaveBeenCalled();
    });

    it("terminates session on non-recoverable disconnect", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const { CoordinatorClient } =
        await import("../../src/core/CoordinatorClient");
      const coordInstance = (CoordinatorClient as any).mock.results.at(
        -1
      )!.value;

      await r.disconnect(false);
      expect(coordInstance.terminateSession).toHaveBeenCalled();
    });

    it("preserves session on recoverable disconnect", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      await r.disconnect(true);
      expect(r.getSessionId()).toBe(MOCK_SESSION_ID);
    });

    it("clears transportClient on non-recoverable disconnect", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      await r.disconnect(false);
      expect(r.getSessionId()).toBeUndefined();
      expect(r.getStats()).toBeUndefined();
      expect(r.getCapabilities()).toBeUndefined();
      expect(r.getSessionInfo()).toBeUndefined();
    });

    it("continues cleanup if transportClient.disconnect throws", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      mockTransportClient.disconnect.mockRejectedValue(
        new Error("peer closed")
      );
      vi.spyOn(console, "error").mockImplementation(() => {});

      await r.disconnect(false);
      expect(r.getStatus()).toBe("disconnected");
    });
  });

  // ── setStatus dedup ──────────────────────────────────────────────────────

  describe("setStatus dedup", () => {
    it("does not emit when status is same", async () => {
      const r = new Reactor({ modelName: "echo" });
      const statusHandler = vi.fn();
      r.on("statusChanged", statusHandler);

      await r.connect("jwt");
      const connectingCount = statusHandler.mock.calls.filter(
        ([s]: [string]) => s === "connecting"
      ).length;
      expect(connectingCount).toBe(1);
      await r.disconnect();
    });
  });

  // ── setSessionId ─────────────────────────────────────────────────────────

  describe("setSessionId", () => {
    it("emits sessionIdChanged", async () => {
      const r = new Reactor({ modelName: "echo" });
      const sessionHandler = vi.fn();
      r.on("sessionIdChanged", sessionHandler);

      await r.connect("jwt");
      expect(sessionHandler).toHaveBeenCalledWith(MOCK_SESSION_ID);
      await r.disconnect();
    });
  });

  // ── createError ──────────────────────────────────────────────────────────

  describe("createError", () => {
    it("populates all error fields", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      transportHandlers["statusChanged"]("error");

      const err = r.getLastError();
      expect(err).toBeDefined();
      expect(err!.code).toBe("GPU_CONNECTION_ERROR");
      expect(err!.message).toBeTruthy();
      expect(err!.timestamp).toBeGreaterThan(0);
      expect(typeof err!.recoverable).toBe("boolean");
      expect(err!.component).toBe("gpu");
    });
  });

  // ── uploadFile() ──────────────────────────────────────────────────────────

  describe("uploadFile()", () => {
    it("throws when not ready", async () => {
      const r = new Reactor({ modelName: "echo" });
      const file = new File(["hello"], "test.txt", { type: "text/plain" });
      await expect(r.uploadFile(file)).rejects.toThrow(
        'status is "disconnected"'
      );
    });

    it("throws on empty file", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      const emptyFile = new File([], "empty.txt", { type: "text/plain" });
      await expect(r.uploadFile(emptyFile)).rejects.toThrow("File is empty");
      await r.disconnect();
    });

    it("completes the full upload flow and returns FileRef", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
      vi.stubGlobal("fetch", mockFetch);

      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      const fileContent = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const file = new File([fileContent], "ref.jpg", { type: "image/jpeg" });

      const result = await r.uploadFile(file);

      // Returns a FileRef instance
      expect(result).toBeInstanceOf(FileRef);
      expect(result.uploadId).toBe(MOCK_UPLOAD_RESPONSE.presigned_id);
      expect(result.name).toBe("ref.jpg");
      expect(result.mimeType).toBe("image/jpeg");
      expect(result.size).toBe(4);

      // Verify PUT was called with the presigned URL
      expect(mockFetch).toHaveBeenCalledWith(
        MOCK_UPLOAD_RESPONSE.presigned_url,
        expect.objectContaining({ method: "PUT" })
      );

      // Verify runtime data channel notification was sent
      expect(mockTransportClient.sendCommand).toHaveBeenCalledWith(
        "fileUploaded",
        expect.objectContaining({
          upload_id: MOCK_UPLOAD_RESPONSE.presigned_id,
          name: "ref.jpg",
          mime_type: "image/jpeg",
          size: 4,
        }),
        "runtime",
        undefined
      );

      vi.unstubAllGlobals();
      await r.disconnect();
    });

    it("throws when PUT to presigned URL fails", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue({ ok: false, status: 403, statusText: "Forbidden" });
      vi.stubGlobal("fetch", mockFetch);

      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      const file = new File(["data"], "test.bin", {
        type: "application/octet-stream",
      });
      await expect(r.uploadFile(file)).rejects.toThrow(
        "File upload failed: 403"
      );

      vi.unstubAllGlobals();
      await r.disconnect();
    });

    it("uses options.name when provided", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
      vi.stubGlobal("fetch", mockFetch);

      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
      const result = await r.uploadFile(blob, { name: "custom-name.png" });

      expect(result.name).toBe("custom-name.png");

      vi.unstubAllGlobals();
      await r.disconnect();
    });

    it("defaults mime type to application/octet-stream for untyped blobs", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
      vi.stubGlobal("fetch", mockFetch);

      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      const blob = new Blob([new Uint8Array([1, 2])]);
      const result = await r.uploadFile(blob, { name: "data.bin" });

      expect(result.mimeType).toBe("application/octet-stream");

      vi.unstubAllGlobals();
      await r.disconnect();
    });
  });

  // ── uploadFile() local URL rewrite (REA-1573) ──────────────────────────

  describe("uploadFile() local URL rewrite (REA-1573)", () => {
    const LOCAL_UPLOAD_RESPONSE = {
      presigned_id: "local-upload-id",
      presigned_url: "http://localhost:8090/uploads/local-upload-id",
      path: "sessions/local/uploads/local-upload-id/photo.jpg",
    };

    it("rewrites presigned URL host+port to match SDK-configured apiUrl", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
      vi.stubGlobal("fetch", mockFetch);

      const r = new Reactor({
        modelName: "echo",
        local: true,
        apiUrl: "http://localhost:8080",
      });
      await connectAndReady(r);

      const { LocalCoordinatorClient: LCC } = await import(
        "../../src/core/LocalCoordinatorClient"
      );
      const localCoord = (LCC as any).mock.results.at(-1)!.value;
      localCoord.createUpload = vi
        .fn()
        .mockResolvedValue(LOCAL_UPLOAD_RESPONSE);

      const file = new File(["img-data"], "photo.jpg", {
        type: "image/jpeg",
      });
      await r.uploadFile(file);

      const putCall = mockFetch.mock.calls.find(
        ([, opts]: any) => opts?.method === "PUT"
      );
      expect(putCall).toBeDefined();
      expect(putCall![0]).toBe(
        "http://localhost:8080/uploads/local-upload-id"
      );

      vi.unstubAllGlobals();
      await r.disconnect();
    });

    it("rewrites scheme when SDK uses https", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
      vi.stubGlobal("fetch", mockFetch);

      const r = new Reactor({
        modelName: "echo",
        local: true,
        apiUrl: "https://my-tunnel.example.com",
      });
      await connectAndReady(r);

      const { LocalCoordinatorClient: LCC } = await import(
        "../../src/core/LocalCoordinatorClient"
      );
      const localCoord = (LCC as any).mock.results.at(-1)!.value;
      localCoord.createUpload = vi
        .fn()
        .mockResolvedValue(LOCAL_UPLOAD_RESPONSE);

      const file = new File(["img-data"], "photo.jpg", {
        type: "image/jpeg",
      });
      await r.uploadFile(file);

      const putCall = mockFetch.mock.calls.find(
        ([, opts]: any) => opts?.method === "PUT"
      );
      expect(putCall![0]).toBe(
        "https://my-tunnel.example.com/uploads/local-upload-id"
      );

      vi.unstubAllGlobals();
      await r.disconnect();
    });

    it("does not rewrite presigned URL in production mode", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
      vi.stubGlobal("fetch", mockFetch);

      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      const fileContent = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const file = new File([fileContent], "ref.jpg", {
        type: "image/jpeg",
      });
      await r.uploadFile(file);

      const putCall = mockFetch.mock.calls.find(
        ([, opts]: any) => opts?.method === "PUT"
      );
      expect(putCall![0]).toBe(MOCK_UPLOAD_RESPONSE.presigned_url);

      vi.unstubAllGlobals();
      await r.disconnect();
    });

    it("preserves path and query params during rewrite", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
      vi.stubGlobal("fetch", mockFetch);

      const uploadWithQuery = {
        presigned_id: "q-upload",
        presigned_url:
          "http://localhost:9000/uploads/q-upload?token=abc&expires=123",
        path: "sessions/local/uploads/q-upload/file.bin",
      };

      const r = new Reactor({
        modelName: "echo",
        local: true,
        apiUrl: "http://localhost:8080",
      });
      await connectAndReady(r);

      const { LocalCoordinatorClient: LCC } = await import(
        "../../src/core/LocalCoordinatorClient"
      );
      const localCoord = (LCC as any).mock.results.at(-1)!.value;
      localCoord.createUpload = vi.fn().mockResolvedValue(uploadWithQuery);

      const file = new File(["data"], "file.bin", {
        type: "application/octet-stream",
      });
      await r.uploadFile(file);

      const putCall = mockFetch.mock.calls.find(
        ([, opts]: any) => opts?.method === "PUT"
      );
      expect(putCall![0]).toBe(
        "http://localhost:8080/uploads/q-upload?token=abc&expires=123"
      );

      vi.unstubAllGlobals();
      await r.disconnect();
    });
  });

  // ── sendCommand() with FileRef ──────────────────────────────────────────

  describe("sendCommand() with FileRef", () => {
    it("extracts FileRef into uploads, keeps scalar args in data", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      const ref = new FileRef("upload-123", "style.jpg", "image/jpeg", 1024);
      await r.sendCommand("set_style", { file: ref, strength: 0.8 });

      expect(mockTransportClient.sendCommand).toHaveBeenCalledWith(
        "set_style",
        { strength: 0.8 },
        "application",
        {
          file: {
            upload_id: "upload-123",
            name: "style.jpg",
            mime_type: "image/jpeg",
            size: 1024,
          },
        }
      );

      await r.disconnect();
    });

    it("handles multiple FileRefs in one command", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      const styleRef = new FileRef("id-1", "style.jpg", "image/jpeg", 100);
      const contentRef = new FileRef("id-2", "photo.png", "image/png", 200);
      await r.sendCommand("blend", {
        style: styleRef,
        content: contentRef,
        factor: 0.5,
      });

      expect(mockTransportClient.sendCommand).toHaveBeenCalledWith(
        "blend",
        { factor: 0.5 },
        "application",
        {
          style: {
            upload_id: "id-1",
            name: "style.jpg",
            mime_type: "image/jpeg",
            size: 100,
          },
          content: {
            upload_id: "id-2",
            name: "photo.png",
            mime_type: "image/png",
            size: 200,
          },
        }
      );

      await r.disconnect();
    });

    it("passes no uploads when data has no FileRefs", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      await r.sendCommand("set_brightness", { brightness: 0.5 });

      expect(mockTransportClient.sendCommand).toHaveBeenCalledWith(
        "set_brightness",
        { brightness: 0.5 },
        "application",
        undefined
      );

      await r.disconnect();
    });
  });
});
