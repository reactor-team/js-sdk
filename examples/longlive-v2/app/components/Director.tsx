"use client";

import { useState } from "react";
import { useLongliveV2, useLongliveV2State } from "@reactor-models/longlive-v2";
import type { LongliveV2StateMessage } from "@reactor-models/longlive-v2";
import { type BeatKind } from "../lib/storyboard-store";

// LIVE-PHASE PANEL. Direct the running session: fire a soft shot or hard cut
// at the next chunk boundary ("now"), or schedule one ahead at a chunk index.
// Hidden until generation has started — composing the plan is <Storyboard>.
export function Director() {
  const { status, setShot, sceneCut, scheduleShot, scheduleSceneCut } = useLongliveV2();
  const [snapshot, setSnapshot] = useState<LongliveV2StateMessage | null>(null);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<BeatKind>("shot");
  const [when, setWhen] = useState<"now" | "at">("now");
  const [atChunk, setAtChunk] = useState(0);

  useLongliveV2State((msg) => setSnapshot(msg));

  if (status !== "ready" || !snapshot?.started) return null;

  const sessionChunk = snapshot.session_chunk ?? 0;

  async function fire() {
    const prompt = text.trim();
    if (!prompt) return;
    if (when === "now") {
      if (kind === "cut") await sceneCut({ prompt });
      else await setShot({ prompt });
    } else {
      const target = Math.max(sessionChunk + 1, atChunk);
      if (kind === "cut") await scheduleSceneCut({ prompt, at_session_chunk: target });
      else await scheduleShot({ prompt, at_session_chunk: target });
    }
    setText("");
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <span className="text-[10px] uppercase tracking-wider text-zinc-400">Direct live</span>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={kind === "cut" ? "Describe the scene to cut to…" : "Describe the next shot…"}
        className="mt-2 min-h-[56px] w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
      />

      <div className="mt-2 flex items-center gap-1.5 text-xs">
        <div className="flex overflow-hidden rounded-md border border-zinc-700">
          <button onClick={() => setKind("shot")} className={kind === "shot" ? "bg-brand px-2 py-1 text-brand-fg" : "px-2 py-1 text-zinc-400"}>
            Shot
          </button>
          <button onClick={() => setKind("cut")} className={kind === "cut" ? "bg-brand px-2 py-1 text-brand-fg" : "px-2 py-1 text-zinc-400"}>
            Cut
          </button>
        </div>
        <div className="flex overflow-hidden rounded-md border border-zinc-700">
          <button onClick={() => setWhen("now")} className={when === "now" ? "bg-zinc-700 px-2 py-1 text-zinc-100" : "px-2 py-1 text-zinc-400"}>
            Now
          </button>
          <button onClick={() => setWhen("at")} className={when === "at" ? "bg-zinc-700 px-2 py-1 text-zinc-100" : "px-2 py-1 text-zinc-400"}>
            At
          </button>
        </div>
        {when === "at" && (
          <input
            type="number"
            min={sessionChunk + 1}
            value={atChunk}
            onChange={(e) => setAtChunk(Number(e.target.value))}
            className="w-14 rounded border border-zinc-700 bg-zinc-950 px-1 py-1 text-center text-zinc-100"
          />
        )}
      </div>

      <button
        onClick={fire}
        disabled={!text.trim()}
        className="mt-2 w-full rounded-md bg-brand py-1.5 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-40"
      >
        {when === "now" ? (kind === "cut" ? "✂ Cut now" : "▸ Shot now") : `Schedule ${kind} @ ${atChunk}`}
      </button>
    </div>
  );
}
