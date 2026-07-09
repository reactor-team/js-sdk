"use client";

import { useReactor } from "@reactor-team/js-sdk";
import { Button, Panel, SegmentedToggle } from "./ui";
import type { XmaxMode } from "../lib/types";
import { Playback } from "./Playback";
import { VideoPicker } from "./VideoPicker";
import { WebcamSource } from "./WebcamSource";

// The Input panel. Phase-aware on the model's `started` flag:
//
//   - Setup (!started): pick the source (webcam / video), choose a clip in
//     video mode, and Start.
//   - Live (started): the Start control is replaced by Playback.
//
// In webcam mode the self-view lives here and stays mounted across the start
// transition, so the camera keeps streaming `camera` while generation runs. In
// video mode the clip preview lives in the stage instead; this panel only picks
// it. Both sources stream into the same `camera` track, so Start just sends
// `start` — the model edits whatever is arriving on `camera`.
export function ModeInput({
  started,
  paused,
  mode,
  hasVideoUrl,
  onModeChange,
  onSelectVideo,
  onTrack,
}: {
  started: boolean;
  paused: boolean;
  mode: XmaxMode;
  hasVideoUrl: boolean;
  onModeChange: (m: XmaxMode) => void;
  onSelectVideo: (url: string, name: string) => void;
  onTrack: (track: MediaStreamTrack | null) => void;
}) {
  const { sendCommand, status } = useReactor((s) => ({
    sendCommand: s.sendCommand,
    status: s.status,
  }));
  const ready = status === "ready";

  const handleModeChange = (m: XmaxMode) => {
    if (started) return; // source is fixed once a run has started — reset to switch
    onModeChange(m);
  };

  const onStart = () => {
    sendCommand("start", {}).catch(console.error);
  };

  return (
    <Panel label="Input">
      {!started && (
        <SegmentedToggle
          aria-label="Input source"
          value={mode}
          onChange={handleModeChange}
          options={[
            { value: "webcam", label: "Webcam" },
            { value: "video", label: "Video" },
          ]}
        />
      )}

      {mode === "webcam" ? (
        <div className={started ? "" : "mt-3"}>
          <WebcamSource onTrack={onTrack} />
        </div>
      ) : (
        !started && (
          <div className="mt-3">
            <VideoPicker onSelect={onSelectVideo} />
          </div>
        )
      )}

      {started ? (
        <div className="mt-3">
          <Playback paused={paused} />
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <Button
            variant="primary"
            size="md"
            className="w-full"
            data-testid="start"
            disabled={!ready || (mode === "video" && !hasVideoUrl)}
            onClick={onStart}
          >
            Start
          </Button>
          {!ready ? (
            <p className="text-xs text-zinc-500">connect to start</p>
          ) : (
            mode === "video" &&
            !hasVideoUrl && (
              <p className="text-xs text-zinc-500">pick a clip to stream</p>
            )
          )}
        </div>
      )}
    </Panel>
  );
}
