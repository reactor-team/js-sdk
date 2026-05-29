"use client";

import { useState } from "react";
import { useLongliveV2, useLongliveV2State } from "@reactor-models/longlive-v2";
import type { LongliveV2StateMessage } from "@reactor-models/longlive-v2";
import { useStoryboard, type BeatKind } from "../lib/storyboard-store";
import { STORYBOARDS } from "../lib/prompts";

// SETUP-PHASE PANEL. Compose a storyboard before pressing start: an opening
// shot, then shots (soft) and cuts (hard) scheduled at chunk positions.
// "Start storyboard" compiles the plan into the wire sequence:
//   set_shot(opener) → schedule_shot / schedule_scene_cut(...) → start
//
// Hidden once generation is running — directing live moves to <Director>.
export function Storyboard() {
  const { status, setShot, scheduleShot, scheduleSceneCut, start } = useLongliveV2();
  const { beats, setOpening, addBeat, remove, load, clear } = useStoryboard();
  const [snapshot, setSnapshot] = useState<LongliveV2StateMessage | null>(null);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<BeatKind>("shot");
  const [atChunk, setAtChunk] = useState(20);
  const [starting, setStarting] = useState(false);

  useLongliveV2State((msg) => setSnapshot(msg));

  // Live phase belongs to <Director> / <NowPlaying>.
  if (status === "ready" && snapshot?.started) return null;

  const opener = beats.find((b) => b.atChunk === 0);
  const ready = status === "ready";

  function add() {
    const prompt = text.trim();
    if (!prompt) return;
    if (!opener) setOpening(prompt);
    else addBeat(kind, prompt, atChunk);
    setText("");
  }

  async function startStoryboard() {
    if (!ready || !opener || starting) return;
    setStarting(true);
    try {
      await setShot({ prompt: opener.prompt });
      for (const b of beats.filter((b) => b.atChunk !== 0)) {
        if (b.kind === "cut") {
          await scheduleSceneCut({ prompt: b.prompt, at_session_chunk: b.atChunk });
        } else {
          await scheduleShot({ prompt: b.prompt, at_session_chunk: b.atChunk });
        }
      }
      await start();
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400">Storyboard</span>
        {beats.length > 0 && (
          <button onClick={clear} className="text-[10px] text-zinc-500 hover:text-zinc-300">
            clear
          </button>
        )}
      </div>

      {/* Presets */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {STORYBOARDS.map((s) => (
          <button
            key={s.id}
            title={s.description}
            onClick={() => load(s.beats.map((b) => ({ ...b })))}
            className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Composer */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={opener ? "Describe a shot or the next scene…" : "Describe the opening shot…"}
        className="min-h-[64px] w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
      />

      {opener && (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <div className="flex overflow-hidden rounded-md border border-zinc-700">
            <button
              onClick={() => setKind("shot")}
              className={kind === "shot" ? "bg-brand px-2 py-1 text-brand-fg" : "px-2 py-1 text-zinc-400"}
            >
              Shot
            </button>
            <button
              onClick={() => setKind("cut")}
              className={kind === "cut" ? "bg-brand px-2 py-1 text-brand-fg" : "px-2 py-1 text-zinc-400"}
            >
              Cut
            </button>
          </div>
          <span className="text-zinc-500">@ chunk</span>
          <input
            type="number"
            min={1}
            value={atChunk}
            onChange={(e) => setAtChunk(Math.max(1, Number(e.target.value)))}
            className="w-14 rounded border border-zinc-700 bg-zinc-950 px-1 py-1 text-center text-zinc-100"
          />
        </div>
      )}

      <button
        onClick={add}
        disabled={!text.trim()}
        className="mt-2 w-full rounded-md border border-zinc-700 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
      >
        {opener ? `+ Add ${kind}` : "+ Set opening shot"}
      </button>

      {/* Beat list */}
      {beats.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {beats.map((b) => (
            <li key={b.id} className="flex items-center gap-2 rounded bg-zinc-950/60 px-2 py-1 text-xs">
              <span className={b.kind === "cut" ? "font-bold text-amber-400" : "font-bold text-sky-400"}>
                {b.atChunk === 0 ? "open" : `${b.kind === "cut" ? "✂" : "▸"} @${b.atChunk}`}
              </span>
              <span className="flex-1 truncate text-zinc-300">{b.prompt}</span>
              <button onClick={() => remove(b.id)} className="text-zinc-500 hover:text-red-400">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={startStoryboard}
        disabled={!ready || !opener || starting}
        className="mt-3 w-full rounded-md bg-brand py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-40"
      >
        {starting ? "Starting…" : "▶ Start storyboard"}
      </button>
      {!ready && <p className="mt-1 text-[11px] text-zinc-500">Connect first to start.</p>}
    </div>
  );
}
