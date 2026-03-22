// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect, vi } from "vitest";
import {
  transformIceServers,
  sendMessage,
  parseMessage,
  extractConnectionStats,
  isConnected,
  isClosed,
} from "../../src/utils/webrtc";

// ---------------------------------------------------------------------------
// ICE server transform
// ---------------------------------------------------------------------------

describe("transformIceServers()", () => {
  it("maps coordinator format to RTCIceServer with credentials", () => {
    const servers = transformIceServers({
      ice_servers: [
        {
          uris: ["turn:turn.example.com:3478"],
          credentials: { username: "user", password: "pass" },
        },
      ],
    });
    expect(servers).toEqual([
      {
        urls: ["turn:turn.example.com:3478"],
        username: "user",
        credential: "pass",
      },
    ]);
  });

  it("maps coordinator format without credentials", () => {
    const servers = transformIceServers({
      ice_servers: [{ uris: ["stun:stun.l.google.com:19302"] }],
    });
    expect(servers).toEqual([{ urls: ["stun:stun.l.google.com:19302"] }]);
  });

  it("returns empty array for no servers", () => {
    expect(transformIceServers({ ice_servers: [] })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Data channel messaging
// ---------------------------------------------------------------------------

describe("sendMessage()", () => {
  it("sends a correctly formatted envelope", () => {
    const sent: string[] = [];
    const channel = {
      readyState: "open",
      send: (data: string) => sent.push(data),
    } as unknown as RTCDataChannel;

    sendMessage(channel, "set_effect", { effect: "grayscale" });

    expect(JSON.parse(sent[0])).toEqual({
      scope: "application",
      data: { type: "set_effect", data: { effect: "grayscale" } },
    });
  });

  it("uses the provided scope", () => {
    const sent: string[] = [];
    const channel = {
      readyState: "open",
      send: (data: string) => sent.push(data),
    } as unknown as RTCDataChannel;

    sendMessage(channel, "ping", {}, "runtime");
    expect(JSON.parse(sent[0]).scope).toBe("runtime");
  });

  it("parses stringified JSON data before wrapping", () => {
    const sent: string[] = [];
    const channel = {
      readyState: "open",
      send: (data: string) => sent.push(data),
    } as unknown as RTCDataChannel;

    sendMessage(channel, "cmd", '{"key":"val"}');
    const parsed = JSON.parse(sent[0]);
    expect(parsed.data.data).toEqual({ key: "val" });
  });

  it("throws when the data channel is not open", () => {
    const channel = { readyState: "closed" } as unknown as RTCDataChannel;
    expect(() => sendMessage(channel, "cmd", {})).toThrow(
      "Data channel not open"
    );
  });

  it("throws when message exceeds max bytes", () => {
    const channel = {
      readyState: "open",
      send: vi.fn(),
    } as unknown as RTCDataChannel;

    expect(() =>
      sendMessage(channel, "cmd", { big: "x".repeat(100) }, "application", 10)
    ).toThrow("too large");
  });
});

describe("parseMessage()", () => {
  it("parses valid JSON strings", () => {
    expect(parseMessage('{"type":"test"}')).toEqual({ type: "test" });
  });

  it("returns invalid JSON strings as-is", () => {
    expect(parseMessage("not json")).toBe("not json");
  });

  it("returns non-string data unchanged", () => {
    const obj = { foo: "bar" };
    expect(parseMessage(obj)).toBe(obj);
  });

  it("returns null/undefined unchanged", () => {
    expect(parseMessage(null)).toBeNull();
    expect(parseMessage(undefined)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Stats extraction
// ---------------------------------------------------------------------------

describe("extractConnectionStats()", () => {
  it("extracts RTT, candidate type, bitrate, FPS, jitter, and packet loss", () => {
    const entries = new Map<string, any>([
      [
        "cp1",
        {
          type: "candidate-pair",
          state: "succeeded",
          currentRoundTripTime: 0.025,
          availableOutgoingBitrate: 1_000_000,
          localCandidateId: "lc1",
        },
      ],
      ["lc1", { type: "local-candidate", candidateType: "host" }],
      [
        "ir1",
        {
          type: "inbound-rtp",
          kind: "video",
          framesPerSecond: 30,
          jitter: 0.01,
          packetsReceived: 990,
          packetsLost: 10,
        },
      ],
    ]);

    const report = {
      forEach: (cb: (v: any, k: string) => void) => entries.forEach(cb),
      get: (k: string) => entries.get(k),
    } as unknown as RTCStatsReport;

    const stats = extractConnectionStats(report);
    expect(stats.rtt).toBe(25);
    expect(stats.candidateType).toBe("host");
    expect(stats.availableOutgoingBitrate).toBe(1_000_000);
    expect(stats.framesPerSecond).toBe(30);
    expect(stats.jitter).toBe(0.01);
    expect(stats.packetLossRatio).toBeCloseTo(0.01);
    expect(stats.timestamp).toBeGreaterThan(0);
  });

  it("returns undefined fields for an empty report", () => {
    const report = {
      forEach: () => {},
      get: () => undefined,
    } as unknown as RTCStatsReport;

    const stats = extractConnectionStats(report);
    expect(stats.rtt).toBeUndefined();
    expect(stats.candidateType).toBeUndefined();
    expect(stats.framesPerSecond).toBeUndefined();
    expect(stats.timestamp).toBeGreaterThan(0);
  });

  it("missing currentRoundTripTime returns undefined rtt", () => {
    const entries = new Map<string, any>([
      [
        "cp1",
        {
          type: "candidate-pair",
          state: "succeeded",
          availableOutgoingBitrate: 500_000,
          localCandidateId: "lc1",
        },
      ],
      ["lc1", { type: "local-candidate", candidateType: "srflx" }],
    ]);
    const report = {
      forEach: (cb: (v: any, k: string) => void) => entries.forEach(cb),
      get: (k: string) => entries.get(k),
    } as unknown as RTCStatsReport;

    const stats = extractConnectionStats(report);
    expect(stats.rtt).toBeUndefined();
    expect(stats.availableOutgoingBitrate).toBe(500_000);
    expect(stats.candidateType).toBe("srflx");
  });

  it("missing localCandidate returns undefined candidateType", () => {
    const entries = new Map<string, any>([
      [
        "cp1",
        {
          type: "candidate-pair",
          state: "succeeded",
          currentRoundTripTime: 0.05,
          localCandidateId: "lc-missing",
        },
      ],
    ]);
    const report = {
      forEach: (cb: (v: any, k: string) => void) => entries.forEach(cb),
      get: () => undefined,
    } as unknown as RTCStatsReport;

    const stats = extractConnectionStats(report);
    expect(stats.rtt).toBe(50);
    expect(stats.candidateType).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Connection state helpers
// ---------------------------------------------------------------------------

describe("isConnected()", () => {
  it("returns true when connectionState is connected", () => {
    expect(
      isConnected({ connectionState: "connected" } as RTCPeerConnection)
    ).toBe(true);
  });

  it("returns false otherwise", () => {
    expect(isConnected({ connectionState: "new" } as RTCPeerConnection)).toBe(
      false
    );
  });
});

describe("isClosed()", () => {
  it("returns true when closed", () => {
    expect(isClosed({ connectionState: "closed" } as RTCPeerConnection)).toBe(
      true
    );
  });

  it("returns true when failed", () => {
    expect(isClosed({ connectionState: "failed" } as RTCPeerConnection)).toBe(
      true
    );
  });

  it("returns false when connected", () => {
    expect(
      isClosed({ connectionState: "connected" } as RTCPeerConnection)
    ).toBe(false);
  });
});
