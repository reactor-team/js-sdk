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
  rewriteMids,
  extractConnectionStats,
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
// createOffer
// ---------------------------------------------------------------------------

describe("createOffer()", () => {
  it("happy path: creates offer, sets local desc, waits for ICE, returns SDP", async () => {
    const mockPC = makeMockPC();
    const result = await createOffer(mockPC as any);

    expect(mockPC.createOffer).toHaveBeenCalled();
    expect(mockPC.setLocalDescription).toHaveBeenCalled();
    expect(result.sdp).toBe(OFFER_SDP);
    expect(result.needsAnswerRestore).toBe(false);
  });

  it("with trackNames: rewrites MIDs before setLocalDescription", async () => {
    const mockPC = makeMockPC();
    await createOffer(mockPC as any, ["my_video"]);

    const desc = mockPC.setLocalDescription.mock.calls[0][0];
    expect(desc.sdp).toContain("a=mid:my_video");
  });

  it("Firefox fallback: falls back to original offer and sets needsAnswerRestore=true", async () => {
    let callCount = 0;
    const mockPC = makeMockPC({
      setLocalDescription: vi.fn().mockImplementation((desc: any) => {
        callCount++;
        if (callCount === 1 && desc.sdp?.includes("a=mid:my_video")) {
          throw new Error("Changing the mid of m-sections is not allowed");
        }
      }),
      get localDescription() {
        return { sdp: OFFER_SDP };
      },
    });

    const result = await createOffer(mockPC as any, ["my_video"]);

    expect(mockPC.setLocalDescription).toHaveBeenCalledTimes(2);
    expect(result.needsAnswerRestore).toBe(true);
    expect(result.sdp).toContain("a=mid:my_video");
  });

  it("returns error when localDescription is null after ICE gathering", async () => {
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
  it("happy path: sets remote description, creates answer, returns SDP", async () => {
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
// addTrack
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

// ---------------------------------------------------------------------------
// removeTrack
// ---------------------------------------------------------------------------

describe("removeTrack()", () => {
  it("calls removeTrack on pc", () => {
    const sender = { track: null } as any;
    const pc = { removeTrack: vi.fn() } as any;

    removeTrack(pc, sender);
    expect(pc.removeTrack).toHaveBeenCalledWith(sender);
  });
});

// ---------------------------------------------------------------------------
// findSenderForTrack
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// removeAllTracks
// ---------------------------------------------------------------------------

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
// rewriteMids – edge cases
// ---------------------------------------------------------------------------

describe("rewriteMids() edge cases", () => {
  it("empty trackNames returns SDP unchanged", () => {
    const sdp = "v=0\r\na=mid:0\r\n";
    expect(rewriteMids(sdp, [])).toBe(sdp);
  });

  it("more trackNames than media sections ignores excess", () => {
    const sdp =
      "v=0\r\na=group:BUNDLE 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=mid:0\r\n";
    const result = rewriteMids(sdp, ["track_a", "track_b", "track_c"]);
    expect(result).toContain("a=mid:track_a");
    expect(result).not.toContain("track_b");
    expect(result).not.toContain("track_c");
  });
});

// ---------------------------------------------------------------------------
// extractConnectionStats – edge cases
// ---------------------------------------------------------------------------

describe("extractConnectionStats() edge cases", () => {
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

  it("missing framesPerSecond returns undefined fps", () => {
    const entries = new Map<string, any>([
      [
        "ir1",
        {
          type: "inbound-rtp",
          kind: "video",
          jitter: 0.005,
          packetsReceived: 100,
          packetsLost: 0,
        },
      ],
    ]);
    const report = {
      forEach: (cb: (v: any, k: string) => void) => entries.forEach(cb),
      get: (k: string) => entries.get(k),
    } as unknown as RTCStatsReport;

    const stats = extractConnectionStats(report);
    expect(stats.framesPerSecond).toBeUndefined();
    expect(stats.jitter).toBe(0.005);
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
