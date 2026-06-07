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

  it("preserves attribute line order within an m-section when remapping PTs", () => {
    const sdp = [
      "v=0",
      "m=video 9 UDP/TLS/RTP/SAVPF 8",
      "a=ice-ufrag:abc",
      "a=rtpmap:8 VP8/90000",
    ].join("\r\n");
    const lines = sanitize(sdp).split("\r\n");
    const iceIdx = lines.indexOf("a=ice-ufrag:abc");
    const rtpIdx = lines.findIndex((l) => l.startsWith("a=rtpmap:"));
    expect(iceIdx).toBeGreaterThan(-1);
    expect(rtpIdx).toBeGreaterThan(-1);
    expect(iceIdx).toBeLessThan(rtpIdx);
  });

  it("preserves rtpmap / rtcp-fb / fmtp interleaving with LF-only line endings", () => {
    const sdp = [
      "v=0",
      "m=video 9 UDP/TLS/RTP/SAVPF 8 9",
      "a=rtpmap:8 VP8/90000",
      "a=rtcp-fb:8 nack",
      "a=fmtp:8 x=y",
      "a=rtpmap:9 rtx/90000",
      "a=fmtp:9 apt=8",
    ].join("\n");

    const kindOrder = (s: string) =>
      s
        .split(/\n/)
        .map((l) => {
          if (l.startsWith("a=rtpmap:")) return "rtpmap";
          if (l.startsWith("a=rtcp-fb:")) return "rtcp-fb";
          if (l.startsWith("a=fmtp:")) return "fmtp";
          return null;
        })
        .filter((x): x is "rtpmap" | "rtcp-fb" | "fmtp" => x !== null);

    const out = sanitize(sdp);
    expect(kindOrder(out)).toEqual(kindOrder(sdp));
    expect(out.includes("\r\n")).toBe(false);
  });

  it("reorders rtpmap / fmtp / rtcp-fb into PT clusters following m= payload order", () => {
    const sdp = [
      "v=0",
      "m=video 9 UDP/TLS/RTP/SAVPF 96 97",
      "c=IN IP4 0.0.0.0",
      "a=ice-ufrag:x",
      // Wrong grouping: all rtpmaps first, then fmtp, then rtcp-fb (like sdp-transform write)
      "a=rtpmap:96 VP8/90000",
      "a=rtpmap:97 rtx/90000",
      "a=fmtp:97 apt=96",
      "a=rtcp-fb:96 goog-remb",
      "a=rtcp-fb:96 nack",
    ].join("\r\n");

    const out = sanitize(sdp);
    const lines = out.split("\r\n");
    const start = lines.findIndex((l) => l.startsWith("a=rtpmap:96"));
    expect(lines[start]).toBe("a=rtpmap:96 VP8/90000");
    expect(lines[start + 1]).toBe("a=rtcp-fb:96 goog-remb");
    expect(lines[start + 2]).toBe("a=rtcp-fb:96 nack");
    expect(lines[start + 3]).toBe("a=rtpmap:97 rtx/90000");
    expect(lines[start + 4]).toBe("a=fmtp:97 apt=96");
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

  it("preserves rtx bound to AV1 (apt unchanged)", () => {
    const sdp = [
      "v=0",
      "m=video 9 UDP/TLS/RTP/SAVPF 45 46",
      "a=rtpmap:45 AV1/90000",
      "a=fmtp:45 profile=0",
      "a=rtpmap:46 rtx/90000",
      "a=fmtp:46 apt=45",
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

  it("remaps HEVC primary but leaves rtx at its original PT, updating apt= reference", () => {
    const sdp = [
      "v=0",
      "m=video 9 UDP/TLS/RTP/SAVPF 8 9",
      "a=rtpmap:8 H265/90000",
      "a=fmtp:8 level-id=180",
      "a=rtpmap:9 rtx/90000",
      "a=fmtp:9 apt=8",
    ].join("\r\n");
    const out = sanitize(sdp);
    expect(out).toContain("m=video 9 UDP/TLS/RTP/SAVPF 96 9");
    expect(out).toContain("a=rtpmap:96 H265/90000");
    expect(out).toContain("a=rtpmap:9 rtx/90000");
    expect(out).toContain("a=fmtp:9 apt=96");
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
    // telephone-event at 97 is stripped; audio keeps only opus at 96
    expect(out).toContain("m=audio 9 UDP/TLS/RTP/SAVPF 96");
    expect(out).not.toContain("telephone-event");
    const videoM = out.split("\r\n").find((l) => l.startsWith("m=video"));
    expect(videoM).toBeDefined();
    // 97 freed by telephone-event removal, so H265 takes 97; rtx stays at 9
    expect(videoM).toContain("97 9");
    expect(videoM).not.toContain("96");
    expect(out).toContain("a=rtpmap:97 H265/90000");
    expect(out).toContain("a=fmtp:9 apt=97");
    expect(out).not.toContain("a=rtpmap:96 H265");
  });

  it("strips telephone-event entries from audio m-sections", () => {
    const sdp = [
      "v=0",
      "m=audio 9 UDP/TLS/RTP/SAVPF 111 110 126",
      "a=rtpmap:111 opus/48000/2",
      "a=rtpmap:110 telephone-event/48000",
      "a=rtpmap:126 telephone-event/8000",
      "a=fmtp:126 0-15",
    ].join("\r\n");
    const out = sanitize(sdp);
    expect(out).toContain("m=audio 9 UDP/TLS/RTP/SAVPF 111");
    expect(out).not.toContain("110");
    expect(out).not.toContain("126");
    expect(out).not.toContain("telephone-event");
  });

  it("returns input unchanged when there are no telephone-event entries", () => {
    const sdp = [
      "v=0",
      "m=audio 9 UDP/TLS/RTP/SAVPF 111",
      "a=rtpmap:111 opus/48000/2",
    ].join("\r\n");
    expect(sanitize(sdp)).toBe(sdp);
  });

  it("multiple low-PT HEVC formats remap starting at 97 after telephone-event is stripped from audio", () => {
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
    // telephone-event at 97 is removed, freeing that slot for video
    expect(out).not.toContain("telephone-event");
    const videoM = out.split("\r\n").find((l) => l.startsWith("m=video"));
    expect(videoM).toBeDefined();
    expect(videoM).toContain("97 98");
    expect(out).toContain("a=rtpmap:97 H265/90000");
    expect(out).toContain("a=fmtp:97 profile-id=1");
    expect(out).toContain("a=rtpmap:98 H265/90000");
    expect(out).toContain("a=fmtp:98 profile-id=2");
  });

  // Chrome-like SDP: 4 m-lines; H265 at PT 49 (mid:0) and 49+51 (mid:2); telephone-event on audio.
  const FULL_BROWSER_QUAD_MSECTION_OFFER = [
    "v=0",
    "o=- 8748351739256011160 2 IN IP4 127.0.0.1",
    "s=-",
    "t=0 0",
    "a=group:BUNDLE 0 1 2 3",
    "a=extmap-allow-mixed",
    "a=msid-semantic: WMS",
    // mid:0 — sendonly video
    "m=video 9 UDP/TLS/RTP/SAVPF 96 97 103 104 107 108 109 114 115 116 117 118 39 40 45 46 98 99 100 101 119 120 49 50 123 124 125",
    "c=IN IP4 0.0.0.0",
    "a=mid:0",
    "a=sendonly",
    "a=rtcp-mux",
    "a=rtpmap:96 VP8/90000",
    "a=rtpmap:97 rtx/90000",
    "a=fmtp:97 apt=96",
    "a=rtpmap:103 H264/90000",
    "a=fmtp:103 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f",
    "a=rtpmap:104 rtx/90000",
    "a=fmtp:104 apt=103",
    "a=rtpmap:107 H264/90000",
    "a=fmtp:107 level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42001f",
    "a=rtpmap:108 rtx/90000",
    "a=fmtp:108 apt=107",
    "a=rtpmap:109 H264/90000",
    "a=fmtp:109 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f",
    "a=rtpmap:114 rtx/90000",
    "a=fmtp:114 apt=109",
    "a=rtpmap:115 H264/90000",
    "a=fmtp:115 level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42e01f",
    "a=rtpmap:116 rtx/90000",
    "a=fmtp:116 apt=115",
    "a=rtpmap:117 H264/90000",
    "a=fmtp:117 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=4d001f",
    "a=rtpmap:118 rtx/90000",
    "a=fmtp:118 apt=117",
    "a=rtpmap:39 H264/90000",
    "a=fmtp:39 level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=4d001f",
    "a=rtpmap:40 rtx/90000",
    "a=fmtp:40 apt=39",
    "a=rtpmap:45 AV1/90000",
    "a=fmtp:45 level-idx=5;profile=0;tier=0",
    "a=rtpmap:46 rtx/90000",
    "a=fmtp:46 apt=45",
    "a=rtpmap:98 VP9/90000",
    "a=fmtp:98 profile-id=0",
    "a=rtpmap:99 rtx/90000",
    "a=fmtp:99 apt=98",
    "a=rtpmap:100 VP9/90000",
    "a=fmtp:100 profile-id=2",
    "a=rtpmap:101 rtx/90000",
    "a=fmtp:101 apt=100",
    "a=rtpmap:119 H264/90000",
    "a=fmtp:119 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=64001f",
    "a=rtpmap:120 rtx/90000",
    "a=fmtp:120 apt=119",
    "a=rtpmap:49 H265/90000",
    "a=fmtp:49 level-id=156;profile-id=1;tier-flag=0;tx-mode=SRST",
    "a=rtpmap:50 rtx/90000",
    "a=fmtp:50 apt=49",
    "a=rtpmap:123 red/90000",
    "a=rtpmap:124 rtx/90000",
    "a=fmtp:124 apt=123",
    "a=rtpmap:125 ulpfec/90000",
    // mid:1 — sendonly audio (telephone-event at 110 and 126)
    "m=audio 9 UDP/TLS/RTP/SAVPF 111 63 9 0 8 13 110 126",
    "c=IN IP4 0.0.0.0",
    "a=mid:1",
    "a=sendonly",
    "a=rtcp-mux",
    "a=rtpmap:111 opus/48000/2",
    "a=fmtp:111 minptime=10;useinbandfec=1",
    "a=rtpmap:63 red/48000/2",
    "a=fmtp:63 111/111",
    "a=rtpmap:9 G722/8000",
    "a=rtpmap:0 PCMU/8000",
    "a=rtpmap:8 PCMA/8000",
    "a=rtpmap:13 CN/8000",
    "a=rtpmap:110 telephone-event/48000",
    "a=rtpmap:126 telephone-event/8000",
    // mid:2 — recvonly video (H265 at 49 and 51, many extras below 96)
    "m=video 9 UDP/TLS/RTP/SAVPF 96 97 98 99 100 101 35 36 37 38 103 104 107 108 109 114 115 116 117 118 39 40 41 42 43 44 45 46 47 48 119 120 121 122 49 50 51 52 123 124 125 53",
    "c=IN IP4 0.0.0.0",
    "a=mid:2",
    "a=recvonly",
    "a=rtcp-mux",
    "a=rtpmap:96 VP8/90000",
    "a=rtpmap:97 rtx/90000",
    "a=fmtp:97 apt=96",
    "a=rtpmap:98 VP9/90000",
    "a=fmtp:98 profile-id=0",
    "a=rtpmap:99 rtx/90000",
    "a=fmtp:99 apt=98",
    "a=rtpmap:100 VP9/90000",
    "a=fmtp:100 profile-id=2",
    "a=rtpmap:101 rtx/90000",
    "a=fmtp:101 apt=100",
    "a=rtpmap:35 VP9/90000",
    "a=fmtp:35 profile-id=1",
    "a=rtpmap:36 rtx/90000",
    "a=fmtp:36 apt=35",
    "a=rtpmap:37 VP9/90000",
    "a=fmtp:37 profile-id=3",
    "a=rtpmap:38 rtx/90000",
    "a=fmtp:38 apt=37",
    "a=rtpmap:103 H264/90000",
    "a=fmtp:103 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f",
    "a=rtpmap:104 rtx/90000",
    "a=fmtp:104 apt=103",
    "a=rtpmap:107 H264/90000",
    "a=fmtp:107 level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42001f",
    "a=rtpmap:108 rtx/90000",
    "a=fmtp:108 apt=107",
    "a=rtpmap:109 H264/90000",
    "a=fmtp:109 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f",
    "a=rtpmap:114 rtx/90000",
    "a=fmtp:114 apt=109",
    "a=rtpmap:115 H264/90000",
    "a=fmtp:115 level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42e01f",
    "a=rtpmap:116 rtx/90000",
    "a=fmtp:116 apt=115",
    "a=rtpmap:117 H264/90000",
    "a=fmtp:117 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=4d001f",
    "a=rtpmap:118 rtx/90000",
    "a=fmtp:118 apt=117",
    "a=rtpmap:39 H264/90000",
    "a=fmtp:39 level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=4d001f",
    "a=rtpmap:40 rtx/90000",
    "a=fmtp:40 apt=39",
    "a=rtpmap:41 H264/90000",
    "a=fmtp:41 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=f4001f",
    "a=rtpmap:42 rtx/90000",
    "a=fmtp:42 apt=41",
    "a=rtpmap:43 H264/90000",
    "a=fmtp:43 level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=f4001f",
    "a=rtpmap:44 rtx/90000",
    "a=fmtp:44 apt=43",
    "a=rtpmap:45 AV1/90000",
    "a=fmtp:45 level-idx=5;profile=0;tier=0",
    "a=rtpmap:46 rtx/90000",
    "a=fmtp:46 apt=45",
    "a=rtpmap:47 AV1/90000",
    "a=fmtp:47 level-idx=5;profile=1;tier=0",
    "a=rtpmap:48 rtx/90000",
    "a=fmtp:48 apt=47",
    "a=rtpmap:119 H264/90000",
    "a=fmtp:119 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=64001f",
    "a=rtpmap:120 rtx/90000",
    "a=fmtp:120 apt=119",
    "a=rtpmap:121 H264/90000",
    "a=fmtp:121 level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=64001f",
    "a=rtpmap:122 rtx/90000",
    "a=fmtp:122 apt=121",
    "a=rtpmap:49 H265/90000",
    "a=fmtp:49 level-id=180;profile-id=1;tier-flag=0;tx-mode=SRST",
    "a=rtpmap:50 rtx/90000",
    "a=fmtp:50 apt=49",
    "a=rtpmap:51 H265/90000",
    "a=fmtp:51 level-id=180;profile-id=2;tier-flag=0;tx-mode=SRST",
    "a=rtpmap:52 rtx/90000",
    "a=fmtp:52 apt=51",
    "a=rtpmap:123 red/90000",
    "a=rtpmap:124 rtx/90000",
    "a=fmtp:124 apt=123",
    "a=rtpmap:125 ulpfec/90000",
    "a=rtpmap:53 flexfec-03/90000",
    "a=fmtp:53 repair-window=10000000",
    // mid:3 — recvonly audio (telephone-event at 110 and 126)
    "m=audio 9 UDP/TLS/RTP/SAVPF 111 63 9 0 8 13 110 126",
    "c=IN IP4 0.0.0.0",
    "a=mid:3",
    "a=recvonly",
    "a=rtcp-mux",
    "a=rtpmap:111 opus/48000/2",
    "a=fmtp:111 minptime=10;useinbandfec=1",
    "a=rtpmap:63 red/48000/2",
    "a=fmtp:63 111/111",
    "a=rtpmap:9 G722/8000",
    "a=rtpmap:0 PCMU/8000",
    "a=rtpmap:8 PCMA/8000",
    "a=rtpmap:13 CN/8000",
    "a=rtpmap:110 telephone-event/48000",
    "a=rtpmap:126 telephone-event/8000",
  ].join("\r\n");

  it("full browser offer: strips telephone-event and relocates all H265 into dynamic range", () => {
    const out = sanitize(FULL_BROWSER_QUAD_MSECTION_OFFER);
    const outLines = out.split("\r\n");
    const mLines = outLines.filter((l) => l.startsWith("m="));

    // telephone-event stripped from both audio sections
    expect(out).not.toContain("telephone-event");
    expect(mLines[1]).toBe("m=audio 9 UDP/TLS/RTP/SAVPF 111 63 9 0 8 13");
    expect(mLines[3]).toBe("m=audio 9 UDP/TLS/RTP/SAVPF 111 63 9 0 8 13");

    // mid:0 (sendonly video): H265@49 → 102, rtx@50 apt= updated; H265 stays in
    // dynamic range after telephone-event at 110+126 freed those slots for mid:2
    expect(mLines[0]).toContain("102"); // H265 relocated to 102
    expect(out).toContain("a=rtpmap:102 H265/90000");
    expect(out).toContain(
      "a=fmtp:102 level-id=156;profile-id=1;tier-flag=0;tx-mode=SRST"
    );
    expect(out).toContain("a=fmtp:50 apt=102"); // rtx apt= updated in mid:0

    // mid:2 (recvonly video): both H265 entries relocated — 49 → 106, 51 → 110
    // (110 is now available because telephone-event was stripped from the audio sections)
    expect(mLines[2]).toContain("106"); // H265 profile-1
    expect(mLines[2]).toContain("110"); // H265 profile-2
    expect(out).toContain("a=rtpmap:106 H265/90000");
    expect(out).toContain(
      "a=fmtp:106 level-id=180;profile-id=1;tier-flag=0;tx-mode=SRST"
    );
    expect(out).toContain("a=rtpmap:110 H265/90000");
    expect(out).toContain(
      "a=fmtp:110 level-id=180;profile-id=2;tier-flag=0;tx-mode=SRST"
    );
    expect(out).toContain("a=fmtp:50 apt=106"); // rtx apt= updated in mid:2
    expect(out).toContain("a=fmtp:52 apt=110"); // rtx apt= updated in mid:2
  });

  it("full browser offer: rtx rtpmaps preserved as a multiset, telephone-event removed, every H265 PT in [96,127]", () => {
    const sdp = FULL_BROWSER_QUAD_MSECTION_OFFER;
    const out = sanitize(sdp);

    const rtxRtpmapLines = (s: string) =>
      s.split("\r\n").filter((line) => /^a=rtpmap:\d+ rtx\/90000$/.test(line));

    expect(rtxRtpmapLines(out).sort()).toEqual(rtxRtpmapLines(sdp).sort());

    expect(out).not.toContain("telephone-event");

    const h265Pts = out
      .split("\r\n")
      .map((line) => /^a=rtpmap:(\d+) H265\/90000$/.exec(line))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => Number(m[1]));
    expect(h265Pts).toHaveLength(3);
    for (const pt of h265Pts) {
      expect(pt).toBeGreaterThanOrEqual(96);
      expect(pt).toBeLessThanOrEqual(127);
    }
  });

  it("in-range codec PT already used by a prior section is remapped to avoid BUNDLE conflict", () => {
    // Both audio sections have Opus at PT 111 (already in dynamic range).
    // The second section must not keep 111 — it would collide with the first in BUNDLE mode.
    const sdp = [
      "v=0",
      "m=video 9 UDP/TLS/RTP/SAVPF 42 43",
      "a=rtpmap:42 H264/90000",
      "a=rtpmap:43 rtx/90000",
      "a=fmtp:43 apt=42",
      "m=audio 9 UDP/TLS/RTP/SAVPF 111",
      "a=rtpmap:111 opus/48000/2",
      "m=video 9 UDP/TLS/RTP/SAVPF 42 43",
      "a=rtpmap:42 H264/90000",
      "a=rtpmap:43 rtx/90000",
      "a=fmtp:43 apt=42",
      "m=audio 9 UDP/TLS/RTP/SAVPF 111",
      "a=rtpmap:111 opus/48000/2",
    ].join("\r\n");
    const out = sanitize(sdp);
    const audioMLines = out
      .split("\r\n")
      .filter((l) => l.startsWith("m=audio"));
    expect(audioMLines).toHaveLength(2);
    // First audio keeps (or gets) a dynamic-range PT; second must use a different one
    const pt0 = Number(audioMLines[0]!.match(/SAVPF (\d+)/)?.[1]);
    const pt1 = Number(audioMLines[1]!.match(/SAVPF (\d+)/)?.[1]);
    expect(pt0).toBeGreaterThanOrEqual(96);
    expect(pt0).toBeLessThanOrEqual(127);
    expect(pt1).toBeGreaterThanOrEqual(96);
    expect(pt1).toBeLessThanOrEqual(127);
    expect(pt0).not.toBe(pt1);
  });

  it("16-track offer (8 video + 8 audio, below-range PTs): every section lands in [96,127] with no duplicates", () => {
    // 8 video sections: H264 at PT 42 + rtx at PT 43
    // 8 audio sections: Opus at PT 8
    // All primaries are below 96, so they all need relocating.
    // The [96,127] range (32 slots) can accommodate all 16 without exhaustion.
    const lines: string[] = ["v=0"];
    for (let i = 0; i < 8; i++) {
      lines.push(
        "m=video 9 UDP/TLS/RTP/SAVPF 42 43",
        "a=rtpmap:42 H264/90000",
        "a=rtpmap:43 rtx/90000",
        "a=fmtp:43 apt=42"
      );
    }
    for (let i = 0; i < 8; i++) {
      lines.push("m=audio 9 UDP/TLS/RTP/SAVPF 8", "a=rtpmap:8 opus/48000/2");
    }
    const out = sanitize(lines.join("\r\n"));

    const primaryPts = out
      .split("\r\n")
      .filter((l) => l.startsWith("m=video") || l.startsWith("m=audio"))
      .map((l) => Number(l.match(/SAVPF (\d+)/)?.[1]));

    expect(primaryPts).toHaveLength(16);
    for (const pt of primaryPts) {
      expect(pt).toBeGreaterThanOrEqual(96);
      expect(pt).toBeLessThanOrEqual(127);
    }
    // No two sections share a primary PT (BUNDLE safety)
    expect(new Set(primaryPts).size).toBe(16);
  });

  it("16-track offer (8 video + 8 audio, already in-range PTs): remaps duplicates across sections", () => {
    // All sections start with the codec already in [96,127]: H264=96 and Opus=111.
    // Without the forbidden.has(p) fix every section would keep its original PT,
    // producing 8 duplicate PT-96 entries and 8 duplicate PT-111 entries in BUNDLE mode.
    const lines: string[] = ["v=0"];
    for (let i = 0; i < 8; i++) {
      lines.push(
        "m=video 9 UDP/TLS/RTP/SAVPF 96 97",
        "a=rtpmap:96 H264/90000",
        "a=rtpmap:97 rtx/90000",
        "a=fmtp:97 apt=96"
      );
    }
    for (let i = 0; i < 8; i++) {
      lines.push(
        "m=audio 9 UDP/TLS/RTP/SAVPF 111",
        "a=rtpmap:111 opus/48000/2"
      );
    }
    const out = sanitize(lines.join("\r\n"));

    const primaryPts = out
      .split("\r\n")
      .filter((l) => l.startsWith("m=video") || l.startsWith("m=audio"))
      .map((l) => Number(l.match(/SAVPF (\d+)/)?.[1]));

    expect(primaryPts).toHaveLength(16);
    for (const pt of primaryPts) {
      expect(pt).toBeGreaterThanOrEqual(96);
      expect(pt).toBeLessThanOrEqual(127);
    }
    expect(new Set(primaryPts).size).toBe(16);
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
    // rtx stays at original PTs (5 and 7); only H265 primaries are relocated
    expect(videoMLines[0]).toContain("96 5");
    expect(videoMLines[1]).toContain("97 7");
    // second m-line must not reuse 96 assigned to first
    expect(videoMLines[1]).not.toContain("96");
    expect(out).toContain("a=fmtp:5 apt=96");
    expect(out).toContain("a=fmtp:7 apt=97");
  });
});
