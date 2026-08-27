"use client";

import { useEffect, useState } from "react";
import {
  useViskoOrbisDistilled,
  useViskoOrbisDistilledState,
  type ViskoOrbisDistilledStateMessage,
} from "@reactor-models/visko-orbis-distilled";
import { TEXT_SCENES } from "../lib/prompts";

// Setup-phase panel. Lets the user pick a preset or write their own
// prompt and kicks off generation with `set_prompt` → `start`.
//
// Unlike Lingbot, Visko Orbis Distilled can start from TEXT ALONE
// (pure text-to-video). An image (set via <ImageStarter>) is optional
// conditioning — if present it anchors the first chunk; if absent the
// model invents the opening frame from the prompt.
//
// Renders null once generation has started — the surface switches to
// <NowPlaying> + <EvolveScene> (live steering) from there.
export function PromptComposer() {
  const { status, setPrompt, start } = useViskoOrbisDistilled();
  const [text, setText] = useState("");
  const [snapshot, setSnapshot] =
    useState<ViskoOrbisDistilledStateMessage | null>(null);

  useViskoOrbisDistilledState((msg) => setSnapshot(msg));

  useEffect(() => {
    if (status !== "ready") setSnapshot(null);
  }, [status]);

  // Hide once we're generating — but keep rendering (in disabled form)
  // when the user is just not connected, so the page doesn't go blank
  // after disconnect.
  if (status === "ready" && snapshot?.started) return null;

  const ready = status === "ready";
  const hasImage = snapshot?.has_image === true;

  async function send(prompt: string) {
    if (!ready || !prompt.trim()) return;
    await setPrompt({ prompt: prompt.trim() });
    await start();
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <label className="text-[10px] uppercase tracking-wider text-zinc-500">
        Try a prompt
      </label>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {TEXT_SCENES.map((scene) => (
          <button
            key={scene.id}
            disabled={!ready}
            onClick={() => send(scene.initial.text)}
            className="group rounded-md border border-zinc-800 bg-zinc-950 p-2 text-left transition-colors hover:border-brand disabled:opacity-40 disabled:hover:border-zinc-800"
            title={scene.initial.text}
          >
            <div className="text-[11px] font-medium text-zinc-200 group-hover:text-brand">
              {scene.label}
            </div>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-500">
              {scene.initial.text}
            </p>
          </button>
        ))}
      </div>

      <label className="mt-4 block text-[10px] uppercase tracking-wider text-zinc-500">
        Or write your own
      </label>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Describe one continuous scene — setting, light, motion, camera. A single unbroken take, not a montage."
        disabled={!ready}
        rows={3}
        className="mt-2 w-full resize-none rounded-md border border-zinc-800 bg-zinc-950 p-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand focus:outline-none disabled:opacity-40"
      />

      <button
        disabled={!ready || !text.trim()}
        onClick={async () => {
          await send(text);
          setText("");
        }}
        className="mt-2 w-full rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-40"
      >
        {hasImage ? "Start from your image" : "Start generating"}
      </button>

      <p className="mt-2 text-[11px] leading-snug text-zinc-600">
        Text-only works — attach an image below to anchor the opening frame.
        Once it&apos;s running you can morph the scene live with a new prompt.
      </p>
    </div>
  );
}
