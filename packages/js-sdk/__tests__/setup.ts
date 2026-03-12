// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

// Polyfill browser WebRTC globals for Node.js so integration tests can
// exercise the SDK against production without a browser.  Unit tests
// override these with vi.stubGlobal() as needed.

if (typeof globalThis.RTCPeerConnection === "undefined") {
  try {
    const wrtc = await import("@roamhq/wrtc");
    const mod = (wrtc as any).default ?? wrtc;
    globalThis.RTCPeerConnection = mod.RTCPeerConnection;
    globalThis.RTCSessionDescription = mod.RTCSessionDescription;
    globalThis.RTCIceCandidate = mod.RTCIceCandidate;
    globalThis.MediaStream = mod.MediaStream;
    globalThis.MediaStreamTrack = mod.MediaStreamTrack;
  } catch {
    // @roamhq/wrtc not installed — integration tests that need
    // real WebRTC will fail; unit tests mock everything and are fine.
  }
}

// Silence verbose SDK logging during tests (ICE candidates, connection
// state changes, security warnings, etc.).  Only console.log and
// console.error are preserved.
// Set REACTOR_TEST_VERBOSE=1 to restore full output.
if (!process.env.REACTOR_TEST_VERBOSE) {
  console.debug = () => {};
  console.warn = () => {};
}
