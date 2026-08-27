"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  useViskoOrbisDistilled,
  useViskoOrbisDistilledState,
  useViskoOrbisDistilledImageAccepted,
  type ViskoOrbisDistilledStateMessage,
} from "@reactor-models/visko-orbis-distilled";
import { IMAGE_SCENES, type Scene } from "../lib/prompts";

// Image-to-video inputs. Visko Orbis Distilled has NO atomic
// `setConditioning` command (that's a Helios-0.9+ addition), so the
// image+prompt+start chain is the explicit, ordered one:
//
//   uploadFile → setImage → (wait for image_accepted) → setPrompt → start
//
// The wait matters: `image_accepted` fires only after the model has
// decoded the upload. If we send `start` before it, the first chunk can
// render before the image conditioning is applied and visibly flicker
// into the anchored composition a beat later. We park the resolver
// BEFORE calling setImage so we can't miss the ack.
//
// TWO FLOWS live behind this panel:
//
//   1. Curated scene (image + prompt known together): full chain in one
//      click — the example cards.
//   2. Custom upload: we ONLY stamp the image. The user types a prompt
//      in <PromptComposer> and clicks Start — at that point its
//      `setPrompt + start` picks up the image set here. (The model's
//      single-consumer command queue means there's no race: the upload
//      is processed long before the human finishes typing.)
//
// IMPORTANT measured caveat surfaced in the UI below: the model resizes
// the reference image to its generate size (832x480) with NO crop, so a
// non-16:9 starting image squashes. The curated images are 16:9.
export function ImageStarter() {
  const { status, uploadFile, setImage, setPrompt, start } =
    useViskoOrbisDistilled();
  const [snapshot, setSnapshot] =
    useState<ViskoOrbisDistilledStateMessage | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const imageReadyRef = useRef<(() => void) | null>(null);

  useViskoOrbisDistilledState((msg) => setSnapshot(msg));

  useEffect(() => {
    if (status !== "ready") setSnapshot(null);
  }, [status]);

  useViskoOrbisDistilledImageAccepted(() => {
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

  // Curated scene: image + prompt known at the same time, so we run the
  // full chain in one click. We await `image_accepted` between setImage
  // and setPrompt+start so the first chunk is born anchored.
  async function startFromExample(scene: Scene & { imageUrl: string }) {
    setBusy(scene.label);
    try {
      const blob = await fetch(scene.imageUrl).then((r) => r.blob());
      const ref = await uploadFile(blob, { name: `${scene.id}.jpg` });

      const imageReady = new Promise<void>((resolve) => {
        imageReadyRef.current = resolve;
      });

      await setImage({ image: ref });
      await imageReady;
      await setPrompt({ prompt: scene.initial.text });
      await start();
    } finally {
      setBusy(null);
    }
  }

  // Custom upload: only change the image. PromptComposer fires
  // setPrompt + start when the user is ready.
  async function uploadCustomImage(file: File) {
    setBusy(file.name);
    try {
      const ref = await uploadFile(file);
      await setImage({ image: ref });
    } finally {
      setBusy(null);
    }
  }

  const customImageSet = snapshot?.has_image === true;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <label className="text-[10px] uppercase tracking-wider text-zinc-500">
        Or start from an image
      </label>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {IMAGE_SCENES.map((scene) => (
          <button
            key={scene.id}
            disabled={!ready || busy !== null}
            onClick={() => startFromExample(scene)}
            className="group relative aspect-video overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 text-left hover:border-brand disabled:opacity-40 disabled:hover:border-zinc-800"
            title={scene.initial.text}
          >
            <Image
              src={scene.imageUrl}
              alt={scene.label}
              fill
              sizes="160px"
              className="object-cover transition-opacity group-hover:opacity-80"
            />
            <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5 text-[11px] font-medium text-zinc-100">
              {scene.label}
            </span>
            {busy === scene.label && (
              <span className="absolute inset-0 grid place-items-center bg-black/60 text-[10px] uppercase tracking-wider text-brand">
                Loading…
              </span>
            )}
          </button>
        ))}
      </div>

      <label
        className={`mt-2 flex cursor-pointer items-center justify-center rounded-md border border-dashed border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-400 hover:border-brand hover:text-brand ${
          !ready || busy !== null ? "pointer-events-none opacity-40" : ""
        }`}
      >
        {busy
          ? `Uploading ${busy}…`
          : customImageSet
            ? "Replace your image"
            : "Upload your own image"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={!ready || busy !== null}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadCustomImage(file);
            e.target.value = "";
          }}
        />
      </label>

      <p className="mt-2 text-[11px] leading-snug text-zinc-600">
        The image is resized to 832×480 with no crop — use a 16:9 frame or it
        will squash.
      </p>

      {customImageSet && !busy && (
        <p className="mt-1 text-[11px] text-zinc-500">
          Image attached. Add a prompt above and click Start.
        </p>
      )}
    </div>
  );
}
