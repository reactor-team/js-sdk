/**
 * !!! INTEGRATION-TEST-ONLY WORKAROUND — DO NOT IMPORT FROM THE SDK !!!
 *
 * This file lives under `__tests__/` on purpose.  Real browser
 * `RTCPeerConnection`s do not need it, the SDK's runtime path
 * (`src/core/WebRTCTransportClient.ts`) does not call it, and
 * production traffic flows through the unmodified SDP answer.  The
 * only consumer is `__tests__/setup.ts`, which wraps the
 * `@roamhq/wrtc` polyfill used by the Node-based integration
 * tests.
 *
 * Why it exists
 * -------------
 * The Reactor server-side transport (aiortc) emits SDP answers that
 * group an output track's primary + RTX ssrcs with `a=ssrc-group:FID`
 * but does **not** add per-ssrc `msid` annotations or an m-section
 * `a=msid:` line.  Real browsers accept this in production — Chrome,
 * Safari, Firefox all happily fold the FID-grouped ssrcs into a
 * single track and the SDK works against `api.reactor.inc` from a
 * normal browser tab without any patching.
 *
 * The libwebrtc vendored into `@roamhq/wrtc` does **not** fold them
 * — each ssrc becomes its own `StreamParams`, tripping the Unified
 * Plan check in `pc/sdp_offer_answer.cc`:
 *
 *     if (desc.streams().size() > 1u)
 *       return RTCError(... "Media section has more than one track
 *                            specified with a=ssrc lines which is not
 *                            supported with Unified Plan.");
 *
 * That check is also present on the latest `@roamhq/wrtc` (0.10.0,
 * libwebrtc M106), so bumping the dep doesn't help — the difference
 * must live in upstream Chromium's `StreamParams` construction,
 * which isn't shipped to userland by `@roamhq/wrtc` regardless of
 * version.
 *
 * Because this is purely a `@roamhq/wrtc` parser quirk we hit only
 * in Node, the workaround is scoped to the test polyfill: the SDK
 * itself stays untouched and continues to feed the unmodified answer
 * to browsers in production.
 *
 * What it does
 * ------------
 * Rewrites an SDP **answer** (offers and other types pass through
 * untouched) to add the missing annotations for any audio/video
 * m-section that has `a=ssrc:` lines but no `msid` info,
 * synthesising a stable per-section track id derived from the MID
 * so the same answer always patches the same way.
 */

const SECTION_KINDS_TO_PATCH = new Set(["audio", "video"]);

interface Section {
  start: number;
  end: number;
  kind: string;
  mid?: string;
  hasSsrc: boolean;
  hasMsid: boolean;
  ssrcOrder: string[];
}

export function patchSdpForUnifiedPlan(sdp: string): string {
  const eol = sdp.includes("\r\n") ? "\r\n" : "\n";
  const lines = sdp.split(eol);

  const mLineIdxs: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("m=")) mLineIdxs.push(i);
  }
  if (mLineIdxs.length === 0) return sdp;

  const sections: Section[] = [];
  for (let i = 0; i < mLineIdxs.length; i++) {
    const start = mLineIdxs[i];
    const end = i + 1 < mLineIdxs.length ? mLineIdxs[i + 1] : lines.length;
    const kindMatch = /^m=(\S+)/.exec(lines[start]);
    const sec: Section = {
      start,
      end,
      kind: kindMatch?.[1] ?? "",
      hasSsrc: false,
      hasMsid: false,
      ssrcOrder: [],
    };
    const seen = new Set<string>();
    for (let j = start; j < end; j++) {
      const line = lines[j];
      if (line.startsWith("a=mid:")) {
        sec.mid = line.slice("a=mid:".length).trim();
      } else if (line.startsWith("a=msid:")) {
        sec.hasMsid = true;
      } else if (line.startsWith("a=ssrc:")) {
        sec.hasSsrc = true;
        const m = /^a=ssrc:(\d+)\s+(\S+):/.exec(line);
        if (m) {
          if (m[2] === "msid") sec.hasMsid = true;
          if (!seen.has(m[1])) {
            seen.add(m[1]);
            sec.ssrcOrder.push(m[1]);
          }
        }
      }
    }
    sections.push(sec);
  }

  const inserts: { afterIdx: number; line: string }[] = [];
  for (const sec of sections) {
    if (!SECTION_KINDS_TO_PATCH.has(sec.kind)) continue;
    if (!sec.hasSsrc || sec.hasMsid) continue;

    const streamId = "-";
    const trackId = `reactor-track-${sec.mid ?? sec.start}`;

    let lastSsrcIdx = -1;
    for (let j = sec.start; j < sec.end; j++) {
      if (lines[j].startsWith("a=ssrc:")) lastSsrcIdx = j;
    }
    if (lastSsrcIdx === -1) continue;

    inserts.push({
      afterIdx: lastSsrcIdx,
      line: `a=msid:${streamId} ${trackId}`,
    });
    for (const ssrc of sec.ssrcOrder) {
      inserts.push({
        afterIdx: lastSsrcIdx,
        line: `a=ssrc:${ssrc} msid:${streamId} ${trackId}`,
      });
    }
  }

  if (inserts.length === 0) return sdp;

  inserts.sort((a, b) => b.afterIdx - a.afterIdx);
  const out = lines.slice();
  for (const ins of inserts) {
    out.splice(ins.afterIdx + 1, 0, ins.line);
  }
  return out.join(eol);
}

/**
 * Wrap an `RTCPeerConnection` constructor so each instance routes
 * `setRemoteDescription(answer)` through {@link patchSdpForUnifiedPlan}
 * before delegating to the underlying implementation.  Offers and
 * non-answer descriptions pass through unchanged.
 *
 * Test-only — `__tests__/setup.ts` is the sole caller, applied to
 * the `@roamhq/wrtc` polyfill before it lands on `globalThis`.
 * Browser `RTCPeerConnection`s never see this wrapper.
 */
export function wrapPeerConnectionWithSdpPatch<
  T extends new (...args: any[]) => RTCPeerConnection,
>(OriginalPeerConnection: T): T {
  const Wrapped = function (this: RTCPeerConnection, ...args: any[]) {
    const pc = new OriginalPeerConnection(...args);
    const original = pc.setRemoteDescription.bind(pc);
    pc.setRemoteDescription = ((desc: RTCSessionDescriptionInit) => {
      if (desc?.type === "answer" && typeof desc.sdp === "string") {
        desc = { ...desc, sdp: patchSdpForUnifiedPlan(desc.sdp) };
      }
      return original(desc);
    }) as RTCPeerConnection["setRemoteDescription"];
    return pc;
  } as unknown as T;
  Wrapped.prototype = OriginalPeerConnection.prototype;
  return Wrapped;
}
