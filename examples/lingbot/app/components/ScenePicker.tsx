"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  useLingbot,
  useLingbotState,
  useLingbotImageAccepted,
  type LingbotStateMessage,
} from "@reactor-models/lingbot";
import { SCENES, type Scene } from "../lib/scenes";

// Setup-phase panel. Lets the user pick a curated scene and kicks
// off generation in one click.
//
// Lingbot requires BOTH a prompt AND a reference image before
// `start` is valid (the model is image-to-video — the reference
// image anchors the scene). So one curated scene is one image plus
// one paragraph prompt, baked together.
//
// The chain is:
//   1. fetch + uploadFile(blob)             → returns a FileRef
//   2. setImage({ image: ref })             → image_accepted (after decode)
//   3. setPrompt({ prompt: scene.prompt })  → prompt_accepted
//   4. start()                              → generation begins
//
// We wait for `image_accepted` between (2) and (3). Without the
// wait, the model can receive `start` before it has finished
// decoding the image, causing the first chunk to be generated from
// the prompt alone — visible as a flicker on the first frame.
//
// We park the resolver BEFORE calling setImage so we can't miss the
// ack. Registering the resolver after would race the model's reply.
export function ScenePicker() {
  const { status, uploadFile, setImage, setPrompt, start } = useLingbot();
  const [snapshot, setSnapshot] = useState<LingbotStateMessage | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const imageReadyRef = useRef<(() => void) | null>(null);

  useLingbotState((msg) => setSnapshot(msg));

  useEffect(() => {
    if (status !== "ready") setSnapshot(null);
  }, [status]);

  useLingbotImageAccepted(() => {
    if (imageReadyRef.current) {
      imageReadyRef.current();
      imageReadyRef.current = null;
    }
  });

  // Hide once we're generating — but keep rendering (in disabled form)
  // when the user is just not connected, so the page doesn't go blank
  // after disconnect.
  if (status === "ready" && snapshot?.started) return null;

  const ready = status === "ready";

  async function startScene(scene: Scene) {
    setBusy(scene.id);
    try {
      const blob = await fetch(scene.imageUrl).then((r) => r.blob());
      const ref = await uploadFile(blob, { name: `${scene.id}.jpg` });

      const imageReady = new Promise<void>((resolve) => {
        imageReadyRef.current = resolve;
      });

      await setImage({ image: ref });
      await imageReady;
      await setPrompt({ prompt: scene.prompt });
      await start();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <label className="text-[10px] uppercase tracking-wider text-zinc-500">
        Pick a scene
      </label>

      <p className="mt-1 text-[11px] leading-snug text-zinc-500">
        Each scene loads a reference image and an initial prompt, then starts
        generating. Drive the result with WASD once it&apos;s live.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {SCENES.map((scene) => (
          <button
            key={scene.id}
            disabled={!ready || busy !== null}
            onClick={() => startScene(scene)}
            className="group relative aspect-video overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 text-left hover:border-brand disabled:opacity-40 disabled:hover:border-zinc-800"
            title={scene.description}
          >
            <Image
              src={scene.imageUrl}
              alt={scene.label}
              fill
              sizes="160px"
              className="object-cover transition-opacity group-hover:opacity-80"
            />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 py-1.5 text-[11px] font-medium text-zinc-100">
              {scene.label}
            </span>
            {busy === scene.id && (
              <span className="absolute inset-0 grid place-items-center bg-black/60 text-[10px] uppercase tracking-wider text-brand">
                Loading…
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
