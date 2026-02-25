"use client";

import { useReactor } from "./hooks";
import { useEffect, useMemo, useRef } from "react";
import React from "react";

export interface ReactorViewProps {
  /**
   * The name of the **receive** track to render.
   * Must match a track name declared in the `receive` array (model → client).
   */
  track: string;
  /**
   * Optional name of a **receive** audio track to play alongside the video
   * (e.g. `"main_audio"`).  The audio is mixed into the same `<video>` element.
   */
  audioTrack?: string;
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
  videoObjectFit?: NonNullable<
    React.VideoHTMLAttributes<HTMLVideoElement>["style"]
  >["objectFit"];
  /** Controls whether inbound audio plays. Default true (muted) to satisfy browser autoplay policies. */
  muted?: boolean;
}

export function ReactorView({
  track,
  audioTrack,
  width,
  height,
  className,
  style,
  videoObjectFit = "contain",
  muted = true,
}: ReactorViewProps) {
  const { videoMediaTrack, audioMediaTrack, status } = useReactor((state) => ({
    videoMediaTrack: state.tracks[track] ?? null,
    audioMediaTrack: audioTrack ? (state.tracks[audioTrack] ?? null) : null,
    status: state.status,
  }));

  const videoRef = useRef<HTMLVideoElement>(null);

  const mediaStream = useMemo(() => {
    const tracks: MediaStreamTrack[] = [];
    if (videoMediaTrack) tracks.push(videoMediaTrack);
    if (audioMediaTrack) tracks.push(audioMediaTrack);
    if (tracks.length === 0) return null;
    return new MediaStream(tracks);
  }, [videoMediaTrack, audioMediaTrack]);

  useEffect(() => {
    console.debug("[ReactorView] Media track effect triggered", {
      track,
      hasVideoElement: !!videoRef.current,
      hasVideoTrack: !!videoMediaTrack,
      hasAudioTrack: !!audioMediaTrack,
    });

    if (videoRef.current && mediaStream) {
      console.debug("[ReactorView] Attaching media stream to element");
      try {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch((e) => {
          console.warn("[ReactorView] Auto-play failed:", e);
        });
        console.debug("[ReactorView] Media stream attached successfully");
      } catch (error) {
        console.error("[ReactorView] Failed to attach media stream:", error);
      }

      return () => {
        console.debug("[ReactorView] Detaching media stream from element");
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      };
    } else {
      console.debug("[ReactorView] No tracks or element to attach");
    }
  }, [mediaStream]);

  const showPlaceholder = !videoMediaTrack;

  return (
    <div
      style={{
        position: "relative",
        background: "#000",
        ...(width && { width }),
        ...(height && { height }),
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
        muted={muted}
        playsInline
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
          }}
        >
          {status}
        </div>
      )}
    </div>
  );
}
