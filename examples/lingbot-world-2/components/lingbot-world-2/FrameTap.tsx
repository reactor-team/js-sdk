"use client";

// LIVE frame tap for the CLOUD path. The AI director watches a file on disk, but
// cloud video only exists in the browser (WebRTC → <video>). This grabs the real
// on-screen frame every INTERVAL_MS, downscales it, and POSTs it to
// /api/frame-tap, which writes it to the file the director reads. So the director
// sees the ACTUAL evolving stream — never the frozen scene still (self-feed stays
// only as the fallback for when this isn't running).
//
// WebRTC MediaStream frames don't taint the canvas, so drawImage → toBlob works.
// Renders nothing; mount it once inside the app.

import { useEffect } from "react";
import { useLingbotWorld2 } from "@reactor-models/lingbot-world-2";

const INTERVAL_MS = 2000; // how often to grab a frame (matches the director's look pace)
const MAX_W = 768; // downscale width — the director doesn't need full resolution
const JPEG_QUALITY = 0.8;

export function FrameTap() {
  const { status } = useLingbotWorld2();

  useEffect(() => {
    if (status !== "ready") return; // only while a session is live
    let alive = true;
    const canvas = document.createElement("canvas");

    const grab = async () => {
      // The main video is the only <video> on the page (LingbotWorld2MainVideoView).
      const video = document.querySelector("video") as HTMLVideoElement | null;
      if (!video || video.readyState < 2 || !video.videoWidth) return;
      const scale = Math.min(1, MAX_W / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) =>
        canvas.toBlob(r, "image/jpeg", JPEG_QUALITY),
      );
      if (!blob || !alive) return;
      try {
        await fetch("/api/frame-tap", {
          method: "POST",
          body: blob,
          headers: { "Content-Type": "image/jpeg" },
        });
      } catch {
        /* transient — the next tick retries */
      }
    };

    const id = setInterval(grab, INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [status]);

  return null;
}
