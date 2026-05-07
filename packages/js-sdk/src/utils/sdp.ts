// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

/**
 * SDP offer sanitization:
 * - Removes telephone-event codec entries from all m-sections.
 * - Remaps selected codec PTs that fall outside [96,127] — video: HEVC, VP8, VP9, H.264;
 *   audio: Opus. rtx entries are left at their original PTs; only apt= references are
 *   updated to follow a relocated primary.
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
 * Video: HEVC, VP8, VP9, H.264. Audio: Opus.
 * rtx entries are intentionally excluded — they keep their original PTs and only
 * have their apt= references updated when a primary is remapped.
 * Returns null when the section has no matching rtpmap.
 */
function collectSanitizedCodecPayloadSet(
  media: MediaDescription
): Set<number> | null {
  const rtpmap = collectRtpmap(media);
  const tracked = new Set<number>();
  if (media.type === "video") {
    for (const [pt, enc] of rtpmap) {
      if (isSanitizedVideoCodecRtpmapEncoding(enc)) tracked.add(pt);
    }
  } else if (media.type === "audio") {
    for (const [pt, enc] of rtpmap) {
      if (isOpusRtpmapEncoding(enc)) tracked.add(pt);
    }
  }
  return tracked.size > 0 ? tracked : null;
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

function codecRelocationPriority(enc: string | undefined): number {
  const u = (enc ?? "").toUpperCase();
  if (/^(H265|HEVC|HEV1|HVC1)/.test(u)) return 0;
  if (/^H264(\/|$)/.test(u)) return 1;
  if (/^VP9(\/|$)/.test(u)) return 2;
  if (/^VP8(\/|$)/.test(u)) return 3;
  if (/^OPUS(\/|$)/.test(u)) return 4;
  return 5;
}

/**
 * Returns `relocate` sorted so higher-priority codecs come first (H265 > H264 > VP9 > VP8 >
 * Opus). This ensures the most important codecs claim slots when the dynamic range is nearly full.
 */
function sortedRelocate(
  relocate: number[],
  rtpmap: Map<number, string>
): number[] {
  return [...relocate].sort(
    (a, b) =>
      codecRelocationPriority(rtpmap.get(a)) -
      codecRelocationPriority(rtpmap.get(b))
  );
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
 * avoiding `forbidden` and PTs already present in this m-line. Allocation is
 * best-effort: when the dynamic range is nearly full, higher-priority codecs
 * (H265 > H264 > VP9 > VP8 > Opus) are relocated first; any that cannot fit
 * are left at their original payload type rather than throwing.
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

  const rtpmap = collectRtpmap(media);
  const ordered = sortedRelocate(relocate, rtpmap);

  // Forbidden = previous m-lines + this m-line's already-in-range PTs.
  // Since relocate only contains PTs outside [96,127], those don't overlap.
  const usedPts = new Set(forbidden);
  for (const p of mediaMLinePayloadTypes(media)) {
    if (p >= DYNAMIC_PT_MIN && p <= DYNAMIC_PT_MAX) usedPts.add(p);
  }

  const remap = new Map<number, number>();
  let candidate = DYNAMIC_PT_MIN;
  for (const oldPt of ordered) {
    while (candidate <= DYNAMIC_PT_MAX && usedPts.has(candidate)) candidate++;
    if (candidate > DYNAMIC_PT_MAX) break;
    remap.set(oldPt, candidate);
    usedPts.add(candidate);
    candidate++;
  }

  if (remap.size === 0) {
    return;
  }
  applyPayloadTypeRemap(media, remap);
}

/**
 * Removes all telephone-event codec entries (rtpmap, fmtp, rtcp-fb, and the PT from the
 * m= payload list) from every m-section. Returns the input unchanged when no such entries
 * are present.
 */
function stripTelephoneEvents(sdp: string): string {
  const session = parse(sdp);
  let changed = false;
  for (const media of session.media) {
    const telPts = new Set<number>();
    for (const r of media.rtp ?? []) {
      if (/^telephone-event$/i.test(String(r.codec)))
        telPts.add(Number(r.payload));
    }
    if (telPts.size === 0) continue;
    changed = true;
    media.rtp = (media.rtp ?? []).filter((r) => !telPts.has(Number(r.payload)));
    media.payloads = mediaMLinePayloadTypes(media)
      .filter((p) => !telPts.has(p))
      .join(" ");
    if (media.fmtp) {
      media.fmtp = media.fmtp.filter((f) => !telPts.has(Number(f.payload)));
    }
    if (media.rtcpFb) {
      media.rtcpFb = media.rtcpFb.filter(
        (f) => f.payload === "*" || !telPts.has(Number(f.payload))
      );
    }
    if (media.rtcpFbTrrInt) {
      media.rtcpFbTrrInt = media.rtcpFbTrrInt.filter(
        (f) => f.payload === "*" || !telPts.has(Number(f.payload))
      );
    }
  }
  return changed ? write(session) : sdp;
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

export function sanitize(sdp: string): string {
  return transformOfferSdpCodecDynamicPts(stripTelephoneEvents(sdp));
}
