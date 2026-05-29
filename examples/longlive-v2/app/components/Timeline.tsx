"use client";

import { useState } from "react";
import { useLongliveV2State } from "@reactor-models/longlive-v2";
import type { LongliveV2StateMessage } from "@reactor-models/longlive-v2";
import {
  useStoryboard,
  sceneStarts,
  SCENE_BUDGET,
  CHUNK_SECONDS,
} from "../lib/storyboard-store";

// The director's timeline. A read-only visual of the storyboard on a chunk
// axis: scene dividers at each cut, beats as ticks, and — once running — a
// playhead at the model's cumulative `session_chunk`. The webapp playground
// makes this draggable; here it stays simple to keep the example readable.
export function Timeline() {
  const { beats } = useStoryboard();
  const [snapshot, setSnapshot] = useState<LongliveV2StateMessage | null>(null);
  useLongliveV2State((msg) => setSnapshot(msg));

  if (beats.length === 0) return null;

  const sessionChunk = snapshot?.session_chunk ?? 0;
  const running = !!snapshot?.running;
  const lastChunk = beats[beats.length - 1]?.atChunk ?? 0;
  const totalChunks = Math.max(SCENE_BUDGET, lastChunk + 8, sessionChunk + 4);
  const pct = (c: number) => `${Math.min(100, (c / totalChunks) * 100)}%`;
  const starts = sceneStarts(beats);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-400">
        <span>Timeline</span>
        <span className="normal-case text-zinc-500">
          {totalChunks} chunks · ~{Math.round(totalChunks * CHUNK_SECONDS)}s
          {running && ` · playhead ${sessionChunk}`}
        </span>
      </div>

      <div className="relative h-12 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950">
        {/* scene dividers */}
        {starts.map((c, i) =>
          i === 0 ? null : (
            <div key={`s-${c}`} className="absolute inset-y-0 w-px bg-amber-500/60" style={{ left: pct(c) }} />
          ),
        )}

        {/* beats */}
        {beats.map((b) => (
          <div
            key={b.id}
            title={`${b.kind === "cut" ? "Cut" : "Shot"} @ chunk ${b.atChunk}: ${b.prompt}`}
            className="absolute bottom-1 -translate-x-1/2"
            style={{ left: pct(b.atChunk) }}
          >
            <div
              className={`h-6 w-6 truncate rounded text-[8px] leading-6 text-center font-bold text-black ${
                b.kind === "cut" ? "bg-amber-400" : "bg-sky-400"
              }`}
            >
              {b.atChunk === 0 ? "○" : b.kind === "cut" ? "✂" : "▸"}
            </div>
          </div>
        ))}

        {/* playhead */}
        {running && (
          <div className="absolute inset-y-0 z-10 w-0.5 bg-active" style={{ left: pct(sessionChunk) }}>
            <div className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-active" />
          </div>
        )}
      </div>

      <p className="mt-1.5 text-[10px] text-zinc-500">
        <span className="text-sky-400">▸ shot</span> keeps the scene ·{" "}
        <span className="text-amber-400">✂ cut</span> starts a new one (fresh {SCENE_BUDGET}-chunk
        budget)
      </p>
    </div>
  );
}
