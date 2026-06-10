"use client";

import { useReactor } from "@reactor-team/js-sdk";
import { useEffect, useState } from "react";
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
  const sendCommand = useReactor((s) => s.sendCommand);
  const status = useReactor((s) => s.status);
  const [seed, setSeed] = useState(modelSeed);

  // Keep the local seed in sync when the model reports a new value
  // (e.g. after a reset or an external set_seed).
  useEffect(() => setSeed(modelSeed), [modelSeed]);

  const notReady = status !== "ready";
  const send = (cmd: string, data: Record<string, unknown> = {}) =>
    sendCommand(cmd, data).catch(console.error);

  return (
    <Panel label="Transport">
      <div className="flex items-center gap-2">
        {started &&
          (paused ? (
            <IconButton
              icon="play"
              label="Resume"
              disabled={notReady}
              onClick={() => send("resume")}
            />
          ) : (
            <IconButton
              icon="pause"
              label="Pause"
              disabled={notReady}
              onClick={() => send("pause")}
            />
          ))}
        <IconButton
          icon="reset"
          label="Reset"
          tone="danger"
          disabled={notReady}
          onClick={() => send("reset")}
        />
        <label className="ml-auto flex items-center gap-1.5">
          <span className={EYEBROW}>Seed</span>
          <input
            type="number"
            min={0}
            value={seed}
            disabled={notReady}
            onChange={(e) => setSeed(+e.target.value)}
            onBlur={() => send("set_seed", { seed })}
            className={cn(
              "w-20 rounded-md border border-zinc-700 bg-zinc-900/40 px-2 py-1 font-mono text-xs text-zinc-200 outline-none transition focus:border-brand/60 disabled:opacity-40",
            )}
          />
        </label>
      </div>
    </Panel>
  );
}
