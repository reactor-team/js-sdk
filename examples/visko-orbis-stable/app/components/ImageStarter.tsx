"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  useViskoOrbisStable,
  useViskoState,
  sendSetImage,
  sendSetPrompt,
  sendStart,
  type StateMessage,
} from "../lib/visko";
import { IMAGE_SCENES, type Scene } from "../lib/prompts";

// Image-to-video inputs. Visko Orbis Stable has NO atomic
// `setConditioning` command (that's a Helios-0.9+ addition), so the
// image+prompt+start chain is the explicit, ordered one:
//
//   uploadFile → setImage (await = decoded) → setPrompt → start
//
// On js-sdk 3.0.0 the await IS the gate: `image_accepted` no longer
// broadcasts to every connection — it's the correlated reply the awaited
// `set_image` call resolves with, per the schema's `200 ImageAccepted`.
// An awaited sendCommand resolving means the handler (which fails on an
// undecodable file) finished, so the first chunk is born anchored with no
// message-listener parking and no settle sleep.
//
// TWO FLOWS live behind this panel:
//
//   1. Curated scene (image + prompt known together): full chain in one
//      click — the example cards.
//   2. Custom upload: we ONLY stamp the image. The user types a prompt
//      in <PromptComposer> and clicks Start — at that point its
//      `setPrompt + start` picks up the image set here.
//
// IMPORTANT measured caveat surfaced in the UI below: the model resizes
// the reference image to its generate size (832x480) with NO crop, so a
// non-16:9 starting image squashes. The curated images are 16:9.
export function ImageStarter() {
  const s = useViskoOrbisStable();
  const { status, uploadFile } = s;
  const [snapshot, setSnapshot] = useState<StateMessage | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useViskoState((msg: StateMessage) => setSnapshot(msg));

  useEffect(() => {
    if (status !== "ready") setSnapshot(null);
  }, [status]);

  // Hide once we're generating — but keep rendering (in disabled form)
  // when the user is just not connected, so the page doesn't go blank
  // after disconnect.
  if (status === "ready" && snapshot?.started) return null;

  const ready = status === "ready";

  // Curated scene: image + prompt known at the same time, so we run the
  // full chain in one click. The awaited setImage IS the "decoded" gate —
  // schema 200 = ImageAccepted, so resolution here implies acceptance.
  async function startFromExample(scene: Scene & { imageUrl: string }) {
    setBusy(scene.label);
    try {
      const blob = await fetch(scene.imageUrl).then((r) => r.blob());
      const ref = await uploadFile(blob, { name: `${scene.id}.jpg` });

      await sendSetImage(s, ref);
      await sendSetPrompt(s, scene.initial.text);
      await sendStart(s);
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
      await sendSetImage(s, ref);
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
