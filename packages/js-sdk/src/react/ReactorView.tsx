"use client";

import { useReactor } from "./hooks";
import { useEffect, useMemo, useRef } from "react";
import React from "react";

export interface ReactorViewProps {
  /**
   * The name of the recvonly track to render.
   * Must match a track name declared in the server capabilities.
   * Check the model's documentation for available track names.
   * Defaults to `"main_video"`.
   */
  track?: string;
  /**
   * Optional name of a recvonly audio track to play alongside the video
   * (e.g. `"main_audio"`). The audio is mixed into the same `<video>` element.
   * Check the model's documentation for available track names.
   */
  audioTrack?: string;
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
  videoObjectFit?: NonNullable<
    React.VideoHTMLAttributes<HTMLVideoElement>["style"]
  >["objectFit"];
  /**
   * Controls whether inbound audio plays.  Default is `true`
   * (muted) when no `audioTrack` is set — keeps the underlying
   * `<video>` element within browser autoplay policies; `false`
   * when an `audioTrack` is set.  Pass an explicit value to
   * override either default.
   */
  muted?: boolean;
}

export function ReactorView({
  track = "main_video",
  audioTrack,
  width,
  height,
  className,
  style,
  videoObjectFit = "contain",
  muted = audioTrack === undefined,
}: ReactorViewProps) {
  const { videoMediaTrack, audioMediaTrack } = useReactor((state) => ({
    videoMediaTrack: state.tracks[track] ?? null,
    audioMediaTrack: audioTrack ? (state.tracks[audioTrack] ?? null) : null,
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

    const el = videoRef.current;
    if (!el || !mediaStream) {
      console.debug("[ReactorView] No tracks or element to attach");
      return;
    }

    // (Re-)bind the stream to the element and start playback. Setting
    // `srcObject = null` first forces the element to re-initialise its decode
    // pipeline so it re-requests a keyframe — needed when re-attaching a track
    // that started rendering black (see the unmute handler below).
    const attach = (reset: boolean) => {
      try {
        if (reset) el.srcObject = null;
        el.srcObject = mediaStream;
        el.play().catch((e) => {
          console.warn("[ReactorView] Auto-play failed:", e);
        });
      } catch (error) {
        console.error("[ReactorView] Failed to attach media stream:", error);
      }
    };

    console.debug("[ReactorView] Attaching media stream to element");
    attach(false);

    // A recvonly track negotiated while the server has it paused arrives
    // `muted` (no RTP). When the server starts sending — e.g. on auto-resume's
    // `resume_track` — the track fires `unmute`, but the element was attached
    // and play()'d while the track was empty, so some browsers keep showing
    // black on the existing srcObject until a fresh attach. Without this, the
    // only way to render an auto-resumed track was a manual pause/resume (which
    // renegotiated a brand-new track for us to attach). Re-attach on `unmute`
    // so auto-resumed tracks render on their own.
    const onUnmute = () => {
      console.debug(
        "[ReactorView] Track unmuted — re-attaching to render incoming media"
      );
      attach(true);
    };
    const tracks = mediaStream.getTracks();
    for (const t of tracks) t.addEventListener("unmute", onUnmute);

    return () => {
      console.debug("[ReactorView] Detaching media stream from element");
      for (const t of tracks) t.removeEventListener("unmute", onUnmute);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [mediaStream]);

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
          display: videoMediaTrack ? "block" : "none",
        }}
        muted={muted}
        playsInline
      />
    </div>
  );
}
