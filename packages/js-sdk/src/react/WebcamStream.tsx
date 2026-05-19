// Copyright (c) 2024-2026 Reactor Technologies, Inc.
// SPDX-License-Identifier: Apache-2.0

"use client";

import { useReactor } from "./hooks";
import { useEffect, useRef, useState } from "react";
import React from "react";

export interface WebcamStreamProps {
  /**
   * The name of the sendonly track to publish the webcam to.
   * Must match a track name declared in the server capabilities.
   * Check the model's documentation for available track names.
   */
  track: string;
  className?: string;
  style?: React.CSSProperties;
  videoConstraints?: MediaTrackConstraints;
  showWebcam?: boolean;
  videoObjectFit?: NonNullable<
    React.VideoHTMLAttributes<HTMLVideoElement>["style"]
  >["objectFit"];
}

export function WebcamStream({
  track,
  className,
  style,
  videoConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  showWebcam = true,
  videoObjectFit = "contain",
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

  // Start webcam
  const startWebcam = async () => {
    console.debug("[WebcamPublisher] Starting webcam");

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });

      console.debug("[WebcamPublisher] Webcam started successfully");
      setStream(mediaStream);
      setPermissionDenied(false);
    } catch (err) {
      console.error("[WebcamPublisher] Failed to start webcam:", err);

      // Check if the error is a permission denial
      if (
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
      ) {
        console.debug("[WebcamPublisher] Camera permission denied");
        setPermissionDenied(true);
      }
    }
  };

  // Stop webcam
  const stopWebcam = async () => {
    console.debug("[WebcamPublisher] Stopping webcam");

    // Unpublish if currently publishing
    try {
      await unpublish(track);
      console.debug("[WebcamPublisher] Unpublished before stopping");
    } catch (err) {
      console.error("[WebcamPublisher] Error unpublishing before stop:", err);
    }

    setIsPublishing(false);

    // Stop all tracks
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

  // Auto-publish when reactor is ready and webcam is active
  useEffect(() => {
    if (!stream) {
      return;
    }

    if (status === "ready" && !isPublishing) {
      console.debug(
        "[WebcamPublisher] Reactor ready, auto-publishing webcam stream"
      );
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        publish(track, videoTrack)
          .then(() => {
            console.debug("[WebcamPublisher] Auto-publish successful");
            setIsPublishing(true);
          })
          .catch((err) => {
            console.error("[WebcamPublisher] Auto-publish failed:", err);
          });
      }
    } else if (status !== "ready" && isPublishing) {
      console.debug("[WebcamPublisher] Reactor not ready, auto-unpublishing");
      unpublish(track)
        .then(() => {
          console.debug("[WebcamPublisher] Auto-unpublish successful");
          setIsPublishing(false);
        })
        .catch((err) => {
          console.error("[WebcamPublisher] Auto-unpublish failed:", err);
        });
    }
  }, [status, stream, isPublishing, publish, unpublish, track]);

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
