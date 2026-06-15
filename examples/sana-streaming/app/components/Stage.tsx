"use client";

import { SanaStreamingMainVideoView } from "@reactor-models/sana-streaming";
import { useEffect, useRef } from "react";
import type { SanaMode, SanaState } from "../lib/types";

export function Stage({
  state,
  mode,
  sourceUrl,
  cleared,
}: {
  state: SanaState;
  mode: SanaMode;
  sourceUrl: string | null;
  // After a reset the WebRTC <video> would freeze on the last received frame
  // (the model emits nothing new) - cover it until generation runs again.
  cleared: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sideBySide = mode === "file" && !!sourceUrl;

  // Drive the local source video off the model's reducer state - approximate
  // sync by design (play/pause only, no seeking or drift correction).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!state.hasVideo) {
      v.pause();
      v.currentTime = 0;
      return;
    }
    if (state.running && !state.paused) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
    // sideBySide is unused in the body but kept in deps on purpose: the
    // <video> remounts when the layout switches, so re-run the sync.
  }, [state.running, state.paused, state.hasVideo, sideBySide]);

  const statusRow = (
    <div className="absolute bottom-0 inset-x-0 flex min-w-0 items-center gap-3 bg-gradient-to-t from-black/60 p-3 font-mono text-xs text-zinc-400">
      <span className="shrink-0">
        {state.running ? (state.paused ? "paused" : "streaming") : "idle"}
      </span>
      <span className="shrink-0">chunk {state.currentChunk}</span>
      {state.currentPrompt && (
        <span className="min-w-0 flex-1 truncate">"{state.currentPrompt}"</span>
      )}
    </div>
  );

  if (sideBySide) {
    return (
      <section
        data-testid="stage-split"
        className="relative flex min-h-0 flex-col gap-3 max-lg:h-[40vh] lg:flex-1 lg:flex-row"
      >
        <div
          data-testid="pane-original"
          className="relative w-full min-h-0 flex-1 overflow-hidden rounded-lg border border-zinc-800 bg-black"
        >
          <video
            ref={videoRef}
            muted
            playsInline
            src={sourceUrl!}
            className="absolute inset-0 h-full w-full object-contain"
          />
          <span className="absolute top-2 left-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-xs text-zinc-400">
            original
          </span>
        </div>
        <div
          data-testid="pane-transformed"
          className="relative w-full min-h-0 flex-1 overflow-hidden rounded-lg border border-zinc-800 bg-black"
        >
          <SanaStreamingMainVideoView
            videoObjectFit="contain"
            className="absolute inset-0 h-full w-full"
          />
          <span className="absolute top-2 left-2 max-w-[80%] truncate rounded bg-black/60 px-1.5 py-0.5 font-mono text-xs text-zinc-400">
            {state.currentPrompt ?? "transformed"}
          </span>
        </div>
        {statusRow}
      </section>
    );
  }

  return (
    <section className="relative flex-1 min-h-[40vh] lg:min-h-0 overflow-hidden rounded-lg border border-zinc-800 bg-black">
      <SanaStreamingMainVideoView
        videoObjectFit="contain"
        className="absolute inset-0 h-full w-full"
      />
      {cleared && (
        <div
          data-testid="stage-cleared"
          className="absolute inset-0 bg-black"
        />
      )}
      {statusRow}
    </section>
  );
}
