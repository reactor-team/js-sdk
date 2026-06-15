"use client";

import { useSanaStreaming } from "@reactor-models/sana-streaming";
import { Panel, SegmentedToggle } from "./ui";
import type { SanaMode } from "../lib/types";
import { LiveInput } from "./LiveInput";
import { FileInput } from "./FileInput";

// Mode toggle + the active input slot. Switching modes swaps the child
// component: live unmounts FileInput, file unmounts LiveInput (which
// unpublishes the camera and stops the webcam).
export function ModeInput({
  running,
  hasVideo,
  mode,
  onModeChange,
  onSource,
  resetNonce,
}: {
  running: boolean;
  hasVideo: boolean;
  mode: SanaMode;
  onModeChange: (m: SanaMode) => void;
  onSource: (url: string) => void;
  resetNonce: number;
}) {
  const { setMode, status } = useSanaStreaming();

  const handleModeChange = (m: SanaMode) => {
    if (running) return; // toggle disabled while generating
    // Always update local UI state so the toggle feels instant. Only send
    // the wire command when connected, to avoid queuing a stale set_mode.
    onModeChange(m);
    if (status === "ready") {
      setMode({ mode: m }).catch(console.error);
    }
  };

  return (
    <Panel label="Input">
      <div className={running ? "pointer-events-none opacity-40" : ""}>
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
          <LiveInput running={running} />
        ) : (
          // Keyed on resetNonce: a model generation_reset remounts FileInput,
          // clearing its local file selection in step with the model.
          <FileInput
            key={resetNonce}
            hasVideo={hasVideo}
            running={running}
            onSource={onSource}
          />
        )}
      </div>
    </Panel>
  );
}
