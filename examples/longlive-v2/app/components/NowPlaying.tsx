"use client";

import { useEffect, useState } from "react";
import { useLongliveV2, useLongliveV2State } from "@reactor-models/longlive-v2";
import type { LongliveV2StateMessage } from "@reactor-models/longlive-v2";
import { useStoryboard, SCENE_BUDGET } from "../lib/storyboard-store";

// LIVE-PHASE PANEL. Shows the active prompt, the per-scene chunk budget
// (current_chunk / 48) and the cumulative session_chunk, plus pause / resume /
// reset transport. Reset clears the model AND the local storyboard so the
// composer starts fresh.
export function NowPlaying() {
  const { status, pause, resume, reset } = useLongliveV2();
  const clearStoryboard = useStoryboard((s) => s.clear);
  const [snapshot, setSnapshot] = useState<LongliveV2StateMessage | null>(null);

  useLongliveV2State((msg) => setSnapshot(msg));

  // Clear stale snapshot on disconnect so a reconnect doesn't show old data.
  useEffect(() => {
    if (status === "disconnected") setSnapshot(null);
  }, [status]);

  if (status !== "ready" || !snapshot?.started) return null;

  const sceneChunk = snapshot.current_chunk ?? 0;
  const remaining = Math.max(0, SCENE_BUDGET - sceneChunk);

  async function onReset() {
    await reset();
    clearStoryboard();
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <span className="text-[10px] uppercase tracking-wider text-zinc-400">Now playing</span>
      <p className="mt-1 line-clamp-3 text-sm text-zinc-200">
        {typeof snapshot.current_prompt === "string" ? snapshot.current_prompt : "—"}
      </p>

      <div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-400">
        <span>scene chunk {sceneChunk}/{SCENE_BUDGET}</span>
        <span>session {snapshot.session_chunk ?? 0}</span>
        {remaining <= 8 && <span className="font-semibold text-amber-400">cut to continue</span>}
      </div>

      <div className="mt-3 flex gap-1.5">
        {snapshot.paused ? (
          <button onClick={() => resume()} className="flex-1 rounded-md border border-zinc-700 py-1 text-xs text-zinc-200 hover:bg-zinc-800">
            Resume
          </button>
        ) : (
          <button onClick={() => pause()} className="flex-1 rounded-md border border-zinc-700 py-1 text-xs text-zinc-200 hover:bg-zinc-800">
            Pause
          </button>
        )}
        <button onClick={onReset} className="flex-1 rounded-md border border-red-900/60 py-1 text-xs text-red-300 hover:bg-red-950/40">
          Reset
        </button>
      </div>
    </div>
  );
}
