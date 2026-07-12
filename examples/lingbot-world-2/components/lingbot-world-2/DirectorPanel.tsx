"use client";

// In-app HUMAN DIRECTOR — a toggleable panel giving a person the same kind of
// control surface the Player has, but for the WORLD instead of the character.
// It's a second WebSocket client on the coordinator (role "human"); its ops go
// into the shared History/vitals exactly like the standalone director.html.
//
// Needs NEXT_PUBLIC_COORDINATOR_WS set (same coordinator the Player uses).

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Life = { kind: "sustained" } | { kind: "steps"; n: number } | { kind: "instant" };

const WEATHER: { label: string; key: string; clause: string }[] = [
  { label: "snow", key: "env:weather", clause: "a heavy snowstorm blows in, thick flakes filling the air" },
  { label: "rain", key: "env:weather", clause: "heavy rain pours down, streaking the air and soaking every surface" },
  { label: "fog", key: "env:weather", clause: "dense fog rolls in, muffling the light and softening the distance" },
  { label: "dusk", key: "env:time", clause: "dusk falls, the light turning golden and shadows stretching long" },
  { label: "night", key: "env:time", clause: "night falls, the scene lit only by cold moonlight and scattered lamps" },
];

const SPAWNS: { label: string; key: string; clause: string; steps: number }[] = [
  { label: "birds", key: "entity:birds", clause: "a flock of birds sweeps across the sky ahead", steps: 4 },
  { label: "rabbit", key: "entity:rabbit", clause: "a small brown rabbit hops out onto the ground ahead", steps: 6 },
  { label: "fire", key: "fx:fire", clause: "flames erupt across the ground ahead, orange fire and black smoke rising", steps: 8 },
];

const VITALS: { label: string; change: Record<string, unknown> }[] = [
  { label: "−20", change: { health: -20 } },
  { label: "−50", change: { health: -50 } },
  { label: "+25", change: { health: 25 } },
  { label: "full", change: { setHealth: 100 } },
  { label: "+medkit", change: { addItem: "a medkit" } },
  { label: "+pistol", change: { addItem: "a pistol" } },
];

const MODES = ["human", "ai", "both"] as const;

function btn(active = false) {
  return cn(
    "h-7 rounded border px-2.5 font-mono text-[11px] transition-colors disabled:opacity-30",
    active
      ? "border-emerald-400/60 bg-emerald-400/20 text-emerald-200"
      : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10",
  );
}

export function DirectorPanel({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const wsUrl = process.env.NEXT_PUBLIC_COORDINATOR_WS;
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [facts, setFacts] = useState("");
  const [vitals, setVitals] = useState<{ health: number; maxHealth: number; inventory: string[] } | null>(null);
  const [mode, setMode] = useState("both");
  const [key, setKey] = useState("");
  const [clause, setClause] = useState("");

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
        if (m.type === "facts") setFacts(m.prompt || "");
        else if (m.type === "vitals") setVitals({ health: m.health, maxHealth: m.maxHealth, inventory: m.inventory });
        else if (m.type === "mode") setMode(m.mode);
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

  const send = (o: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(o));
  };
  const assert = (k: string, c: string, steps?: number) => {
    const life: Life = steps ? { kind: "steps", n: steps } : { kind: "sustained" };
    send({ op: "assert", role: "human", fact: { key: k, clause: c, weight: 5, life } });
  };

  if (!visible) return null;

  const Sep = () => <span className="h-5 w-px bg-white/15" />;

  return (
    <div className="absolute top-0 inset-x-0 z-40 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-white/15 bg-black/85 backdrop-blur-sm px-3 py-2 text-white shadow-lg">
      {/* Header + who switch */}
      <div className="flex items-center gap-2">
        <span className={cn("w-2 h-2 rounded-full", connected ? "bg-emerald-400" : "bg-red-500")} />
        <span className="font-mono text-[11px] uppercase tracking-widest text-white/80 whitespace-nowrap">Human Director</span>
      </div>
      <div className="flex items-center gap-1">
        {MODES.map((mo) => (
          <button key={mo} className={btn(mode === mo)} onClick={() => send({ op: "mode", mode: mo })}>
            {mo}
          </button>
        ))}
      </div>
      <Sep />

      {/* Weather / time */}
      <div className="flex items-center gap-1">
        {WEATHER.map((w) => (
          <button key={w.label} className={btn()} onClick={() => assert(w.key, w.clause)}>
            {w.label}
          </button>
        ))}
        <button className={btn()} onClick={() => send({ op: "retract", role: "human", key: "env:weather" })}>
          clr wx
        </button>
        <button className={btn()} onClick={() => send({ op: "retract", role: "human", key: "env:time" })}>
          clr time
        </button>
      </div>
      <Sep />

      {/* Spawns */}
      <div className="flex items-center gap-1">
        {SPAWNS.map((s) => (
          <button key={s.label} className={btn()} onClick={() => assert(s.key, s.clause, s.steps)}>
            {s.label}
          </button>
        ))}
      </div>
      <Sep />

      {/* Vitals */}
      <div className="flex items-center gap-1">
        {VITALS.map((v) => (
          <button key={v.label} className={btn()} onClick={() => send({ op: "vital", role: "human", change: v.change })}>
            {v.label}
          </button>
        ))}
      </div>
      <Sep />

      {/* Custom fact */}
      <div className="flex items-center gap-1">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="key"
          className="h-7 w-28 rounded border border-white/15 bg-white/5 px-2 font-mono text-[11px] text-white/80 placeholder:text-white/25"
        />
        <input
          value={clause}
          onChange={(e) => setClause(e.target.value)}
          placeholder="clause of prose…"
          className="h-7 w-40 rounded border border-white/15 bg-white/5 px-2 font-mono text-[11px] text-white/80 placeholder:text-white/25"
        />
        <button
          className={btn()}
          onClick={() => {
            if (key.trim() && clause.trim()) assert(key.trim(), clause.trim());
          }}
        >
          assert
        </button>
        <button className={btn()} onClick={() => send({ op: "clear" })}>
          clear
        </button>
      </div>

      {/* Live readout + close, pushed right */}
      <div className="ml-auto flex items-center gap-2 min-w-0">
        <span className="font-mono text-[10px] text-amber-200/80 whitespace-nowrap">
          {vitals ? `HP ${vitals.health}/${vitals.maxHealth}` : "HP —"}
        </span>
        <span
          className="font-mono text-[10px] text-emerald-200/70 truncate max-w-[16rem]"
          title={facts || "—"}
        >
          {facts || "—"}
        </span>
        <button className="text-white/50 hover:text-white text-sm leading-none" onClick={onClose}>
          ✕
        </button>
      </div>

      {!wsUrl && (
        <p className="w-full font-mono text-[10px] text-amber-300/80">
          Set NEXT_PUBLIC_COORDINATOR_WS (and run the coordinator) to enable the human director.
        </p>
      )}
    </div>
  );
}
