// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

/**
 * SDP offer sanitization: remap selected codecs whose PTs fall outside [96,127] —
 * video: HEVC, VP8, VP9, H.264 (+ bound rtx); audio: Opus (+ bound rtx). Other codecs
 * are left on the offer; only reassigned PTs and references are updated.
 */

import type { MediaDescription } from "sdp-transform";
import { parse, parsePayloads, write } from "sdp-transform";

/** RTP dynamic payload type range (RFC 3551). */
const DYNAMIC_PT_MIN = 96;
const DYNAMIC_PT_MAX = 127;

/** Video codecs whose payload types are forced into [96,127] when outside that range. */
function isSanitizedVideoCodecRtpmapEncoding(name: string): boolean {
  const u = name.toUpperCase();
  if (/^(H265|HEVC|HEV1|HVC1)/.test(u)) return true;
  if (/^VP8(\/|$)/.test(u)) return true;
  if (/^VP9(\/|$)/.test(u)) return true;
  if (/^H264(\/|$)/.test(u)) return true;
  return false;
}

function isOpusRtpmapEncoding(name: string): boolean {
  return /^OPUS(\/|$)/i.test(name);
}

function parseFmtpApt(fmtpValue: string): number | null {
  const apt = fmtpValue.match(/(?:^|;)apt=(\d+)/i);
  if (!apt) return null;
  return Number.parseInt(apt[1]!, 10);
}

function mediaMLinePayloadTypes(media: MediaDescription): number[] {
  return parsePayloads(String(media.payloads ?? ""));
}

function collectRtpmap(media: MediaDescription): Map<number, string> {
  const rtpmap = new Map<number, string>();
  for (const r of media.rtp ?? []) {
    rtpmap.set(Number(r.payload), String(r.codec));
  }
  return rtpmap;
}

/**
 * Expands `seed` with rtx payload types whose fmtp `apt=` references a PT already in the set.
 */
function expandTrackedWithRtx(
  media: MediaDescription,
  rtpmap: Map<number, string>,
  seed: Set<number>
): void {
  let changed = true;
  while (changed) {
    changed = false;
    const before = seed.size;
    for (const f of media.fmtp ?? []) {
      const pt = Number(f.payload);
      const enc = rtpmap.get(pt);
      if (!enc || enc.toLowerCase() !== "rtx") continue;
      const apt = parseFmtpApt(f.config);
      if (apt !== null && seed.has(apt) && !seed.has(pt)) {
        seed.add(pt);
        changed = true;
      }
    }
    if (seed.size === before && !changed) break;
  }
}

/**
 * Video: HEVC, VP8, VP9, H.264 plus rtx for those primaries.
 * Audio: Opus plus rtx for Opus.
 * Returns null when the section has no matching rtpmap.
 */
function collectSanitizedCodecPayloadSet(
  media: MediaDescription
): Set<number> | null {
  if (media.type === "video") {
    const rtpmap = collectRtpmap(media);
    const tracked = new Set<number>();
    for (const [pt, enc] of rtpmap) {
      if (isSanitizedVideoCodecRtpmapEncoding(enc)) tracked.add(pt);
    }
    if (tracked.size === 0) return null;
    expandTrackedWithRtx(media, rtpmap, tracked);
    return tracked;
  }
  if (media.type === "audio") {
    const rtpmap = collectRtpmap(media);
    const tracked = new Set<number>();
    for (const [pt, enc] of rtpmap) {
      if (isOpusRtpmapEncoding(enc)) tracked.add(pt);
    }
    if (tracked.size === 0) return null;
    expandTrackedWithRtx(media, rtpmap, tracked);
    return tracked;
  }
  return null;
}

function mediaSectionNeedsSanitizedPtRelocate(
  media: MediaDescription
): boolean {
  const pts = collectSanitizedCodecPayloadSet(media);
  if (!pts) {
    return false;
  }
  return [...pts].some((p) => p < DYNAMIC_PT_MIN || p > DYNAMIC_PT_MAX);
}

/**
 * Picks `count` distinct payload types in [96, 127] that are not in `forbidden`.
 */
function allocateDynamicPayloadTypes(
  count: number,
  forbidden: ReadonlySet<number>
): number[] {
  if (count > DYNAMIC_PT_MAX - DYNAMIC_PT_MIN + 1) {
    throw new Error(
      "Too many video payload types to map into the dynamic PT range [96,127]"
    );
  }
  const out: number[] = [];
  for (let p = DYNAMIC_PT_MIN; p <= DYNAMIC_PT_MAX && out.length < count; p++) {
    if (!forbidden.has(p)) out.push(p);
  }
  if (out.length < count) {
    throw new Error(
      "Cannot allocate enough unique payload types in [96,127] without collision"
    );
  }
  return out;
}

function remapFmtpConfigForPayloadMap(
  config: string,
  remap: Map<number, number>
): string {
  let s = config;
  const pairs = [...remap.entries()].sort((a, b) => b[0] - a[0]);
  for (const [oldP, newP] of pairs) {
    if (oldP === newP) continue;
    s = s.replace(new RegExp(`apt=${oldP}([^0-9]|$)`, "g"), `apt=${newP}$1`);
  }
  return s;
}

/**
 * Applies a payload-type map on one audio or video m-section (`remap` may be partial).
 */
function applyPayloadTypeRemap(
  media: MediaDescription,
  remap: Map<number, number>
): void {
  if (media.type !== "video" && media.type !== "audio") {
    return;
  }
  const mPts = mediaMLinePayloadTypes(media);
  if (mPts.length === 0 || remap.size === 0) {
    return;
  }

  media.payloads = mPts.map((p) => String(remap.get(p) ?? p)).join(" ");

  for (const r of media.rtp ?? []) {
    const oldP = Number(r.payload);
    const np = remap.get(oldP);
    if (np !== undefined) r.payload = np;
  }
  for (const f of media.fmtp ?? []) {
    const oldP = Number(f.payload);
    const np = remap.get(oldP);
    if (np !== undefined) {
      f.payload = np;
      f.config = remapFmtpConfigForPayloadMap(f.config, remap);
    } else {
      f.config = remapFmtpConfigForPayloadMap(f.config, remap);
    }
  }
  for (const f of media.rtcpFb ?? []) {
    if (f.payload === "*") continue;
    const oldP = Number(f.payload);
    const np = remap.get(oldP);
    if (np !== undefined) f.payload = np;
  }
  for (const f of media.rtcpFbTrrInt ?? []) {
    if (f.payload === "*") continue;
    const oldP = Number(f.payload);
    const np = remap.get(oldP);
    if (np !== undefined) f.payload = np;
  }
  for (const ia of media.imageattrs ?? []) {
    if (ia.pt === "*") continue;
    const oldP = Number(ia.pt);
    const np = remap.get(oldP);
    if (np !== undefined) ia.pt = np;
  }
  for (const inv of media.invalid ?? []) {
    let s = inv.value;
    const pairs = [...remap.entries()].sort((a, b) => b[0] - a[0]);
    for (const [oldP, newP] of pairs) {
      if (oldP === newP) continue;
      s = s.replace(
        new RegExp(`^rtpmap:${oldP}([\\s/])`, "i"),
        `rtpmap:${newP}$1`
      );
      s = s.replace(new RegExp(`^fmtp:${oldP}(\\s)`, "i"), `fmtp:${newP}$1`);
      s = s.replace(
        new RegExp(`^rtcp-fb:${oldP}(\\s)`, "i"),
        `rtcp-fb:${newP}$1`
      );
      s = s.replace(new RegExp(`apt=${oldP}([^0-9]|$)`, "g"), `apt=${newP}$1`);
    }
    inv.value = s;
  }
}

/**
 * Remaps sanitized codec payload types (and rtx bound to them) into [96, 127],
 * avoiding `forbidden`. Other codecs on the same m-line are unchanged.
 */
function remapSanitizedCodecPayloadTypesMedia(
  media: MediaDescription,
  forbidden: ReadonlySet<number>
): void {
  if (media.type !== "video" && media.type !== "audio") {
    return;
  }
  const tracked = collectSanitizedCodecPayloadSet(media);
  if (!tracked) {
    return;
  }
  const relocate = [...tracked].filter(
    (p) => p < DYNAMIC_PT_MIN || p > DYNAMIC_PT_MAX
  );
  if (relocate.length === 0) {
    return;
  }
  relocate.sort((a, b) => a - b);
  const newPts = allocateDynamicPayloadTypes(relocate.length, forbidden);
  const remap = new Map<number, number>();
  relocate.forEach((oldP, i) => remap.set(oldP, newPts[i]!));
  applyPayloadTypeRemap(media, remap);
}

/**
 * Post-processes an SDP offer: selected codec payload types outside [96,127] are remapped
 * into the dynamic range. M-sections are processed in document order; new PTs avoid
 * collision with payload types already used on earlier m-lines.
 *
 * When no such change applies, returns the input string unchanged (avoids sdp-transform
 * normalizing session fields such as an implicit `s=` line).
 */
function transformOfferSdpCodecDynamicPts(sdp: string): string {
  const session = parse(sdp);
  if (!session.media.some(mediaSectionNeedsSanitizedPtRelocate)) {
    return sdp;
  }

  const forbidden = new Set<number>();
  for (const media of session.media) {
    remapSanitizedCodecPayloadTypesMedia(media, forbidden);
    for (const p of mediaMLinePayloadTypes(media)) {
      forbidden.add(p);
    }
  }

  return write(session);
}

/**
 * Sanitizes an SDP offer string (delegates to {@link transformOfferSdpCodecDynamicPts}).
 *
 * When applicable:
 * - **Video — dynamic PT range:** HEVC, VP8, VP9, H.264, and rtx whose `apt=` references
 *   one of those primaries: payload numbers outside [96, 127] are reassigned; rtpmap,
 *   fmtp, rtcp-fb, imageattrs, and related `a=` lines are updated for those PTs only.
 * - **Audio — Opus:** Same for Opus and rtx bound to Opus.
 * - **Collision avoidance:** M-lines are visited in order; new PTs do not reuse numbers
 *   already present on earlier m-lines.
 *
 * If no m-line needs these changes, returns `sdp` unchanged (no parse/write round trip).
 */
export function sanitize(sdp: string): string {
  return transformOfferSdpCodecDynamicPts(sdp);
}
