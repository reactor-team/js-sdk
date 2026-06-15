"use client";

import {
  useSanaStreaming,
  useSanaStreamingCommandError,
  type FileRef,
} from "@reactor-models/sana-streaming";
import { useRef, useState } from "react";
import { PRESET_CLIPS, type PresetClip } from "../lib/clips";
import { startGeneration } from "../lib/state";
import { Button, cn, errorMessage, EYEBROW, FOCUS_RING } from "./ui";

// An uploaded clip occasionally comes back with a one-off "decode failed"
// command_error for a perfectly valid file; resend set_video with the same
// upload ref a couple of times before surfacing the error to the user.
const DECODE_RETRIES = 2;

// File mode: pick a clip -> uploadFile -> set_video. The model accepts the
// upload instantly (the clip is consumed as the edit streams) and replies
// video_accepted + a state snapshot (has_video: true). The Start button is
// gated on the lifted state.hasVideo, the model's truth, not local optimism.
//
// Once a run has started the picker is hidden: the model latches its source at
// start, so the input is fixed for the run (the Playback control offers reset
// to switch). The parent keys this component on the reset nonce, so a model
// generation_reset remounts it and clears the local file selection.
export function FileInput({
  hasVideo,
  started,
  onSource,
}: {
  hasVideo: boolean;
  started: boolean;
  onSource: (url: string) => void;
}) {
  const { setVideo, uploadFile, setMode, start, status } = useSanaStreaming();

  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Last successful upload ref + remaining decode retries (see DECODE_RETRIES).
  const lastRefRef = useRef<FileRef | null>(null);
  const retriesRef = useRef(0);

  useSanaStreamingCommandError((msg) => {
    if (msg.command !== "set_video" || !msg.reason.startsWith("decode failed"))
      return;
    if (retriesRef.current > 0 && lastRefRef.current) {
      retriesRef.current -= 1;
      setVideo({ video: lastRefRef.current }).catch(() => {
        setError("Upload failed: " + msg.reason);
      });
    } else {
      setError("Upload failed: " + msg.reason);
    }
  });

  // Shared upload path for manual picks and preset clips.
  async function uploadVideo(file: File) {
    setBusy(true);
    setError(null);
    try {
      const ref = await uploadFile(file);
      lastRefRef.current = ref;
      retriesRef.current = DECODE_RETRIES;
      await setVideo({ video: ref });
      setFileName(file.name);
      onSource(URL.createObjectURL(file));
    } catch (err) {
      setError("Upload failed: " + errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadVideo(file);
    // Clear the native value so re-picking the same file fires onChange.
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onPresetClick(clip: PresetClip) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(clip.src);
      if (!r.ok) throw new Error(`clip fetch failed (${r.status})`);
      const file = new File([await r.blob()], clip.id + ".mp4", {
        type: "video/mp4",
      });
      await uploadVideo(file); // uploadVideo owns busy/error from here
    } catch (err) {
      setError("Upload failed: " + errorMessage(err));
      setBusy(false);
    }
  }

  const startFile = () => {
    startGeneration({ setMode, start }, "file").catch((e) => {
      setError("Start failed: " + errorMessage(e));
    });
  };

  // Live phase: the picker is hidden (source is latched for the run); show a
  // compact reminder of which clip is being edited.
  if (started) {
    return (
      <p className="text-xs text-zinc-500">
        {fileName ? (
          <>
            source: <span className="text-zinc-300">{fileName}</span>
          </>
        ) : (
          "editing the selected clip"
        )}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className={cn(EYEBROW)}>preset clips</span>
      <div data-testid="preset-clips" className="grid grid-cols-2 gap-2">
        {PRESET_CLIPS.map((clip) => (
          <button
            key={clip.id}
            type="button"
            data-testid={`preset-clip-${clip.id}`}
            disabled={busy || status !== "ready"}
            onClick={() => onPresetClick(clip)}
            aria-label={clip.label}
            className={cn(
              "rounded-md border border-zinc-700 p-1.5 transition hover:border-zinc-500 disabled:opacity-50 disabled:pointer-events-none",
              FOCUS_RING,
            )}
          >
            <video
              preload="metadata"
              muted
              playsInline
              src={clip.src}
              className="aspect-video w-full rounded border border-zinc-800 object-cover"
            />
          </button>
        ))}
      </div>

      <label
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-zinc-700 px-4 py-6 text-center transition hover:border-zinc-500",
          (busy || status !== "ready") && "pointer-events-none opacity-50",
        )}
      >
        <input
          ref={inputRef}
          data-testid="file-input"
          type="file"
          accept="video/*"
          disabled={busy || status !== "ready"}
          onChange={onPick}
          className="hidden"
        />
        <span className={cn(EYEBROW)}>{fileName ?? "choose a video clip"}</span>
        <span className="text-xs text-zinc-500">
          {busy ? "uploading…" : "click to browse"}
        </span>
      </label>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <Button
        variant="primary"
        size="md"
        className="w-full"
        data-testid="start-file"
        disabled={status !== "ready" || !hasVideo || busy}
        onClick={startFile}
      >
        Start edit
      </Button>

      {hasVideo ? (
        <p data-testid="video-accepted" className="text-xs text-zinc-500">
          video accepted
        </p>
      ) : (
        !busy &&
        !error && (
          <p className="text-xs text-zinc-500">
            {status === "ready"
              ? "upload a clip to enable start"
              : "waiting for connection…"}
          </p>
        )
      )}
    </div>
  );
}
