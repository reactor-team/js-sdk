"use client";

import { useX2 } from "@/app/lib/x2/sdk.react";
import type { X2SourceMode } from "@/app/lib/types";
import { Button, Panel, SegmentedToggle } from "./ui";
import { ImagePicker } from "./ImagePicker";
import { VideoPicker } from "./VideoPicker";
import { WebcamSource } from "./WebcamSource";

// The Source panel. X2 has no explicit start command: generation begins on
// its own once a non-empty prompt is set AND source frames are arriving, so
// this panel only picks what streams into the `source` track.
//
// Every mode only *produces* a MediaStreamTrack; the controller's
// useSourcePublisher is the single owner of the `source` slot, so mode
// switches swap tracks on one publisher instead of racing two.
//
//   - Webcam mode renders the self-view here (WebcamSource) and hands its
//     track up via onTrack. It stays mounted across the start transition
//     so the camera keeps streaming while generation runs.
//   - Video and image modes only pick media here; the stage plays/repeats
//     it and hands the captured track up the same way. Image mode streams
//     a still image as a constant feed — the drag-to-animate setup: prompt
//     it, then steer the subject with the pointer.
//   - Generating: the source is fixed for the run — Reset stops generation
//     (and clears prompt, reference image, and pointer) to change it.
export function SourcePanel({
  generating,
  keepBacklog,
  mode,
  onModeChange,
  onSelectVideo,
  onSelectImage,
  onTrack,
}: {
  generating: boolean;
  /** The model-reported keep_backlog policy (from the state_update snapshot). */
  keepBacklog: boolean;
  mode: X2SourceMode;
  onModeChange: (m: X2SourceMode) => void;
  onSelectVideo: (url: string, name: string) => void;
  onSelectImage: (url: string, name: string) => void;
  onTrack: (track: MediaStreamTrack | null) => void;
}) {
  const { reset, setKeepBacklog, status } = useX2();
  const ready = status === "ready";

  // The checkbox renders the model's own keep_backlog (echoed back via
  // state_update after set_keep_backlog), so it can never drift from the
  // policy actually in effect. False drops stale source frames so the edit
  // tracks "now" (right for webcam); true consumes every frame in order for
  // smoother motion at the cost of growing delay (right for clips and
  // drag-to-animate).
  const toggleKeepBacklog = (value: boolean) => {
    setKeepBacklog({ keep_backlog: value }).catch(console.error);
  };

  const handleModeChange = (m: X2SourceMode) => {
    if (generating) return; // source is fixed once a run has started — reset to switch
    onModeChange(m);
  };

  return (
    <Panel label="Source">
      {!generating && (
        <SegmentedToggle
          aria-label="Input source"
          value={mode}
          onChange={handleModeChange}
          options={[
            { value: "webcam", label: "Webcam" },
            { value: "video", label: "Video" },
            { value: "image", label: "Image" },
          ]}
        />
      )}

      {mode === "webcam" ? (
        <div className={generating ? "" : "mt-3"}>
          <WebcamSource onTrack={onTrack} />
        </div>
      ) : mode === "video" ? (
        !generating && (
          <div className="mt-3">
            <VideoPicker onSelect={onSelectVideo} />
          </div>
        )
      ) : (
        !generating && (
          <div className="mt-3">
            <ImagePicker onSelect={onSelectImage} />
          </div>
        )
      )}

      <label className="mt-3 flex items-start gap-2">
        <input
          type="checkbox"
          checked={keepBacklog}
          disabled={!ready}
          onChange={(e) => toggleKeepBacklog(e.target.checked)}
          className="mt-0.5 accent-[var(--color-brand)] disabled:opacity-40"
        />
        <span className="min-w-0 text-xs text-zinc-400">
          Keep frame backlog
          <span className="block text-zinc-600">
            On: every frame, smoother motion, growing delay. Off: newest frames,
            bounded latency.
          </span>
        </span>
      </label>

      {generating ? (
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={!ready}
            onClick={() => reset().catch(console.error)}
          >
            Reset
          </Button>
          <span className="text-xs text-zinc-500">
            Editing — reset to change source or reference
          </span>
        </div>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">
          {ready
            ? "Generation starts once a prompt is set and frames are streaming."
            : "Connect, then set a prompt to start."}
        </p>
      )}
    </Panel>
  );
}
