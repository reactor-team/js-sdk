"use client";

import { useReactor } from "@reactor-team/js-sdk";
import { IconButton } from "./ui";

// Live-phase playback controls. Once generation has started, these replace the
// setup controls in the Input panel: pause/resume the running edit, or reset
// back to the setup state. `paused` decides between the pause and resume
// affordance; it comes from the model `state` snapshot, not local guesses.
export function Playback({ paused }: { paused: boolean }) {
  const { sendCommand, status } = useReactor((s) => ({
    sendCommand: s.sendCommand,
    status: s.status,
  }));
  const notReady = status !== "ready";

  return (
    <div className="flex items-center gap-2">
      {paused ? (
        <IconButton
          icon="play"
          label="Resume"
          disabled={notReady}
          onClick={() => sendCommand("resume", {}).catch(console.error)}
        />
      ) : (
        <IconButton
          icon="pause"
          label="Pause"
          disabled={notReady}
          onClick={() => sendCommand("pause", {}).catch(console.error)}
        />
      )}
      <IconButton
        icon="reset"
        label="Reset"
        tone="danger"
        disabled={notReady}
        onClick={() => sendCommand("reset", {}).catch(console.error)}
      />
      <span className="ml-1 text-xs text-zinc-500">
        {paused ? "Paused" : "Editing — reset to change the input"}
      </span>
    </div>
  );
}
