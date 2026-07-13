"use client";

// Optional live visualization of the COORDINATOR state — History facts (with
// remaining lifetime), vitals, objective, mode, and the scene's director
// events. Its own lightweight coordinator client; toggled by a button, off by
// default. Read-only; purely for observing what the shared world holds.

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface CoordState {
  mode: string;
  vitals: { health: number; maxHealth: number; inventory: string[] };
  objective: { summary?: string; director?: string } | null;
  facts: { key: string; clause: string; weight: number; remaining: string }[];
  sceneEvents: { name: string }[];
}

export function StateInspector({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const wsUrl = process.env.NEXT_PUBLIC_COORDINATOR_WS;
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<CoordState | null>(null);

  useEffect(() => {
    if (!visible || !wsUrl) return;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(String(e.data));
        if (m.type === "state") setState(m as CoordState);
      } catch {
        /* ignore */
      }
    };
    return () => {
      ws.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [visible, wsUrl]);

  if (!visible) return null;

  return (
    <div className="absolute bottom-3 left-3 z-40 w-80 max-h-[70%] overflow-y-auto rounded-xl border border-white/15 bg-black/85 backdrop-blur-sm p-3 text-white shadow-xl flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className={cn("w-2 h-2 rounded-full", connected ? "bg-emerald-400" : "bg-red-500")} />
        <span className="font-mono text-[11px] uppercase tracking-widest text-white/80">Coordinator state</span>
        <button className="ml-auto text-white/50 hover:text-white text-sm leading-none" onClick={onClose}>✕</button>
      </div>

      {!wsUrl && (
        <p className="font-mono text-[10px] text-amber-300/80">Set NEXT_PUBLIC_COORDINATOR_WS to view coordinator state.</p>
      )}

      {state && (
        <>
          {/* mode + vitals */}
          <div className="flex items-center gap-3 font-mono text-[10px]">
            <span className="text-white/40 uppercase tracking-wider">mode</span>
            <span className="text-emerald-300/90">{state.mode}</span>
            <span className="text-white/40 uppercase tracking-wider ml-2">hp</span>
            <span className="text-amber-200/90 tabular-nums">
              {state.vitals.health}/{state.vitals.maxHealth}
            </span>
          </div>
          {state.vitals.inventory.length > 0 && (
            <div className="font-mono text-[10px] text-white/60">inv: {state.vitals.inventory.join(", ")}</div>
          )}

          {/* objective */}
          {state.objective?.summary && (
            <div className="font-mono text-[10px] text-white/70 leading-snug">
              <span className="text-white/40 uppercase tracking-wider">goal </span>
              {state.objective.summary}
            </div>
          )}

          {/* History facts */}
          <div className="flex flex-col gap-1 border-t border-white/10 pt-2">
            <span className="font-mono text-[9px] uppercase tracking-wider text-white/40">
              history · {state.facts.length} fact{state.facts.length === 1 ? "" : "s"}
            </span>
            {state.facts.length === 0 ? (
              <span className="font-mono text-[10px] text-white/30">— empty —</span>
            ) : (
              state.facts.map((f) => (
                <div key={f.key} className="flex items-start gap-1.5 font-mono text-[10px]">
                  <span className="shrink-0 rounded bg-white/10 px-1 text-emerald-200/80">{f.remaining}</span>
                  <span className="shrink-0 text-sky-200/70">{f.key}</span>
                  <span className="text-white/60 truncate" title={f.clause}>{f.clause}</span>
                </div>
              ))
            )}
          </div>

          {/* scene director events (available action set) */}
          {state.sceneEvents.length > 0 && (
            <div className="flex flex-col gap-0.5 border-t border-white/10 pt-2">
              <span className="font-mono text-[9px] uppercase tracking-wider text-white/40">director events</span>
              <span className="font-mono text-[10px] text-white/55 leading-snug">
                {state.sceneEvents.map((e) => e.name).join(" · ")}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
