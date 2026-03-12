// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GPUMachineClient } from "../../src/core/GPUMachineClient";

function createMockPeerConnection() {
  return {
    addTransceiver: vi.fn().mockReturnValue({
      sender: { replaceTrack: vi.fn() },
      mid: "0",
    }),
    createOffer: vi.fn().mockResolvedValue({
      type: "offer",
      sdp: [
        "v=0",
        "o=- 0 0 IN IP4 127.0.0.1",
        "s=-",
        "a=group:BUNDLE 0",
        "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
        "a=mid:0",
        "",
      ].join("\r\n"),
    }),
    setLocalDescription: vi.fn(),
    setRemoteDescription: vi.fn(),
    createDataChannel: vi.fn().mockReturnValue({
      onopen: null as ((ev: Event) => void) | null,
      onclose: null,
      onerror: null,
      onmessage: null,
      readyState: "connecting",
      close: vi.fn(),
      send: vi.fn(),
    }),
    close: vi.fn(),
    getSenders: vi.fn().mockReturnValue([]),
    getReceivers: vi.fn().mockReturnValue([]),
    getStats: vi.fn().mockResolvedValue(new Map()),
    get localDescription() {
      return {
        sdp: [
          "v=0",
          "o=- 0 0 IN IP4 127.0.0.1",
          "s=-",
          "a=group:BUNDLE 0",
          "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
          "a=mid:0",
          "",
        ].join("\r\n"),
      };
    },
    signalingState: "have-local-offer",
    connectionState: "new",
    iceGatheringState: "complete",
    onconnectionstatechange: null as (() => void) | null,
    ontrack: null,
    onicecandidate: null,
    onicecandidateerror: null,
    ondatachannel: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

describe("GPUMachineClient connection timings", () => {
  let mockPC: ReturnType<typeof createMockPeerConnection>;

  beforeEach(() => {
    mockPC = createMockPeerConnection();
    vi.stubGlobal("RTCPeerConnection", vi.fn().mockReturnValue(mockPC));
    vi.stubGlobal(
      "RTCSessionDescription",
      vi.fn().mockImplementation((d: any) => d)
    );
    vi.stubGlobal(
      "RTCIceCandidate",
      vi.fn().mockImplementation((c: any) => c)
    );
    vi.stubGlobal(
      "MediaStream",
      vi.fn().mockImplementation(() => ({ getTracks: () => [] }))
    );
  });

  it("returns undefined before connect", () => {
    const client = new GPUMachineClient({ iceServers: [] });
    expect(client.getConnectionTimings()).toBeUndefined();
  });

  it("records ICE and data channel durations after connection", async () => {
    const client = new GPUMachineClient({ iceServers: [] });

    await client.createOffer({ send: [], receive: [] });
    await client.connect("v=0\r\nanswer");

    // Simulate peer connection reaching "connected"
    mockPC.connectionState = "connected";
    mockPC.onconnectionstatechange!();

    // Simulate data channel opening
    const dc = mockPC.createDataChannel.mock.results[0].value;
    dc.readyState = "open";
    dc.onopen(new Event("open"));

    const timings = client.getConnectionTimings();
    expect(timings).toBeDefined();
    expect(timings!.iceNegotiationMs).toBeGreaterThanOrEqual(0);
    expect(timings!.dataChannelMs).toBeGreaterThanOrEqual(0);
  });

  it("returns undefined when only ICE connected but data channel not open", async () => {
    const client = new GPUMachineClient({ iceServers: [] });

    await client.createOffer({ send: [], receive: [] });
    await client.connect("v=0\r\nanswer");

    mockPC.connectionState = "connected";
    mockPC.onconnectionstatechange!();

    expect(client.getConnectionTimings()).toBeUndefined();
  });

  it("clears timings on disconnect", async () => {
    const client = new GPUMachineClient({ iceServers: [] });

    await client.createOffer({ send: [], receive: [] });
    await client.connect("v=0\r\nanswer");

    mockPC.connectionState = "connected";
    mockPC.onconnectionstatechange!();
    const dc = mockPC.createDataChannel.mock.results[0].value;
    dc.readyState = "open";
    dc.onopen(new Event("open"));

    expect(client.getConnectionTimings()).toBeDefined();

    await client.disconnect();
    expect(client.getConnectionTimings()).toBeUndefined();
  });

  it("resetConnectionTimings clears all timing state", async () => {
    const client = new GPUMachineClient({ iceServers: [] });

    await client.createOffer({ send: [], receive: [] });
    await client.connect("v=0\r\nanswer");

    mockPC.connectionState = "connected";
    mockPC.onconnectionstatechange!();
    const dc = mockPC.createDataChannel.mock.results[0].value;
    dc.readyState = "open";
    dc.onopen(new Event("open"));

    expect(client.getConnectionTimings()).toBeDefined();

    client.resetConnectionTimings();
    expect(client.getConnectionTimings()).toBeUndefined();
  });
});
