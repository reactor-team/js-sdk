"use client";

import { useEffect, useState } from "react";
import {
  useLingbotV2,
  useLingbotV2State,
  useLingbotV2GenerationStarted,
  useLingbotV2GenerationComplete,
  useLingbotV2GenerationReset,
  type LingbotV2StateMessage,
} from "@reactor-models/lingbot-v2";

// Live-phase panel. Renders only while the model is generating.
//
// Lingbot 2 emits a `state` snapshot after every command and every
// completed chunk. We hold the latest snapshot in useState and read
// fields off it — single source of truth for the running scene, no
// event aggregation needed.
//
// The one thing the snapshot does NOT carry is the run length:
// `chunk_num` (total chunks in the current run) arrives once, on
// `generation_started`. We capture it so the chunk counter can read
// "chunk 12 / 48" instead of a bare index, and drop it when the run
// ends (`generation_complete` — the auto-restarted next run announces
// its own `generation_started`) or the session resets.
//
// When `snapshot.started === false` (never started, or just reset),
// this component renders null and the setup panel (ScenePicker +
// CustomStart) takes over. That's the phase switch.
export function NowPlaying() {
  const { status, pause, resume, reset } = useLingbotV2();
  const [snapshot, setSnapshot] = useState<LingbotV2StateMessage | null>(null);
  const [chunkNum, setChunkNum] = useState<number | null>(null);

  useLingbotV2State((msg) => setSnapshot(msg));
  useLingbotV2GenerationStarted((msg) => setChunkNum(msg.chunk_num));
  useLingbotV2GenerationComplete(() => setChunkNum(null));
  useLingbotV2GenerationReset(() => setChunkNum(null));

  // Clear on disconnect. The SDK doesn't emit a final `state` message
  // when the session ends, so without this we'd keep showing the
  // previous session's state across a reconnect.
  useEffect(() => {
    if (status !== "ready") {
      setSnapshot(null);
      setChunkNum(null);
    }
  }, [status]);

  if (status !== "ready" || !snapshot?.started) return null;

  const currentPrompt =
    typeof snapshot.current_prompt === "string" ? snapshot.current_prompt : "";
  const runState = snapshot.running
    ? "running"
    : snapshot.paused
      ? "paused"
      : "idle";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">
        Now playing · {runState}
      </span>

      <p className="mt-2 line-clamp-3 text-sm leading-snug text-zinc-200">
        {currentPrompt || "(no prompt yet)"}
      </p>

      <div className="mt-3 flex gap-3 text-[11px] text-zinc-500">
        <span>
          chunk {snapshot.current_chunk}
          {chunkNum !== null && ` / ${chunkNum}`}
        </span>
        <span>·</span>
        <span className="font-mono">{snapshot.current_action || "still"}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {snapshot.running ? (
          <button
            onClick={() => pause()}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
          >
            Pause
          </button>
        ) : (
          <button
            onClick={() => resume()}
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg hover:opacity-90"
          >
            Resume
          </button>
        )}
        <button
          onClick={() => reset()}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
