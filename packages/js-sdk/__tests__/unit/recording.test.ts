// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect } from "vitest";
import {
  ClipReadyPayloadSchema,
  RecordingError,
  RuntimeRecordingMessageType,
  clipFromPayload,
  rewriteUrlHost,
} from "../../src/utils/recording";

/** Predicted ready time well in the future so polling tests don't trip the deadline. */
const FUTURE_READY_MS = 9_999_999_999_999;

const SAMPLE_PAYLOAD = {
  session_id: "rec-123",
  kind: "snap" as const,
  start_marker: 120.0,
  end_marker: 150.0,
  now_marker: 150.0,
  predicted_ready_at_ms: FUTURE_READY_MS,
  playlist_url:
    "http://0.0.0.0:8080/clips?session_id=rec-123&start=120&end=150",
};

describe("RuntimeRecordingMessageType", () => {
  it("matches the runtime-side string values", () => {
    expect(RuntimeRecordingMessageType.REQUEST_CLIP).toBe("requestClip");
    expect(RuntimeRecordingMessageType.REQUEST_RECORDING).toBe(
      "requestRecording"
    );
    expect(RuntimeRecordingMessageType.CLIP_READY).toBe("clipReady");
    expect(RuntimeRecordingMessageType.CLIP_FAILED).toBe("clipFailed");
  });
});

describe("ClipReadyPayloadSchema", () => {
  it("parses a valid payload", () => {
    const result = ClipReadyPayloadSchema.safeParse(SAMPLE_PAYLOAD);
    expect(result.success).toBe(true);
  });

  it("tolerates extra fields the runtime may add", () => {
    const result = ClipReadyPayloadSchema.safeParse({
      ...SAMPLE_PAYLOAD,
      future_field: "ignored",
    });
    expect(result.success).toBe(true);
  });

  it("rejects payloads missing required fields", () => {
    const { kind: _kind, ...withoutKind } = SAMPLE_PAYLOAD;
    const result = ClipReadyPayloadSchema.safeParse(withoutKind);
    expect(result.success).toBe(false);
  });

  it("rejects unknown kinds", () => {
    const result = ClipReadyPayloadSchema.safeParse({
      ...SAMPLE_PAYLOAD,
      kind: "highlight",
    });
    expect(result.success).toBe(false);
  });
});

describe("clipFromPayload", () => {
  it("converts snake_case to camelCase", () => {
    const clip = clipFromPayload(SAMPLE_PAYLOAD);
    expect(clip.sessionId).toBe("rec-123");
    expect(clip.kind).toBe("snap");
    expect(clip.startMarker).toBe(120);
    expect(clip.endMarker).toBe(150);
    expect(clip.nowMarker).toBe(150);
    expect(clip.predictedReadyAtMs).toBe(FUTURE_READY_MS);
    expect(clip.playlistUrl).toBe(SAMPLE_PAYLOAD.playlist_url);
  });

  it("rewrites playlist URL when coordinatorBaseUrl is provided", () => {
    const clip = clipFromPayload(SAMPLE_PAYLOAD, {
      coordinatorBaseUrl: "http://localhost:9000",
    });
    expect(clip.playlistUrl).toBe(
      "http://localhost:9000/clips?session_id=rec-123&start=120&end=150"
    );
  });

  it("leaves URL unchanged when coordinatorBaseUrl is omitted", () => {
    const clip = clipFromPayload(SAMPLE_PAYLOAD);
    expect(clip.playlistUrl).toBe(SAMPLE_PAYLOAD.playlist_url);
  });
});

describe("rewriteUrlHost", () => {
  it("preserves path and query", () => {
    const out = rewriteUrlHost(
      "http://0.0.0.0:8080/clips?session_id=abc&start=0&end=10",
      "https://api.reactor.inc"
    );
    expect(out).toBe(
      "https://api.reactor.inc/clips?session_id=abc&start=0&end=10"
    );
  });

  it("returns input unchanged on parse failure", () => {
    expect(rewriteUrlHost("not a url", "http://localhost:9000")).toBe(
      "not a url"
    );
  });
});
