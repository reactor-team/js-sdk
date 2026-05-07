// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

// Polyfill browser WebRTC globals for Node.js so integration tests can
// exercise the SDK against production without a browser.  Unit tests
// override these with vi.stubGlobal() as needed.

import { wrapPeerConnectionWithSdpPatch } from "./wrtc-sdp-patch";

if (typeof globalThis.RTCPeerConnection === "undefined") {
  try {
    const wrtc = await import("@roamhq/wrtc");
    const mod = (wrtc as any).default ?? wrtc;
    // Test-only SDP munge: @roamhq/wrtc's libwebrtc rejects the
    // FID-grouped multi-ssrc m-sections aiortc emits (no per-ssrc
    // msid).  Real browsers accept those answers untouched, so the
    // SDK's runtime path is **not** wrapped — only this Node test
    // polyfill is.  See wrtc-sdp-patch.ts for the full rationale.
    globalThis.RTCPeerConnection = wrapPeerConnectionWithSdpPatch(
      mod.RTCPeerConnection
    );
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
