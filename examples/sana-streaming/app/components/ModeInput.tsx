"use client";

import { useReactor } from "@reactor-team/js-sdk";
import { Panel, SegmentedToggle } from "./ui";
import type { SanaMode, SanaState } from "../lib/types";
import { LiveInput } from "./LiveInput";
import { FileInput } from "./FileInput";

// Mode toggle + the active input slot. Switching modes swaps the child
// component: live unmounts FileInput, file unmounts LiveInput (which
// unpublishes the camera and stops the webcam).
export function ModeInput({
  state,
  mode,
  onModeChange,
  onSource,
  resetNonce,
}: {
  state: SanaState;
  mode: SanaMode;
  onModeChange: (m: SanaMode) => void;
  onSource: (url: string) => void;
  resetNonce: number;
}) {
  const sendCommand = useReactor((s) => s.sendCommand);
  const status = useReactor((s) => s.status);

  const handleModeChange = (m: SanaMode) => {
    if (state.running) return; // toggle disabled while generating
    // Always update local UI state so the toggle feels instant. Only send
    // the wire command when connected, to avoid queuing a stale set_mode.
    onModeChange(m);
    if (status === "ready") {
      sendCommand("set_mode", { mode: m }).catch(console.error);
    }
  };

  return (
    <Panel label="Input">
      <div className={state.running ? "pointer-events-none opacity-40" : ""}>
        <SegmentedToggle
          aria-label="Input mode"
          value={mode}
          onChange={handleModeChange}
          options={[
            { value: "live", label: "Live" },
            { value: "file", label: "File" },
          ]}
        />
      </div>
      <div className="mt-3">
        {mode === "live" ? (
          <LiveInput running={state.running} />
        ) : (
          <FileInput
            hasVideo={state.hasVideo}
            running={state.running}
            onSource={onSource}
            resetNonce={resetNonce}
          />
        )}
      </div>
    </Panel>
  );
}
