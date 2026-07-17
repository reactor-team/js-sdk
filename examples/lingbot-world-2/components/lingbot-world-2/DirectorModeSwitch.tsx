"use client";

// Persistent runtime switch for the ACTIVE director (human / ai / both). Always
// on the viewport (when a coordinator is configured) — unlike the full Director
// panel, which is toggled. Its own lightweight coordinator client: reads the
// current mode and flips it live. The coordinator gates ops by this mode, so
// switching here turns a director on/off with no restart.

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MODES = ["human", "ai", "both"] as const;

export function DirectorModeSwitch() {
  const wsUrl = process.env.NEXT_PUBLIC_COORDINATOR_WS;
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [mode, setMode] = useState<string>("human"); // matches the coordinator default until it broadcasts

  useEffect(() => {
    if (!wsUrl) return;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(String(e.data));
        if (m.type === "mode") setMode(m.mode);
      } catch {
        /* ignore */
      }
    };
    return () => {
      ws.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [wsUrl]);

  if (!wsUrl) return null;

  const set = (mo: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ op: "mode", mode: mo }));
  };

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 rounded-lg border border-white/15 bg-black/70 backdrop-blur-sm px-2 py-1">
      <span className={cn("w-1.5 h-1.5 rounded-full", connected ? "bg-emerald-400" : "bg-red-500")} />
      <span className="mono-label mr-1">director</span>
      {MODES.map((mo) => (
        <button
          key={mo}
          onClick={() => set(mo)}
          className={cn(
            "h-6 rounded border px-2 mono-xs transition-colors",
            mode === mo
              ? "border-emerald-400/60 bg-emerald-400/20 text-emerald-200"
              : "border-white/15 bg-white/5 text-white/60 hover:bg-white/10",
          )}
        >
          {mo}
        </button>
      ))}
    </div>
  );
}
