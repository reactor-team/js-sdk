/**
 * SDP offer sanitization:
 * - Removes telephone-event codec entries from all m-sections.
 * - Remaps selected codec PTs that fall outside [96,127] — video: HEVC, VP8, VP9, H.264;
 *   audio: Opus. rtx entries stay at their original PTs; only apt= references are updated
 *   when a primary is remapped.
 * - After PT edits, RTP/SAVPF sections are normalized so rtpmap/fmtp/rtcp-fb (per PT) follow
 *   the payload-type order on the `m=` line (Chrome-style interleaving), not grouped by line type.
 * - Line breaks are preserved (`\r\n` vs `\n`) using `\r?\n` splits.
 */

import type { MediaDescription } from "sdp-transform";
import { parse, parsePayloads } from "sdp-transform";

function sdpLineSeparator(sdp: string): "\r\n" | "\n" {
  return sdp.includes("\r\n") ? "\r\n" : "\n";
}

function splitSdpLines(sdp: string): string[] {
  return sdp.split(/\r?\n/);
}

function joinSdpLines(lines: readonly string[], sep: "\r\n" | "\n"): string {
  return lines.join(sep);
}

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
 * Remaps sanitized codec payload types (and rtx bound to them) into [96, 127],
 * avoiding `forbidden` and PTs already present in this m-line. Allocation is
 * best-effort: when the dynamic range is nearly full, higher-priority codecs
 * (H265 > H264 > VP9 > VP8 > Opus) are relocated first; any that cannot fit
 * are left at their original payload type rather than throwing.
 */
function computeCodecRemapForMedia(
  media: MediaDescription,
  forbidden: ReadonlySet<number>
): Map<number, number> {
  const remap = new Map<number, number>();
  if (media.type !== "video" && media.type !== "audio") {
    return remap;
  }
  const tracked = collectSanitizedCodecPayloadSet(media);
  if (!tracked) {
    return remap;
  }
  const relocate = [...tracked].filter(
    (p) => p < DYNAMIC_PT_MIN || p > DYNAMIC_PT_MAX || forbidden.has(p)
  );
  if (relocate.length === 0) {
    return remap;
  }

  const rtpmap = collectRtpmap(media);
  const ordered = sortedRelocate(relocate, rtpmap);

  const usedPts = new Set(forbidden);
  for (const p of mediaMLinePayloadTypes(media)) {
    if (p >= DYNAMIC_PT_MIN && p <= DYNAMIC_PT_MAX) usedPts.add(p);
  }

  let candidate = DYNAMIC_PT_MIN;
  for (const oldPt of ordered) {
    while (candidate <= DYNAMIC_PT_MAX && usedPts.has(candidate)) candidate++;
    if (candidate > DYNAMIC_PT_MAX) break;
    remap.set(oldPt, candidate);
    usedPts.add(candidate);
    candidate++;
  }

  return remap;
}

function rewriteRtpSavpfMPayloads(
  mLine: string,
  mapPt: (pt: number) => number
): string {
  if (!/\bRTP\/SAVPF\b/.test(mLine)) {
    return mLine;
  }
  const tokens = mLine.split(/\s+/);
  if (tokens.length < 4) {
    return mLine;
  }
  const head = tokens.slice(0, 3).join(" ");
  const tail = tokens
    .slice(3)
    .map((t) => (/^\d+$/.test(t) ? String(mapPt(Number(t))) : t));
  return `${head} ${tail.join(" ")}`;
}

function payloadTypesFromSavpfMLine(mLine: string): number[] {
  const m = /\bRTP\/SAVPF\s+(.+)$/i.exec(mLine);
  return m ? parsePayloads(m[1]!.trim()) : [];
}

function payloadTypeFromPtBoundAttributeLine(line: string): number | null {
  if (line.startsWith("a=rtpmap:")) {
    const x = /^a=rtpmap:(\d+)/i.exec(line);
    return x ? Number(x[1]) : null;
  }
  if (line.startsWith("a=fmtp:")) {
    const x = /^a=fmtp:(\d+)/i.exec(line);
    return x ? Number(x[1]) : null;
  }
  if (line.startsWith("a=rtcp-fb:")) {
    const x = /^a=rtcp-fb:(\*|(\d+))/i.exec(line);
    if (!x || x[1] === "*") return null;
    return Number(x[2]);
  }
  if (line.startsWith("a=rtcp-fb-trr-int:")) {
    const x = /^a=rtcp-fb-trr-int:(\*|(\d+))/i.exec(line);
    if (!x || x[1] === "*") return null;
    return Number(x[2]);
  }
  if (line.startsWith("a=imageattrs:")) {
    const x = /^a=imageattrs:(\*|(\d+))/i.exec(line);
    if (!x || x[1] === "*") return null;
    return Number(x[2]);
  }
  return null;
}

function isPtBoundCodecAttributeLine(line: string): boolean {
  return payloadTypeFromPtBoundAttributeLine(line) !== null;
}

/**
 * Within one RTP/SAVPF m-section, reorder rtpmap/fmtp/rtcp-fb lines so each payload type's
 * attributes are contiguous and ordered by the `m=` payload list (same interleaving style as
 * Chrome). Non-codec lines before/after the codec block stay fixed.
 */
function reorderSingleRtpSavpfSection(sec: string[]): string[] {
  const mLine = sec[0]!;
  if (!/\bRTP\/SAVPF\b/.test(mLine)) {
    return sec;
  }
  const body = sec.slice(1);
  let first = -1;
  let last = -1;
  for (let j = 0; j < body.length; j++) {
    if (isPtBoundCodecAttributeLine(body[j]!)) {
      if (first === -1) first = j;
      last = j;
    }
  }
  if (first === -1) {
    return sec;
  }

  const prefix = body.slice(0, first);
  const codecLines = body.slice(first, last + 1);
  const suffix = body.slice(last + 1);

  const mPts = payloadTypesFromSavpfMLine(mLine);
  const buckets = new Map<number, string[]>();
  for (const line of codecLines) {
    const pt = payloadTypeFromPtBoundAttributeLine(line);
    if (pt === null) continue;
    const arr = buckets.get(pt);
    if (arr) arr.push(line);
    else buckets.set(pt, [line]);
  }

  const seenOrder: number[] = [];
  for (const line of codecLines) {
    const pt = payloadTypeFromPtBoundAttributeLine(line);
    if (pt !== null && !seenOrder.includes(pt)) seenOrder.push(pt);
  }

  const outCodec: string[] = [];
  for (const pt of mPts) {
    const arr = buckets.get(pt);
    if (!arr) continue;
    outCodec.push(...arr);
    buckets.delete(pt);
  }
  for (const pt of seenOrder) {
    const arr = buckets.get(pt);
    if (!arr) continue;
    outCodec.push(...arr);
    buckets.delete(pt);
  }
  for (const arr of buckets.values()) {
    outCodec.push(...arr);
  }

  return [mLine, ...prefix, ...outCodec, ...suffix];
}

function reorderCodecAttributes(sdp: string): string {
  const sep = sdpLineSeparator(sdp);
  const lines = splitSdpLines(sdp);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.startsWith("m=")) {
      out.push(line);
      i++;
      continue;
    }
    const mLine = line;
    i++;
    const rest: string[] = [];
    while (i < lines.length && !lines[i]!.startsWith("m=")) {
      rest.push(lines[i]!);
      i++;
    }
    out.push(...reorderSingleRtpSavpfSection([mLine, ...rest]));
  }
  return joinSdpLines(out, sep);
}

function applyRemapToMediaAttributeLine(
  line: string,
  remap: Map<number, number>
): string {
  if (!line.startsWith("a=")) {
    return line;
  }

  if (line.startsWith("a=rtpmap:")) {
    const m = /^a=rtpmap:(\d+)/.exec(line);
    if (!m) return line;
    const pt = Number(m[1]);
    const np = remap.get(pt) ?? pt;
    return np === pt ? line : line.replace(/^a=rtpmap:\d+/, `a=rtpmap:${np}`);
  }

  if (line.startsWith("a=fmtp:")) {
    const m = /^a=fmtp:(\d+)\s(.*)$/.exec(line);
    if (!m) return line;
    const pt = Number(m[1]);
    const np = remap.get(pt) ?? pt;
    const cfg = remapFmtpConfigForPayloadMap(m[2], remap);
    return `a=fmtp:${np} ${cfg}`;
  }

  if (line.startsWith("a=rtcp-fb:")) {
    const m = /^a=rtcp-fb:(\*|\d+)(\s.*)?$/.exec(line);
    if (!m || m[1] === "*") return line;
    const pt = Number(m[1]);
    const np = remap.get(pt) ?? pt;
    return np === pt ? line : `a=rtcp-fb:${np}${m[2] ?? ""}`;
  }

  if (line.startsWith("a=rtcp-fb-trr-int:")) {
    const m = /^a=rtcp-fb-trr-int:(\*|\d+)(\s.*)?$/.exec(line);
    if (!m || m[1] === "*") return line;
    const pt = Number(m[1]);
    const np = remap.get(pt) ?? pt;
    return np === pt ? line : `a=rtcp-fb-trr-int:${np}${m[2] ?? ""}`;
  }

  if (line.startsWith("a=imageattrs:")) {
    const m = /^a=imageattrs:(\*|\d+)(\s.*)?$/.exec(line);
    if (!m || m[1] === "*") return line;
    const pt = Number(m[1]);
    const np = remap.get(pt) ?? pt;
    return np === pt ? line : `a=imageattrs:${np}${m[2] ?? ""}`;
  }

  return line;
}

function stripTelephoneEventsPreserveOrder(sdp: string): string {
  const session = parse(sdp);
  const telPerSection = session.media.map((media) => {
    const tel = new Set<number>();
    for (const r of media.rtp ?? []) {
      if (/^telephone-event$/i.test(String(r.codec))) {
        tel.add(Number(r.payload));
      }
    }
    return tel;
  });
  if (!telPerSection.some((s) => s.size > 0)) {
    return sdp;
  }

  const sep = sdpLineSeparator(sdp);
  const lines = splitSdpLines(sdp);
  let secIdx = -1;
  const out: string[] = [];
  for (const line of lines) {
    if (line.startsWith("m=")) {
      secIdx++;
      const drop = telPerSection[secIdx];
      if (!drop || drop.size === 0 || !/\bRTP\/SAVPF\b/.test(line)) {
        out.push(line);
        continue;
      }
      const tokens = line.split(/\s+/);
      const head = tokens.slice(0, 3).join(" ");
      const nums = tokens
        .slice(3)
        .filter((t) => /^\d+$/.test(t))
        .map(Number)
        .filter((p) => !drop.has(p));
      out.push(`${head} ${nums.join(" ")}`);
      continue;
    }
    if (secIdx >= 0) {
      const drop = telPerSection[secIdx];
      if (drop && drop.size > 0) {
        const rtp = /^a=rtpmap:(\d+)\s/i.exec(line);
        if (rtp && drop.has(Number(rtp[1]))) continue;
        const fmtp = /^a=fmtp:(\d+)\s/i.exec(line);
        if (fmtp && drop.has(Number(fmtp[1]))) continue;
        const rfb = /^a=rtcp-fb:(\d+)\s/i.exec(line);
        if (rfb && drop.has(Number(rfb[1]))) continue;
        const trr = /^a=rtcp-fb-trr-int:(\d+)\s/i.exec(line);
        if (trr && drop.has(Number(trr[1]))) continue;
      }
    }
    out.push(line);
  }
  return joinSdpLines(out, sep);
}

function transformOfferSdpCodecDynamicPts(sdp: string): string {
  const session = parse(sdp);
  // Skip entirely only when no section carries any tracked codec at all.
  // The weaker condition (vs. mediaSectionNeedsSanitizedPtRelocate) is intentional:
  // a section whose codec PT is already in [96,127] still needs relocation when
  // that PT conflicts with a prior section's PT in BUNDLE mode.
  if (!session.media.some((m) => collectSanitizedCodecPayloadSet(m) !== null)) {
    return sdp;
  }

  const remaps: Map<number, number>[] = [];
  const forbidden = new Set<number>();
  for (const media of session.media) {
    const R = computeCodecRemapForMedia(media, forbidden);
    remaps.push(R);
    for (const p of mediaMLinePayloadTypes(media)) {
      forbidden.add(R.get(p) ?? p);
    }
  }

  const sep = sdpLineSeparator(sdp);
  const lines = splitSdpLines(sdp);
  let secIdx = -1;
  const out: string[] = [];
  for (let line of lines) {
    if (line.startsWith("m=")) {
      secIdx++;
      const R = remaps[secIdx]!;
      if (R.size > 0 && /\bRTP\/SAVPF\b/.test(line)) {
        line = rewriteRtpSavpfMPayloads(line, (p) => R.get(p) ?? p);
      }
      out.push(line);
      continue;
    }
    const R = secIdx >= 0 ? remaps[secIdx]! : null;
    if (!R || R.size === 0) {
      out.push(line);
      continue;
    }
    out.push(applyRemapToMediaAttributeLine(line, R));
  }
  return joinSdpLines(out, sep);
}

export function sanitize(sdp: string): string {
  const stripped = stripTelephoneEventsPreserveOrder(sdp);
  const remapped = transformOfferSdpCodecDynamicPts(stripped);
  return reorderCodecAttributes(remapped);
}
