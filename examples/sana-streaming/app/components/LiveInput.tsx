"use client";

import { useReactor } from "@reactor-team/js-sdk";
import { useEffect, useRef, useState } from "react";
import { startGeneration } from "../lib/state";
import { Button, errorMessage } from "./ui";

// Webcam -> `camera` track, manual publish path (not <WebcamStream/>).
//
// We own the MediaStreamTrack so we can set contentHint = "detail": the
// deployed sana-streaming model assumes a constant frame shape within a
// chunk, but Chrome's default encoder behavior ramps resolution at stream
// start (and on bandwidth dips), which crashes the model's _live_session
// (np.stack shape mismatch). "detail" pins resolution and degrades
// framerate instead. Switching to file mode unmounts this component,
// which unpublishes and stops the camera.
export function LiveInput({ running }: { running: boolean }) {
  const sendCommand = useReactor((s) => s.sendCommand);
  const publish = useReactor((s) => s.publish);
  const unpublish = useReactor((s) => s.unpublish);
  const status = useReactor((s) => s.status);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [track, setTrack] = useState<MediaStreamTrack | null>(null);
  const [published, setPublished] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Acquire the camera; re-acquire when retryKey increments.
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    // Reset error/denied state at the start of each attempt.
    setDenied(false);
    setError(null);
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 360 },
            facingMode: "user",
          },
        });
      } catch (e) {
        if (cancelled) return;
        if (e instanceof DOMException && e.name === "NotAllowedError") {
          setDenied(true);
        } else if (e instanceof DOMException && e.name === "NotReadableError") {
          setError("Camera is in use by another application.");
        } else {
          setError(errorMessage(e));
        }
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const videoTrack = stream.getVideoTracks()[0];
      videoTrack.contentHint = "detail"; // hold resolution; adapt framerate
      if (videoRef.current) videoRef.current.srcObject = stream;
      setTrack(videoTrack);
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [retryKey]);

  // Publish once connected; re-publish after reconnect; unpublish on unmount.
  useEffect(() => {
    if (!track || status !== "ready") return;
    let cancelled = false;
    publish("camera", track)
      .then(() => {
        if (!cancelled && status === "ready") setPublished(true);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
      setPublished(false);
      unpublish("camera").catch(() => {});
    };
  }, [track, status, publish, unpublish]);

  const startLive = () => {
    startGeneration(sendCommand, "live").catch((e) => {
      setError("Start failed: " + errorMessage(e));
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-md border border-zinc-800 bg-black">
        {/* Local self-view (muted preview of the published camera) */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="aspect-video w-full object-cover"
        />
      </div>

      {denied && (
        <div className="flex items-center gap-2">
          <p className="text-xs text-red-400">
            Camera access denied. Allow camera for this site and retry.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setRetryKey((k) => k + 1)}
          >
            Retry
          </Button>
        </div>
      )}
      {error && !denied && (
        <p className="text-xs text-red-400">Camera error: {error}</p>
      )}

      <Button
        variant="primary"
        size="md"
        className="w-full"
        data-testid="start-live"
        disabled={status !== "ready" || !published || running}
        onClick={startLive}
      >
        Start live
      </Button>

      {!track && !denied && !error && (
        <p className="text-xs text-zinc-500">acquiring camera…</p>
      )}
      {track && !published && !denied && !error && (
        <p className="text-xs text-zinc-500">waiting for connection…</p>
      )}
    </div>
  );
}
