"use client";

import { useReactor } from "./hooks";
import { useEffect, useRef, useState } from "react";
import React from "react";

export interface WebcamStreamProps {
  /**
   * The name of the sendonly **video** track to publish the webcam to.
   * Must match a track name declared in the server capabilities.
   * Check the model's documentation for available track names.
   */
  track: string;
  /**
   * Capture and publish the microphone alongside the webcam.  Pass
   * `true` for default constraints, or an explicit
   * `MediaTrackConstraints` to control sample rate / device / echo
   * cancellation.  Requires {@link audioTrack} so the SDK knows
   * which sendonly track to publish the mic to.  Default `false`.
   */
  audio?: boolean | MediaTrackConstraints;
  /**
   * The name of the sendonly **audio** track to publish the mic to.
   * Ignored when {@link audio} is `false` (the default); required
   * otherwise.
   */
  audioTrack?: string;
  className?: string;
  style?: React.CSSProperties;
  videoConstraints?: MediaTrackConstraints;
  showWebcam?: boolean;
  videoObjectFit?: NonNullable<
    React.VideoHTMLAttributes<HTMLVideoElement>["style"]
  >["objectFit"];
  /**
   * Fires once `getUserMedia` is rejected with `NotAllowedError`
   * or `PermissionDeniedError`.
   */
  onPermissionDenied?: () => void;
  /**
   * Fires after the local media stream has been published (both
   * video and audio when {@link audio} is enabled).  Re-fires
   * after a reconnect.
   */
  onPublished?: () => void;
  /**
   * Fires on non-permission `getUserMedia` failures and on
   * publish / unpublish rejections.  Permission denials route to
   * {@link onPermissionDenied} instead.
   */
  onError?: (error: Error) => void;
}

export function WebcamStream({
  track,
  audio = false,
  audioTrack,
  className,
  style,
  videoConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  showWebcam = true,
  videoObjectFit = "contain",
  onPermissionDenied,
  onPublished,
  onError,
}: WebcamStreamProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const { status, publish, unpublish, reactor } = useReactor((state) => ({
    status: state.status,
    publish: state.publish,
    unpublish: state.unpublish,
    reactor: state.internal.reactor,
  }));

  const videoRef = useRef<HTMLVideoElement>(null);

  // Held in refs so inline callback identity doesn't churn the
  // publish/unpublish effect on every parent render.
  const onPermissionDeniedRef = useRef(onPermissionDenied);
  const onPublishedRef = useRef(onPublished);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onPermissionDeniedRef.current = onPermissionDenied;
    onPublishedRef.current = onPublished;
    onErrorRef.current = onError;
  });

  // Without an `audioTrack` the captured mic has nowhere to publish;
  // warn rather than silently capturing video-only.
  const audioRequested = audio !== false && audio !== undefined;
  const audioEnabled = audioRequested && !!audioTrack;
  if (audioRequested && !audioTrack) {
    console.warn(
      "[WebcamStream] `audio` was set but `audioTrack` is missing; capturing video-only."
    );
  }

  const startWebcam = async () => {
    console.debug("[WebcamPublisher] Starting webcam");

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioEnabled ? (audio === true ? true : audio) : false,
      });

      console.debug("[WebcamPublisher] Webcam started successfully");
      setStream(mediaStream);
      setPermissionDenied(false);
    } catch (err) {
      console.error("[WebcamPublisher] Failed to start webcam:", err);

      if (
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
      ) {
        console.debug("[WebcamPublisher] Camera permission denied");
        setPermissionDenied(true);
        onPermissionDeniedRef.current?.();
      } else {
        onErrorRef.current?.(
          err instanceof Error ? err : new Error(String(err))
        );
      }
    }
  };

  const stopWebcam = async () => {
    console.debug("[WebcamPublisher] Stopping webcam");

    // Unpublish failures are logged but don't block local-track
    // teardown — leaving tracks running keeps the camera/mic
    // indicator on after unmount.
    const unpublishTasks: Array<Promise<void>> = [unpublish(track)];
    if (audioEnabled && audioTrack) {
      unpublishTasks.push(unpublish(audioTrack));
    }
    const results = await Promise.allSettled(unpublishTasks);
    for (const r of results) {
      if (r.status === "rejected") {
        console.error(
          "[WebcamPublisher] Error unpublishing before stop:",
          r.reason
        );
        onErrorRef.current?.(
          r.reason instanceof Error ? r.reason : new Error(String(r.reason))
        );
      }
    }

    setIsPublishing(false);

    stream?.getTracks().forEach((t) => {
      t.stop();
      console.debug("[WebcamPublisher] Stopped track:", t.kind);
    });
    setStream(null);

    console.debug("[WebcamPublisher] Webcam stopped");
  };

  // Attach stream to video element
  useEffect(() => {
    console.debug("[WebcamPublisher] Stream effect triggered", {
      hasVideoElement: !!videoRef.current,
      hasStream: !!stream,
    });

    if (!videoRef.current) {
      return;
    }

    if (stream) {
      console.debug("[WebcamPublisher] Attaching stream to video element");
      videoRef.current.srcObject = stream;
      console.debug("[WebcamPublisher] Stream attached successfully");
    } else {
      console.debug("[WebcamPublisher] Clearing video element");
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  // Auto-publish when reactor is ready and webcam is active.
  useEffect(() => {
    if (!stream) {
      return;
    }

    if (status === "ready" && !isPublishing) {
      console.debug(
        "[WebcamPublisher] Reactor ready, auto-publishing webcam stream"
      );
      const videoMediaTrack = stream.getVideoTracks()[0];
      const audioMediaTrack =
        audioEnabled && audioTrack ? stream.getAudioTracks()[0] : null;
      const tasks: Array<Promise<void>> = [];
      if (videoMediaTrack) tasks.push(publish(track, videoMediaTrack));
      if (audioMediaTrack && audioTrack)
        tasks.push(publish(audioTrack, audioMediaTrack));
      if (tasks.length === 0) return;
      Promise.all(tasks)
        .then(() => {
          console.debug("[WebcamPublisher] Auto-publish successful");
          setIsPublishing(true);
          onPublishedRef.current?.();
        })
        .catch((err) => {
          console.error("[WebcamPublisher] Auto-publish failed:", err);
          onErrorRef.current?.(
            err instanceof Error ? err : new Error(String(err))
          );
        });
    } else if (status !== "ready" && isPublishing) {
      console.debug("[WebcamPublisher] Reactor not ready, auto-unpublishing");
      const tasks: Array<Promise<void>> = [unpublish(track)];
      if (audioEnabled && audioTrack) tasks.push(unpublish(audioTrack));
      Promise.allSettled(tasks).then((results) => {
        for (const r of results) {
          if (r.status === "rejected") {
            console.error("[WebcamPublisher] Auto-unpublish failed:", r.reason);
            onErrorRef.current?.(
              r.reason instanceof Error ? r.reason : new Error(String(r.reason))
            );
          }
        }
        setIsPublishing(false);
      });
    }
  }, [
    status,
    stream,
    isPublishing,
    publish,
    unpublish,
    track,
    audioEnabled,
    audioTrack,
  ]);

  // Listen for error events from Reactor
  useEffect(() => {
    const handleError = (error: any) => {
      console.debug("[WebcamPublisher] Received error event:", error);

      // Handle track publish failures by resetting state
      if (error.code === "TRACK_PUBLISH_FAILED") {
        console.debug(
          "[WebcamPublisher] Track publish failed, resetting isPublishing state"
        );
        setIsPublishing(false);
      }
    };

    reactor.on("error", handleError);

    return () => {
      reactor.off("error", handleError);
    };
  }, [reactor]);

  // Reset publishing state when status changes away from ready
  useEffect(() => {
    if (status !== "ready") {
      console.debug(
        "[WebcamPublisher] Status changed to",
        status,
        "- resetting isPublishing state"
      );
      setIsPublishing(false);
    }
  }, [status, isPublishing]);

  // Auto-start webcam on mount and cleanup on unmount
  useEffect(() => {
    console.debug("[WebcamPublisher] Auto-starting webcam");
    startWebcam();

    return () => {
      console.debug("[WebcamPublisher] Cleanup on unmount");
      stopWebcam();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showPlaceholder = !stream;

  return (
    <div
      style={{
        display: showWebcam ? "block" : "none",
        position: "relative",
        background: "#000",
        ...style,
      }}
      className={className}
    >
      <video
        ref={videoRef}
        style={{
          width: "100%",
          height: "100%",
          objectFit: videoObjectFit,
          display: showPlaceholder ? "none" : "block",
        }}
        muted
        playsInline
        autoPlay
      />
      {showPlaceholder && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "16px",
            fontFamily: "monospace",
            textAlign: "center",
            padding: "20px",
            boxSizing: "border-box",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {permissionDenied ? (
            <div style={{ fontSize: "12px", fontFamily: "monospace" }}>
              Camera access denied.
              <br />
              Please allow access in your browser settings.
            </div>
          ) : (
            <div style={{ fontSize: "12px", fontFamily: "monospace" }}>
              Starting camera...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
