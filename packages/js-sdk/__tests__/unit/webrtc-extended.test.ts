// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createPeerConnection,
  createDataChannel,
  createOffer,
  createAnswer,
  setRemoteDescription,
  getLocalDescription,
  addIceCandidate,
  waitForIceGathering,
  addTrack,
  removeTrack,
  findSenderForTrack,
  removeAllTracks,
  closePeerConnection,
  transformIceServers,
  sendMessage,
  parseMessage,
  createRTCStatsExtractor,
  isConnected,
  isClosed,
} from "../../src/utils/webrtc";

// ---------------------------------------------------------------------------
// Global WebRTC stubs
// ---------------------------------------------------------------------------

const mockCreateDataChannel = vi.fn().mockReturnValue({ label: "data" });

class MockRTCPeerConnection {
  iceServers: RTCIceServer[] = [];
  iceTransportPolicy: string = "all";
  createDataChannel = mockCreateDataChannel;

  constructor(config: any) {
    this.iceServers = config.iceServers;
    this.iceTransportPolicy = config.iceTransportPolicy;
  }
}

class MockRTCSessionDescription {
  type: string;
  sdp: string;
  constructor(init: { type: string; sdp: string }) {
    this.type = init.type;
    this.sdp = init.sdp;
  }
}

class MockRTCIceCandidate {
  candidate: string;
  constructor(init: any) {
    this.candidate = init.candidate;
  }
}

class MockMediaStream {
  tracks: any[];
  constructor(tracks: any[] = []) {
    this.tracks = tracks;
  }
}

class MockMediaStreamTrack {
  kind: string;
  id: string;
  constructor(kind = "video", id = "track-1") {
    this.kind = kind;
    this.id = id;
  }
}

beforeEach(() => {
  vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection);
  vi.stubGlobal("RTCSessionDescription", MockRTCSessionDescription);
  vi.stubGlobal("RTCIceCandidate", MockRTCIceCandidate);
  vi.stubGlobal("MediaStream", MockMediaStream);
  vi.stubGlobal("MediaStreamTrack", MockMediaStreamTrack);
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OFFER_SDP =
  "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\na=group:BUNDLE 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=mid:0\r\n";

function makeMockPC(overrides: Record<string, any> = {}) {
  return {
    createOffer: vi.fn().mockResolvedValue({ type: "offer", sdp: OFFER_SDP }),
    setLocalDescription: vi.fn(),
    get localDescription() {
      return { sdp: OFFER_SDP };
    },
    iceGatheringState: "complete",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createPeerConnection
// ---------------------------------------------------------------------------

describe("createPeerConnection()", () => {
  it("creates RTCPeerConnection with ice servers", () => {
    const iceServers = [{ urls: "stun:stun.example.com" }];
    const pc = createPeerConnection({ iceServers }) as any;
    expect(pc).toBeInstanceOf(MockRTCPeerConnection);
    expect(pc.iceServers).toEqual(iceServers);
  });

  it('uses "all" transport policy by default', () => {
    const pc = createPeerConnection({ iceServers: [] }) as any;
    expect(pc.iceTransportPolicy).toBe("all");
  });
});

// ---------------------------------------------------------------------------
// createDataChannel
// ---------------------------------------------------------------------------

describe("createDataChannel()", () => {
  it('creates with default label "data"', () => {
    const pc = createPeerConnection({ iceServers: [] });
    createDataChannel(pc);
    expect(mockCreateDataChannel).toHaveBeenCalledWith("data");
  });

  it("creates with custom label", () => {
    const pc = createPeerConnection({ iceServers: [] });
    createDataChannel(pc, "my-channel");
    expect(mockCreateDataChannel).toHaveBeenCalledWith("my-channel");
  });
});

// ---------------------------------------------------------------------------
// createOffer — no MID rewriting in the new architecture
// ---------------------------------------------------------------------------

describe("createOffer()", () => {
  it("creates offer, sets local desc, waits for ICE, returns SDP string", async () => {
    const mockPC = makeMockPC();
    const result = await createOffer(mockPC as any);

    expect(mockPC.createOffer).toHaveBeenCalled();
    expect(mockPC.setLocalDescription).toHaveBeenCalled();
    expect(typeof result).toBe("string");
    expect(result).toBe(OFFER_SDP);
  });

  it("throws when localDescription is null after ICE gathering", async () => {
    const mockPC = makeMockPC({
      get localDescription() {
        return null;
      },
    });

    await expect(createOffer(mockPC as any)).rejects.toThrow(
      "Failed to create local description"
    );
  });
});

// ---------------------------------------------------------------------------
// createAnswer
// ---------------------------------------------------------------------------

describe("createAnswer()", () => {
  it("sets remote description, creates answer, returns SDP", async () => {
    const answerSdp = "v=0\r\na=answer\r\n";
    const mockPC = {
      setRemoteDescription: vi.fn(),
      createAnswer: vi
        .fn()
        .mockResolvedValue({ type: "answer", sdp: answerSdp }),
      setLocalDescription: vi.fn(),
      get localDescription() {
        return { sdp: answerSdp };
      },
      iceGatheringState: "complete",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    const result = await createAnswer(mockPC as any, "v=0\r\noffer\r\n");

    expect(mockPC.setRemoteDescription).toHaveBeenCalled();
    expect(mockPC.createAnswer).toHaveBeenCalled();
    expect(mockPC.setLocalDescription).toHaveBeenCalled();
    expect(result).toBe(answerSdp);
  });
});

// ---------------------------------------------------------------------------
// setRemoteDescription
// ---------------------------------------------------------------------------

describe("setRemoteDescription()", () => {
  it('calls setRemoteDescription with RTCSessionDescription of type "answer"', async () => {
    const mockPC = { setRemoteDescription: vi.fn() };
    await setRemoteDescription(mockPC as any, "v=0\r\ntest\r\n");

    const desc = mockPC.setRemoteDescription.mock.calls[0][0];
    expect(desc).toBeInstanceOf(MockRTCSessionDescription);
    expect(desc.type).toBe("answer");
    expect(desc.sdp).toBe("v=0\r\ntest\r\n");
  });
});

// ---------------------------------------------------------------------------
// getLocalDescription
// ---------------------------------------------------------------------------

describe("getLocalDescription()", () => {
  it("returns SDP when localDescription exists", () => {
    const pc = { localDescription: { sdp: "v=0\r\n" } } as any;
    expect(getLocalDescription(pc)).toBe("v=0\r\n");
  });

  it("returns undefined when localDescription is null", () => {
    const pc = { localDescription: null } as any;
    expect(getLocalDescription(pc)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// addIceCandidate
// ---------------------------------------------------------------------------

describe("addIceCandidate()", () => {
  it("calls addIceCandidate on pc with RTCIceCandidate", async () => {
    const mockPC = { addIceCandidate: vi.fn() };
    const candidateInit = {
      candidate: "candidate:1 1 udp 2130706431 192.168.1.1 12345 typ host",
    };

    await addIceCandidate(mockPC as any, candidateInit);

    const arg = mockPC.addIceCandidate.mock.calls[0][0];
    expect(arg).toBeInstanceOf(MockRTCIceCandidate);
    expect(arg.candidate).toBe(candidateInit.candidate);
  });
});

// ---------------------------------------------------------------------------
// waitForIceGathering
// ---------------------------------------------------------------------------

describe("waitForIceGathering()", () => {
  it('resolves immediately when state is "complete"', async () => {
    const pc = {
      iceGatheringState: "complete",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as any;

    await waitForIceGathering(pc);
    expect(pc.addEventListener).not.toHaveBeenCalled();
  });

  it('resolves when state changes to "complete" via event', async () => {
    let handler: (() => void) | undefined;
    const pc = {
      iceGatheringState: "gathering",
      addEventListener: vi.fn((_event: string, cb: () => void) => {
        handler = cb;
      }),
      removeEventListener: vi.fn(),
    } as any;

    const promise = waitForIceGathering(pc, 10_000);

    pc.iceGatheringState = "complete";
    handler!();

    await promise;
    expect(pc.removeEventListener).toHaveBeenCalledWith(
      "icegatheringstatechange",
      expect.any(Function)
    );
  });

  it("resolves on timeout without error", async () => {
    const pc = {
      iceGatheringState: "gathering",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as any;

    await waitForIceGathering(pc, 50);
    expect(pc.removeEventListener).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Track management
// ---------------------------------------------------------------------------

describe("addTrack()", () => {
  it("adds track with auto-created MediaStream", () => {
    const track = new MockMediaStreamTrack() as any;
    const mockSender = { track };
    const pc = { addTrack: vi.fn().mockReturnValue(mockSender) } as any;

    const sender = addTrack(pc, track);

    expect(pc.addTrack).toHaveBeenCalledWith(
      track,
      expect.any(MockMediaStream)
    );
    expect(sender).toBe(mockSender);
  });

  it("adds track with provided MediaStream", () => {
    const track = new MockMediaStreamTrack() as any;
    const stream = new MockMediaStream() as any;
    const pc = { addTrack: vi.fn().mockReturnValue({ track }) } as any;

    addTrack(pc, track, stream);
    expect(pc.addTrack).toHaveBeenCalledWith(track, stream);
  });
});

describe("removeTrack()", () => {
  it("calls removeTrack on pc", () => {
    const sender = { track: null } as any;
    const pc = { removeTrack: vi.fn() } as any;

    removeTrack(pc, sender);
    expect(pc.removeTrack).toHaveBeenCalledWith(sender);
  });
});

describe("findSenderForTrack()", () => {
  it("returns matching sender", () => {
    const track = new MockMediaStreamTrack() as any;
    const matchingSender = { track };
    const otherSender = { track: new MockMediaStreamTrack("audio", "track-2") };
    const pc = {
      getSenders: vi.fn().mockReturnValue([otherSender, matchingSender]),
    } as any;

    expect(findSenderForTrack(pc, track)).toBe(matchingSender);
  });

  it("returns undefined when no match", () => {
    const track = new MockMediaStreamTrack() as any;
    const otherSender = { track: new MockMediaStreamTrack("audio", "track-2") };
    const pc = { getSenders: vi.fn().mockReturnValue([otherSender]) } as any;

    expect(findSenderForTrack(pc, track)).toBeUndefined();
  });
});

describe("removeAllTracks()", () => {
  it("removes all senders", () => {
    const senders = [{ track: null }, { track: null }];
    const pc = {
      getSenders: vi.fn().mockReturnValue(senders),
      removeTrack: vi.fn(),
    } as any;

    removeAllTracks(pc);

    expect(pc.removeTrack).toHaveBeenCalledTimes(2);
    expect(pc.removeTrack).toHaveBeenCalledWith(senders[0]);
    expect(pc.removeTrack).toHaveBeenCalledWith(senders[1]);
  });
});

// ---------------------------------------------------------------------------
// closePeerConnection
// ---------------------------------------------------------------------------

describe("closePeerConnection()", () => {
  it("calls close()", () => {
    const pc = { close: vi.fn() } as any;
    closePeerConnection(pc);
    expect(pc.close).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// transformIceServers
// ---------------------------------------------------------------------------

describe("transformIceServers()", () => {
  it("maps uris to urls and nested credentials", () => {
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
});

// ---------------------------------------------------------------------------
// sendMessage / parseMessage
// ---------------------------------------------------------------------------

describe("sendMessage()", () => {
  it("sends envelope with scope and inner type/data", () => {
    const sent: string[] = [];
    const channel = {
      readyState: "open",
      send: (data: string) => sent.push(data),
    } as unknown as RTCDataChannel;

    sendMessage(channel, "set_effect", { effect: "blur" });
    expect(JSON.parse(sent[0])).toEqual({
      scope: "application",
      data: { type: "set_effect", data: { effect: "blur" } },
    });
  });

  it("sends with runtime scope", () => {
    const sent: string[] = [];
    const channel = {
      readyState: "open",
      send: (data: string) => sent.push(data),
    } as unknown as RTCDataChannel;

    sendMessage(channel, "ping", {}, "runtime");
    expect(JSON.parse(sent[0]).scope).toBe("runtime");
  });

  it("parses string data as JSON before wrapping", () => {
    const sent: string[] = [];
    const channel = {
      readyState: "open",
      send: (data: string) => sent.push(data),
    } as unknown as RTCDataChannel;

    sendMessage(channel, "cmd", '{"key":"val"}');
    expect(JSON.parse(sent[0]).data.data).toEqual({ key: "val" });
  });

  it("throws when data channel is closed", () => {
    const channel = { readyState: "closed" } as unknown as RTCDataChannel;
    expect(() => sendMessage(channel, "cmd", {})).toThrow(
      "Data channel not open"
    );
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
});

// ---------------------------------------------------------------------------
// extractConnectionStats
// ---------------------------------------------------------------------------

describe("extractConnectionStats() full report", () => {
  it("extracts all fields from a complete report", () => {
    const baseTimestamp = 1777674503920;
    const entries = new Map<string, any>([
      [
        "cp1",
        {
          type: "candidate-pair",
          timestamp: baseTimestamp,
          state: "succeeded",
          nominated: true,
          currentRoundTripTime: 0.025,
          availableOutgoingBitrate: 1_000_000,
          availableIncomingBitrate: 1_270_000,
          localCandidateId: "lc1",
          bytesReceived: 1000000,
          bytesSent: 1025000,
        },
      ],
      ["lc1", { type: "local-candidate", candidateType: "relay" }],
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

    const extractConnectionStats = createRTCStatsExtractor();
    const stats = extractConnectionStats(report);
    expect(stats.rtt).toBe(25);
    expect(stats.candidateType).toBe("relay");
    expect(stats.availableOutgoingBitrate).toBe(1_000_000);
    expect(stats.availableIncomingBitrate).toBe(1_270_000);
    expect(stats.framesPerSecond).toBe(30);
    expect(stats.jitter).toBe(0.01);
    expect(stats.packetLossRatio).toBeCloseTo(0.01);
    expect(stats.outgoingBitrate).toBeUndefined();
    expect(stats.incomingBitrate).toBeUndefined();
  });
});

describe("extractConnectionStats() empty report", () => {
  it("returns all undefined fields", () => {
    const report = {
      forEach: () => {},
      get: () => undefined,
    } as unknown as RTCStatsReport;

    const extractConnectionStats = createRTCStatsExtractor();
    const stats = extractConnectionStats(report);
    expect(stats.rtt).toBeUndefined();
    expect(stats.candidateType).toBeUndefined();
    expect(stats.framesPerSecond).toBeUndefined();
    expect(stats.outgoingBitrate).toBeUndefined();
    expect(stats.incomingBitrate).toBeUndefined();
    expect(stats.availableOutgoingBitrate).toBeUndefined();
    expect(stats.availableIncomingBitrate).toBeUndefined();
    expect(stats.packetLossRatio).toBeUndefined();
    expect(stats.jitter).toBeUndefined();
    expect(stats.connectionTimings).toBeUndefined();
    expect(stats.timestamp).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// isConnected / isClosed
// ---------------------------------------------------------------------------

describe("isConnected()", () => {
  it("returns true for connected state", () => {
    expect(
      isConnected({ connectionState: "connected" } as RTCPeerConnection)
    ).toBe(true);
  });

  it("returns false for other states", () => {
    expect(isConnected({ connectionState: "new" } as RTCPeerConnection)).toBe(
      false
    );
  });
});

describe("isClosed()", () => {
  it("returns true for closed", () => {
    expect(isClosed({ connectionState: "closed" } as RTCPeerConnection)).toBe(
      true
    );
  });

  it("returns true for failed", () => {
    expect(isClosed({ connectionState: "failed" } as RTCPeerConnection)).toBe(
      true
    );
  });

  it("returns false for connected", () => {
    expect(
      isClosed({ connectionState: "connected" } as RTCPeerConnection)
    ).toBe(false);
  });
});
