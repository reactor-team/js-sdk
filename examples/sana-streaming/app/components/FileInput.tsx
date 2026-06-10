"use client";

import {
  useReactor,
  useReactorMessage,
  type FileRef,
} from "@reactor-team/js-sdk";
import { useEffect, useRef, useState } from "react";
import { PRESET_CLIPS, type PresetClip } from "../lib/clips";
import type { SanaMessage } from "../lib/types";
import { Button, cn, EYEBROW, FOCUS_RING } from "./ui";

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
export function FileInput({
  hasVideo,
  running,
  onSource,
  resetNonce,
}: {
  hasVideo: boolean;
  running: boolean;
  onSource: (url: string) => void;
  resetNonce: number;
}) {
  const sendCommand = useReactor((s) => s.sendCommand);
  const uploadFile = useReactor((s) => s.uploadFile);
  const status = useReactor((s) => s.status);

  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Model reset clears its source video; clear the local selection to match.
  useEffect(() => {
    if (resetNonce > 0) {
      setFileName(null);
      setError(null);
    }
  }, [resetNonce]);

  // Last successful upload ref + remaining decode retries (see DECODE_RETRIES).
  const lastRefRef = useRef<FileRef | null>(null);
  const retriesRef = useRef(0);

  useReactorMessage((msg: SanaMessage) => {
    if (msg.type !== "command_error") return;
    const { command, reason } = (
      msg as Extract<SanaMessage, { type: "command_error" }>
    ).data;
    if (command !== "set_video" || !reason.startsWith("decode failed")) return;
    if (retriesRef.current > 0 && lastRefRef.current) {
      retriesRef.current -= 1;
      sendCommand("set_video", { video: lastRefRef.current }).catch(() => {
        setError("Upload failed: " + reason);
      });
    } else {
      setError("Upload failed: " + reason);
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
      await sendCommand("set_video", { video: ref });
      setFileName(file.name);
      onSource(URL.createObjectURL(file));
    } catch (err) {
      setError(
        "Upload failed: " + (err instanceof Error ? err.message : String(err)),
      );
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
      setError(
        "Upload failed: " + (err instanceof Error ? err.message : String(err)),
      );
      setBusy(false);
    }
  }

  const startFile = () => {
    // set_mode again here keeps the start flow self-contained; the model
    // treats a repeated set_mode as idempotent (same idiom as LiveInput).
    sendCommand("set_mode", { mode: "file" })
      .then(() => sendCommand("start", {}))
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setError("Start failed: " + msg);
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
        disabled={status !== "ready" || !hasVideo || busy || running}
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
