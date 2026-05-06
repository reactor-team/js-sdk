// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect } from "vitest";
import { sanitize } from "../../src/utils/sdp";

describe("sanitize()", () => {
  it("returns the input unchanged when no m-line needs sanitization", () => {
    const sdp =
      "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n";
    expect(sanitize(sdp)).toBe(sdp);
  });

  it("remaps Opus from a low static PT into the dynamic range", () => {
    const sdp = [
      "v=0",
      "m=audio 9 UDP/TLS/RTP/SAVPF 8",
      "a=rtpmap:8 opus/48000/2",
    ].join("\r\n");
    const out = sanitize(sdp);
    expect(out).toContain("m=audio 9 UDP/TLS/RTP/SAVPF 96");
    expect(out).toContain("a=rtpmap:96 opus/48000/2");
  });

  it("returns the input unchanged for VP8-only video already in the dynamic PT range", () => {
    const sdp = [
      "v=0",
      "m=video 9 UDP/TLS/RTP/SAVPF 96",
      "a=rtpmap:96 VP8/90000",
    ].join("\r\n");
    expect(sanitize(sdp)).toBe(sdp);
  });

  it("preserves AV1 at PT 45 (outside the dynamic range)", () => {
    const sdp = [
      "v=0",
      "m=video 9 UDP/TLS/RTP/SAVPF 45",
      "a=rtpmap:45 AV1/90000",
      "a=fmtp:45 profile=0",
    ].join("\r\n");
    expect(sanitize(sdp)).toBe(sdp);
  });

  it("remaps VP8 from a low static PT into the dynamic range", () => {
    const sdp = [
      "v=0",
      "m=video 9 UDP/TLS/RTP/SAVPF 8",
      "a=rtpmap:8 VP8/90000",
    ].join("\r\n");
    const out = sanitize(sdp);
    expect(out).toContain("m=video 9 UDP/TLS/RTP/SAVPF 96");
    expect(out).toContain("a=rtpmap:96 VP8/90000");
    expect(out).not.toContain("rtpmap:8 ");
  });

  it("remaps VP9 from a low static PT into the dynamic range", () => {
    const sdp = [
      "v=0",
      "m=video 9 UDP/TLS/RTP/SAVPF 8",
      "a=rtpmap:8 VP9/90000",
    ].join("\r\n");
    const out = sanitize(sdp);
    expect(out).toContain("m=video 9 UDP/TLS/RTP/SAVPF 96");
    expect(out).toContain("a=rtpmap:96 VP9/90000");
  });

  it("remaps H264 from a low static PT into the dynamic range", () => {
    const sdp = [
      "v=0",
      "m=video 9 UDP/TLS/RTP/SAVPF 8",
      "a=rtpmap:8 H264/90000",
      "a=fmtp:8 level-asymmetry-allowed=1",
    ].join("\r\n");
    const out = sanitize(sdp);
    expect(out).toContain("m=video 9 UDP/TLS/RTP/SAVPF 96");
    expect(out).toContain("a=rtpmap:96 H264/90000");
    expect(out).toContain("a=fmtp:96 level-asymmetry-allowed=1");
  });

  it("remaps only HEVC low PTs and leaves other codecs at low PTs untouched", () => {
    const sdp = [
      "v=0",
      "m=video 9 UDP/TLS/RTP/SAVPF 100 8",
      "a=rtpmap:100 VP8/90000",
      "a=rtpmap:8 H265/90000",
      "a=fmtp:8 level-id=180",
    ].join("\r\n");
    const out = sanitize(sdp);
    expect(out).toContain("a=rtpmap:100 VP8/90000");
    expect(out).not.toContain("a=rtpmap:8 ");
    expect(out).toMatch(/m=video 9 UDP\/TLS\/RTP\/SAVPF 100 96\r/);
    expect(out).toContain("a=rtpmap:96 H265/90000");
    expect(out).toContain("a=fmtp:96 level-id=180");
  });

  it("keeps non-HEVC codecs when H265 rtpmap is present", () => {
    const sdp = [
      "v=0",
      "m=video 9 UDP/TLS/RTP/SAVPF 100 101 99",
      "a=rtpmap:100 VP8/90000",
      "a=rtpmap:101 rtx/90000",
      "a=fmtp:101 apt=100",
      "a=rtpmap:99 H265/90000",
      "a=fmtp:99 level-id=180",
      "m=audio 9 UDP/TLS/RTP/SAVPF 111",
      "a=rtpmap:111 opus/48000/2",
    ].join("\r\n");
    const out = sanitize(sdp);
    expect(out).toContain("m=video 9 UDP/TLS/RTP/SAVPF 100 101 99");
    expect(out).toMatch(/^a=rtpmap:100 VP8\/90000/m);
    expect(out).toContain("a=rtpmap:99 H265/90000");
    expect(out).toContain("m=audio 9 UDP/TLS/RTP/SAVPF 111");
  });

  it("remaps video payload types below 96 into the dynamic range", () => {
    const sdp = [
      "v=0",
      "m=video 9 UDP/TLS/RTP/SAVPF 8",
      "a=rtpmap:8 H265/90000",
      "a=fmtp:8 level-id=180",
    ].join("\r\n");
    const out = sanitize(sdp);
    expect(out).toContain("m=video 9 UDP/TLS/RTP/SAVPF 96");
    expect(out).toContain("a=rtpmap:96 H265/90000");
    expect(out).toContain("a=fmtp:96 level-id=180");
    expect(out).not.toContain("rtpmap:8");
  });

  it("keeps rtx for HEVC primary and remaps low PTs together", () => {
    const sdp = [
      "v=0",
      "m=video 9 UDP/TLS/RTP/SAVPF 8 9",
      "a=rtpmap:8 H265/90000",
      "a=fmtp:8 level-id=180",
      "a=rtpmap:9 rtx/90000",
      "a=fmtp:9 apt=8",
    ].join("\r\n");
    const out = sanitize(sdp);
    expect(out).toContain("m=video 9 UDP/TLS/RTP/SAVPF 96 97");
    expect(out).toContain("a=rtpmap:96 H265/90000");
    expect(out).toContain("a=fmtp:97 apt=96");
  });

  it("keeps VP8 alongside multiple H265 payload types", () => {
    const sdp = [
      "v=0",
      "m=video 9 UDP/TLS/RTP/SAVPF 100 101 102",
      "a=rtpmap:100 VP8/90000",
      "a=rtpmap:101 H265/90000",
      "a=fmtp:101 profile-id=1",
      "a=rtpmap:102 H265/90000",
      "a=fmtp:102 profile-id=2;tier-flag=0",
      "m=audio 9 UDP/TLS/RTP/SAVPF 111",
      "a=rtpmap:111 opus/48000/2",
    ].join("\r\n");
    const out = sanitize(sdp);
    expect(out).toMatch(/m=video 9 UDP\/TLS\/RTP\/SAVPF 100 101 102\r/);
    expect(out).toContain("a=rtpmap:100 VP8/90000");
    expect(out).toContain("a=rtpmap:101 H265/90000");
    expect(out).toContain("a=rtpmap:102 H265/90000");
    expect(out).toContain("a=fmtp:101 profile-id=1");
    expect(out).toContain("a=fmtp:102 profile-id=2;tier-flag=0");
  });

  it("remapped video PTs skip dynamic values already used on other m-lines", () => {
    const sdp = [
      "v=0",
      "m=audio 9 UDP/TLS/RTP/SAVPF 96 97",
      "a=rtpmap:96 opus/48000/2",
      "a=rtpmap:97 telephone-event/8000",
      "m=video 9 UDP/TLS/RTP/SAVPF 8 9",
      "a=rtpmap:8 H265/90000",
      "a=fmtp:8 level-id=180",
      "a=rtpmap:9 rtx/90000",
      "a=fmtp:9 apt=8",
    ].join("\r\n");
    const out = sanitize(sdp);
    expect(out).toContain("m=audio 9 UDP/TLS/RTP/SAVPF 96 97");
    const videoM = out.split("\r\n").find((l) => l.startsWith("m=video"));
    expect(videoM).toBeDefined();
    expect(videoM).toContain("98 99");
    expect(videoM).not.toContain("96 97");
    expect(out).toContain("a=rtpmap:98 H265/90000");
    expect(out).toContain("a=fmtp:99 apt=98");
    expect(out).not.toContain("a=rtpmap:96 H265");
  });

  it("multiple low-PT HEVC formats remap to unused dynamic PTs when audio occupies 96–97", () => {
    const sdp = [
      "v=0",
      "m=audio 9 UDP/TLS/RTP/SAVPF 96 97",
      "a=rtpmap:96 opus/48000/2",
      "a=rtpmap:97 telephone-event/8000",
      "m=video 9 UDP/TLS/RTP/SAVPF 4 6",
      "a=rtpmap:4 H265/90000",
      "a=fmtp:4 profile-id=1",
      "a=rtpmap:6 H265/90000",
      "a=fmtp:6 profile-id=2",
    ].join("\r\n");
    const out = sanitize(sdp);
    const videoM = out.split("\r\n").find((l) => l.startsWith("m=video"));
    expect(videoM).toBeDefined();
    expect(videoM).toContain("98 99");
    expect(out).toContain("a=rtpmap:98 H265/90000");
    expect(out).toContain("a=fmtp:98 profile-id=1");
    expect(out).toContain("a=rtpmap:99 H265/90000");
    expect(out).toContain("a=fmtp:99 profile-id=2");
  });

  it("later video m-line avoids PTs already assigned to an earlier video m-line", () => {
    const sdp = [
      "v=0",
      "m=video 9 UDP/TLS/RTP/SAVPF 4 5",
      "a=rtpmap:4 H265/90000",
      "a=rtpmap:5 rtx/90000",
      "a=fmtp:5 apt=4",
      "m=video 9 UDP/TLS/RTP/SAVPF 6 7",
      "a=rtpmap:6 H265/90000",
      "a=fmtp:6 profile-id=2",
      "a=rtpmap:7 rtx/90000",
      "a=fmtp:7 apt=6",
      "m=audio 9 UDP/TLS/RTP/SAVPF 111",
      "a=rtpmap:111 opus/48000/2",
    ].join("\r\n");
    const out = sanitize(sdp);
    const videoMLines = out
      .split("\r\n")
      .filter((l) => l.startsWith("m=video"));
    expect(videoMLines).toHaveLength(2);
    expect(videoMLines[0]).toContain("96 97");
    expect(videoMLines[1]).toContain("98 99");
  });
});
