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

// The model's _probe_video forks an ffmpeg subprocess; a race with background
// gRPC threads in the pod intermittently corrupts the probe and yields a
// spurious "decode failed" for perfectly valid uploads. Band-aid: resend
// set_video with the same upload ref a couple of times before surfacing the
// error. Real fix is model-side (in-process probe); remove this when it lands.
const DECODE_RETRIES = 2;

// File mode: pick a clip -> uploadFile -> set_video. The model stashes the
// upload instantly (frames decode lazily during generation) and replies
// video_accepted + a state snapshot (has_video: true). The Start button is
// gated on the lifted state.hasVideo, the model's truth, not local optimism.
//
// Clip changes are disabled while a generation is running: the model
// latches its source at start, so a mid-run set_video would not take
// effect until the next start and the UI would misleadingly show the new
// clip. Reset first, then pick a new clip.
//
// The parent keys this component on the reset nonce, so a model
// generation_reset remounts it and clears the local file selection.
export function FileInput({
  hasVideo,
  running,
  onSource,
}: {
  hasVideo: boolean;
  running: boolean;
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

  return (
    <div className="flex flex-col gap-2">
      <span className={cn(EYEBROW)}>preset clips</span>
      <div data-testid="preset-clips" className="grid grid-cols-2 gap-2">
        {PRESET_CLIPS.map((clip) => (
          <button
            key={clip.id}
            type="button"
            data-testid={`preset-clip-${clip.id}`}
            disabled={busy || running || status !== "ready"}
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
          (busy || running || status !== "ready") &&
            "pointer-events-none opacity-50",
        )}
      >
        <input
          ref={inputRef}
          data-testid="file-input"
          type="file"
          accept="video/*"
          disabled={busy || running || status !== "ready"}
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
        disabled={status !== "ready" || !hasVideo || busy || running}
        onClick={startFile}
      >
        Start edit
      </Button>

      {hasVideo ? (
        <p data-testid="video-accepted" className="text-xs text-zinc-500">
          {running
            ? "video accepted — reset to change the clip"
            : "video accepted"}
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
