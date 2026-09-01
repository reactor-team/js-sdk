"use client";

import { useEffect, useRef, useState } from "react";
import { ReactorView, useReactor } from "@reactor-team/js-sdk";
import { useGenerationStarted, useChunkComplete } from "../lib/visko";

// The whole right side of the screen — black rounded panel with the
// model's main_video track rendered pre-bound via the generic
// <ReactorView track="main_video">. No refs, no srcObject, no autoplay
// tricks.
//
// The overlay covers the SR-priming window. The model's FIRST chunk
// emits 0 frames (frames_emitted: 0) while the super-resolution model
// primes, so `generation_started` arrives well before the first picture
// (~2 chunks, ~3.7 s). Rather than let the user stare at a black box and
// assume it broke, we hold a labelled overlay until the track actually
// delivers. StatusBadge reports the same "priming" phase so the two
// never disagree.
//
// AUDIO: main_audio rides INSIDE the <video> element via the SDK's
// `audioTrack` prop — `ReactorView` mixes both tracks into one MediaStream.
// When an audioTrack is set the SDK defaults muted=false, so sound plays
// automatically in the common case: the user has always clicked a preset /
// "Start" (a gesture that satisfies the autoplay policy) before audio
// exists. The one blocked case — a restored/autoplayed session with no
// gesture — is caught by <AudioUnlock /> and rendered as an explicit
// "Tap to enable audio" button (same pattern the ltx2 example uses).
//
// Don't bind main_audio to a second hidden <audio> element: that
// double-plays the track and gives the user no unmute affordance.
export function Video() {
  const [priming, setPriming] = useState(false);
  const videoTrack = useReactor((s) => s.tracks["main_video"]);

  useGenerationStarted(() => setPriming(true));
  // Clear the overlay the moment a chunk actually produced frames — the
  // snapshot's started flag alone doesn't mean pixels exist yet (the first
  // chunk emits 0 while the upscaler primes).
  useChunkComplete((m) => {
    if ((m.frames_emitted ?? 0) > 0) setPriming(false);
  });

  // Clear the priming overlay once the track is actually flowing (or if
  // the run stops). Doing it in an effect keeps render pure.
  useEffect(() => {
    if (videoTrack) setPriming(false);
  }, [videoTrack]);

  const showPriming = priming && !videoTrack;

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-zinc-800 bg-black lg:h-full lg:aspect-auto lg:max-h-full">
      {/*
       * main_audio rides the same <video> element via the SDK's audioTrack
       * prop (muted=false by default when an audioTrack is set — the user
       * unlocked sound by clicking Start). The transient
       * "Auto-play failed: AbortError" you may see in the console during
       * warmup is the SDK re-attaching the stream on track unmute — benign,
       * self-recovers, and documented in the SKILL notes. Don't chase it.
       */}
      <ReactorView
        className="h-full w-full"
        videoObjectFit="contain"
        track="main_video"
        audioTrack="main_audio"
      />
      {showPriming && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/60">
          <div className="max-w-xs px-6 text-center">
            <p className="text-sm font-medium text-zinc-200">
              Priming the stream…
            </p>
            <p className="mt-1 text-xs leading-snug text-zinc-500">
              The first chunk takes a few seconds while the stream warms up.
              First picture in a few seconds.
            </p>
          </div>
        </div>
      )}
      <AudioUnlock />
    </div>
  );
}

// One job: recover sound when the browser's autoplay policy blocked an
// unmuted start (the only path to audio with no user gesture). We detect
// the block by probing the view's <video> — it's document-wide, and we
// mark it with a data attribute below so any other <video> on the page
// can't collide. On block, render a button (a REAL affordance, not the
// silent always-muted state this example shipped with first); a tap both
// unmutes and re-plays, which is the gesture the policy wanted.
function AudioUnlock() {
  const [blocked, setBlocked] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      const el = rootRef.current?.querySelector("video") ?? null;
      if (!el) return;
      // Playing with sound = done forever. Still blocked = needs the tap.
      if (!el.paused && !el.muted) {
        setBlocked(false);
      } else if (el.paused) {
        // Autoplay blocked. Only flag once a stream is actually attached —
        // during priming the element exists with no srcObject yet, and a
        // too-early probe would mis-report that window as a block.
        setBlocked(el.srcObject instanceof MediaStream);
      }
    }, 500);
    return () => clearInterval(timer);
  }, []);

  if (!blocked) return null;

  return (
    <div ref={rootRef} className="contents">
      <button
        onClick={() => {
          const el = rootRef.current?.querySelector("video") ?? null;
          if (!el) return;
          el.muted = false;
          el.play().catch(() => undefined);
          setBlocked(false);
        }}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-fg shadow-lg hover:opacity-90"
      >
        Tap to enable audio
      </button>
    </div>
  );
}
