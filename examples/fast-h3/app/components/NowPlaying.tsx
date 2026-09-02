"use client";

import { useEffect, useState } from "react";
import {
  useFastH3,
  useFastH3ClipStarted,
  useFastH3StateUpdate,
  type FastH3StateUpdateMessage,
} from "@reactor-models/fast-h3";
import { parseTag } from "../lib/tag";

// Live-phase panel: what's on air (from the metadata echo on
// `clip_started`), the autoplay toggle, and Skip. With autoplay on — this
// example's default once an episode is queued — the model starts the
// playout front on its own, and a clip that continues the one just
// finished hands over with no cut.
export function NowPlaying() {
  const { status, stop, setAutoplay } = useFastH3();
  const [snapshot, setSnapshot] = useState<FastH3StateUpdateMessage | null>(
    null,
  );
  const [label, setLabel] = useState<string | null>(null);
  useFastH3StateUpdate((msg) => setSnapshot(msg));
  useFastH3ClipStarted((msg) => {
    const tag = parseTag(msg.clip.metadata);
    setLabel(
      tag
        ? `${tag.title} — scene ${tag.scene}/${tag.scenes}`
        : msg.clip.prompt.slice(0, 60),
    );
  });

  // Mandatory: without this, the panel shows the previous session's state
  // after a disconnect (the SDK sends no final snapshot).
  useEffect(() => {
    if (status !== "ready") {
      setSnapshot(null);
      setLabel(null);
    }
  }, [status]);

  if (status !== "ready" || !snapshot) return null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {snapshot.playing ? "Now playing" : "On air: idle"}
        </h2>
        <label className="flex items-center gap-1.5 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={snapshot.autoplay}
            onChange={(e) => void setAutoplay({ enabled: e.target.checked })}
          />
          autoplay
        </label>
      </div>
      {snapshot.playing && label && (
        <p className="mt-1.5 line-clamp-2 text-sm text-zinc-200">{label}</p>
      )}
      {!snapshot.playing && (
        <p className="mt-1.5 text-xs text-zinc-500">
          The stream holds on black between clips. Queue an episode below
          {snapshot.autoplay ? "" : " and turn autoplay on"} to roll.
        </p>
      )}
      {snapshot.playing && (
        <button
          onClick={() => void stop()}
          className="mt-2 rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300"
        >
          {snapshot.autoplay ? "Skip" : "Stop"}
        </button>
      )}
    </div>
  );
}
