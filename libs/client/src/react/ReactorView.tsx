"use client";

import { useReactor } from "./hooks";
import { useEffect, useRef } from "react";
import React from "react";

export interface ReactorViewProps {
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
  videoObjectFit?: NonNullable<
    React.VideoHTMLAttributes<HTMLVideoElement>["style"]
  >["objectFit"];
}

export function ReactorView({
  width,
  height,
  className,
  style,
  videoObjectFit = "contain",
}: ReactorViewProps) {
  const { videoTrack, status } = useReactor((state) => ({
    videoTrack: state.videoTrack,
    status: state.status,
  }));

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    console.debug("[ReactorView] Video track effect triggered", {
      hasVideoElement: !!videoRef.current,
      hasVideoTrack: !!videoTrack,
      videoTrackKind: videoTrack?.kind,
    });

    if (videoRef.current && videoTrack) {
      console.debug("[ReactorView] Attaching video track to element");
      try {
        // Create a MediaStream from the track and attach to video element
        const stream = new MediaStream([videoTrack]);
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((e) => {
          console.warn("[ReactorView] Auto-play failed:", e);
        });
        console.debug("[ReactorView] Video track attached successfully");
      } catch (error) {
        console.error("[ReactorView] Failed to attach video track:", error);
      }

      // Cleanup: remove srcObject when track changes or component unmounts
      return () => {
        console.debug("[ReactorView] Detaching video track from element");
        if (videoRef.current) {
          videoRef.current.srcObject = null;
          console.debug("[ReactorView] Video track detached successfully");
        }
      };
    } else {
      console.debug("[ReactorView] No video track or element to attach");
    }
  }, [videoTrack]);

  const showPlaceholder = !videoTrack;

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
        muted
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
