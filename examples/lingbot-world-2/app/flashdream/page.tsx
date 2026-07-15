"use client";

// Opt-in flashdream backend viewer. Streams from a local flashdream WebRTC
// world-model server (integrations/lingbot, default :8089) instead of Reactor.
// Enabled only when NEXT_PUBLIC_FLASHDREAM_URL is set — otherwise this page
// explains how to turn it on. The default Reactor app (/) is untouched.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlashdreamSession,
  flashdreamUrl,
  type FlashdreamKey,
  type ChunkDone,
} from "@/lib/flashdream/transport";

const KEYS: FlashdreamKey[] = ["w", "a", "s", "d", "q", "e", "i", "j", "k", "l"];
const KEY_HELP =
  "w/s forward·back · a/d (or j/l) yaw · q/e strafe · i/k pitch · Space step";

export default function FlashdreamPage() {
  const url = flashdreamUrl();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<FlashdreamSession | null>(null);
  const downRef = useRef<Set<string>>(new Set());
  const [state, setState] = useState<RTCPeerConnectionState | "idle">("idle");
  const [lastChunk, setLastChunk] = useState<ChunkDone | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (!url || !videoRef.current) return;
    setError(null);
    const session = new FlashdreamSession(url, {
      onConnectionState: setState,
      onChunkDone: setLastChunk,
    });
    sessionRef.current = session;
    try {
      await session.connect(videoRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [url]);

  // Keyboard -> flashdream actions (keydown/keyup for the 10 mapped keys; Space = step).
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const s = sessionRef.current;
      if (!s) return;
      if (e.key === " ") {
        e.preventDefault();
        s.step();
        return;
      }
      const k = e.key.toLowerCase() as FlashdreamKey;
      if (KEYS.includes(k) && !downRef.current.has(k)) {
        downRef.current.add(k);
        s.keydown(k);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const s = sessionRef.current;
      if (!s) return;
      const k = e.key.toLowerCase() as FlashdreamKey;
      if (KEYS.includes(k)) {
        downRef.current.delete(k);
        s.keyup(k);
      }
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  useEffect(() => () => sessionRef.current?.close(), []);

  if (!url) {
    return (
      <main style={{ padding: 32, fontFamily: "system-ui", maxWidth: 720 }}>
        <h1>flashdream backend — disabled</h1>
        <p>
          This opt-in page streams from a local flashdream WebRTC world-model
          server instead of Reactor. To enable it, set the server URL in{" "}
          <code>.env.local</code> and restart the dev server:
        </p>
        <pre style={{ background: "#111", color: "#eee", padding: 12, borderRadius: 6 }}>
          NEXT_PUBLIC_FLASHDREAM_URL=http://localhost:8089
        </pre>
        <p>
          Then start the flashdream server (in the flashdream_public repo):
          <br />
          <code>
            uv run --package flashdreams-lingbot python -m lingbot.webrtc.server
            --host 0.0.0.0 --port 8089 --config_name lingbot-world-fast
          </code>
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ marginBottom: 4 }}>flashdream backend</h1>
      <p style={{ color: "#888", marginTop: 0 }}>
        {url} · state: <b>{state}</b>
        {lastChunk ? ` · chunk ${lastChunk.chunk_index} (${lastChunk.num_frames}f)` : ""}
      </p>
      {error && <p style={{ color: "#e33" }}>error: {error}</p>}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: 832, maxWidth: "100%", background: "#000", borderRadius: 8 }}
      />
      <div style={{ marginTop: 12 }}>
        <button onClick={connect} disabled={state === "connected"}>
          {state === "connected" ? "Connected" : "Connect"}
        </button>
        <button onClick={() => sessionRef.current?.step()} style={{ marginLeft: 8 }}>
          Step (Space)
        </button>
      </div>
      <p style={{ color: "#888", fontSize: 13 }}>{KEY_HELP}</p>
    </main>
  );
}
