"use client";

import { useSanaStreaming } from "@reactor-models/sana-streaming";
import { useEffect, useRef, useState } from "react";
import { startGeneration } from "../lib/state";
import { Button, errorMessage } from "./ui";

// Webcam -> `camera` track, manual publish path (not <SanaStreamingCameraView>).
//
// We own the MediaStreamTrack so we can set contentHint = "detail" before
// publishing: the model needs a stable camera resolution, but Chrome's encoder
// ramps resolution at stream start and on bandwidth dips. "detail" holds the
// resolution steady and trades framerate instead. The declarative
// <SanaStreamingCameraView> acquires and publishes for you but gives no hook to
// set the hint, so this component uses the manual publish path. The self-view
// stays mounted through the whole session (setup and live) so the camera keeps
// publishing; switching to file mode unmounts it, which unpublishes and stops
// the webcam.
export function LiveInput({ started }: { started: boolean }) {
  const { publish, unpublish, setMode, start, status } = useSanaStreaming();

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
    startGeneration({ setMode, start }, "live").catch((e) => {
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

      {!started && (
        <Button
          variant="primary"
          size="md"
          className="w-full"
          data-testid="start-live"
          disabled={status !== "ready" || !published}
          onClick={startLive}
        >
          Start live
        </Button>
      )}

      {!started && !track && !denied && !error && (
        <p className="text-xs text-zinc-500">acquiring camera…</p>
      )}
      {!started && track && !published && !denied && !error && (
        <p className="text-xs text-zinc-500">waiting for connection…</p>
      )}
    </div>
  );
}
