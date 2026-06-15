"use client";

import { useSanaStreaming } from "@reactor-models/sana-streaming";
import { Panel, IconButton, cn, EYEBROW } from "./ui";

// Pause/resume/reset + seed. Pause/resume only make sense once generation
// has started; reset and seed are useful any time (set a seed before the
// first start, for instance), so the panel renders whenever connected.
export function Transport({
  paused,
  started,
  modelSeed,
}: {
  paused: boolean;
  started: boolean;
  modelSeed: number;
}) {
  const { pause, resume, reset, setSeed, status } = useSanaStreaming();

  const notReady = status !== "ready";

  return (
    <Panel label="Transport">
      <div className="flex items-center gap-2">
        {started &&
          (paused ? (
            <IconButton
              icon="play"
              label="Resume"
              disabled={notReady}
              onClick={() => resume().catch(console.error)}
            />
          ) : (
            <IconButton
              icon="pause"
              label="Pause"
              disabled={notReady}
              onClick={() => pause().catch(console.error)}
            />
          ))}
        <IconButton
          icon="reset"
          label="Reset"
          tone="danger"
          disabled={notReady}
          onClick={() => reset().catch(console.error)}
        />
        <label className="ml-auto flex items-center gap-1.5">
          <span className={EYEBROW}>Seed</span>
          {/* Uncontrolled, keyed to the model-reported seed: a reset or an
              external set_seed remounts the input with the fresh value. */}
          <input
            key={modelSeed}
            type="number"
            min={0}
            defaultValue={modelSeed}
            disabled={notReady}
            onBlur={(e) =>
              setSeed({ seed: +e.target.value }).catch(console.error)
            }
            className={cn(
              "w-20 rounded-md border border-zinc-700 bg-zinc-900/40 px-2 py-1 font-mono text-xs text-zinc-200 outline-none transition focus:border-brand/60 disabled:opacity-40",
            )}
          />
        </label>
      </div>
    </Panel>
  );
}
