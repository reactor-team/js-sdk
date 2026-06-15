"use client";

import { useSanaStreaming } from "@reactor-models/sana-streaming";
import { Panel, SegmentedToggle } from "./ui";
import type { SanaMode } from "../lib/types";
import { LiveInput } from "./LiveInput";
import { FileInput } from "./FileInput";
import { Playback } from "./Playback";
import { SeedField } from "./SeedField";

// The Input panel is phase-aware, driven by the model's `started` flag:
//
//   - Setup (!started): mode toggle + the active input slot (webcam or file
//     picker) with its Start button, plus the seed setting.
//   - Live (started): the same input slot stays mounted — so live mode keeps
//     publishing the camera — but the Start control is replaced by Playback
//     (pause / resume / reset), and the mode toggle + seed are hidden.
//
// Switching modes swaps the child component: live unmounts FileInput, file
// unmounts LiveInput (which unpublishes the camera and stops the webcam).
export function ModeInput({
  hasVideo,
  started,
  paused,
  mode,
  modelSeed,
  onModeChange,
  onSource,
  resetNonce,
}: {
  hasVideo: boolean;
  started: boolean;
  paused: boolean;
  mode: SanaMode;
  modelSeed: number;
  onModeChange: (m: SanaMode) => void;
  onSource: (url: string) => void;
  resetNonce: number;
}) {
  const { setMode, status } = useSanaStreaming();

  const handleModeChange = (m: SanaMode) => {
    if (started) return; // mode is fixed once a run has started — reset to switch
    // Always update local UI state so the toggle feels instant. Only send
    // the wire command when connected, to avoid queuing a stale set_mode.
    onModeChange(m);
    if (status === "ready") {
      setMode({ mode: m }).catch(console.error);
    }
  };

  return (
    <Panel label="Input">
      {!started && (
        <SegmentedToggle
          aria-label="Input mode"
          value={mode}
          onChange={handleModeChange}
          options={[
            { value: "live", label: "Live" },
            { value: "file", label: "File" },
          ]}
        />
      )}

      <div className={started ? "" : "mt-3"}>
        {mode === "live" ? (
          <LiveInput started={started} />
        ) : (
          // Keyed on resetNonce: a model generation_reset remounts FileInput,
          // clearing its local file selection in step with the model.
          <FileInput
            key={resetNonce}
            hasVideo={hasVideo}
            started={started}
            onSource={onSource}
          />
        )}
      </div>

      {started ? (
        <div className="mt-3">
          <Playback paused={paused} />
        </div>
      ) : (
        <div className="mt-3">
          <SeedField modelSeed={modelSeed} />
        </div>
      )}
    </Panel>
  );
}
