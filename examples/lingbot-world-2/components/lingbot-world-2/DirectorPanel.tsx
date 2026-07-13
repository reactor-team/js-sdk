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
  // Runtime-switchable coordinator WS (no rebuild needed). Priority: a user
  // override saved in localStorage -> build-time NEXT_PUBLIC_COORDINATOR_WS ->
  // derived from the player coordinator URL (http->ws). Editable in the panel.
  const [wsUrl, setWsUrlState] = useState<string>(
    () => process.env.NEXT_PUBLIC_COORDINATOR_WS || "ws://localhost:8090",
  );
  useEffect(() => {
    const saved =
      typeof window !== "undefined"
        ? window.localStorage.getItem("coordinatorWs")
        : null;
    if (saved) setWsUrlState(saved);
  }, []);
  const setWsUrl = (v: string) => {
    setWsUrlState(v);
    if (typeof window !== "undefined") {
      if (v) window.localStorage.setItem("coordinatorWs", v);
      else window.localStorage.removeItem("coordinatorWs");
      // let the Player reconnect its coordinator socket at runtime (no restart).
      window.dispatchEvent(new CustomEvent("coordinator-ws", { detail: v }));
    }
  };
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [gameName, setGameName] = useState("");
  const [facts, setFacts] = useState("");
  const [vitals, setVitals] = useState<{ health: number; maxHealth: number; inventory: string[] } | null>(null);
  const [mode, setMode] = useState("both");
  const [key, setKey] = useState("");
  const [clause, setClause] = useState("");
  const [sceneEvents, setSceneEvents] = useState<
    { name: string; clause: string; health?: number; addItem?: string }[]
  >([]);

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
        else if (m.type === "scene_events") setSceneEvents(m.events || []);
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

  // Per-game update, coordinator-independent: the controller broadcasts the
  // active scene's director events (localStorage + a window event) whenever a
  // scene is selected, so this panel's scene-event buttons update per game even
  // with no coordinator connected. The WS `scene_events` message (above) still
  // overrides when a coordinator is live.
  useEffect(() => {
    const load = (list: unknown) => {
      if (Array.isArray(list)) setSceneEvents(list as typeof sceneEvents);
    };
    try {
      const raw =
        typeof window !== "undefined"
          ? window.localStorage.getItem("directorSceneEvents")
          : null;
      if (raw) load(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    const onEv = (e: Event) => load((e as CustomEvent).detail);
    if (typeof window !== "undefined")
      window.addEventListener("director-scene-events", onEv);
    return () => {
      if (typeof window !== "undefined")
        window.removeEventListener("director-scene-events", onEv);
    };
  }, [visible]);

  // Selected game title, broadcast by the controller on scene select.
  useEffect(() => {
    const set = (n: unknown) => setGameName(typeof n === "string" ? n : "");
    try {
      if (typeof window !== "undefined")
        set(window.localStorage.getItem("activeSceneName"));
    } catch {
      /* ignore */
    }
    const onEv = (e: Event) => set((e as CustomEvent).detail);
    if (typeof window !== "undefined")
      window.addEventListener("active-scene-name", onEv);
    return () => {
      if (typeof window !== "undefined")
        window.removeEventListener("active-scene-name", onEv);
    };
  }, [visible]);

  const send = (o: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(o));
  };
  const assert = (k: string, c: string, steps?: number) => {
    const life: Life = steps ? { kind: "steps", n: steps } : { kind: "sustained" };
    send({ op: "assert", role: "human", fact: { key: k, clause: c, weight: 5, life } });
  };
  // Fire a director-owned scene event: assert its clause (prominent, sustained)
  // and apply any vitals it carries (e.g. a "die" event sets health).
  const fireEvent = (ev: { name: string; clause: string; health?: number; addItem?: string }) => {
    const k = "scene:" + ev.name.toLowerCase().replace(/\s+/g, "_");
    send({ op: "assert", role: "human", fact: { key: k, clause: ev.clause, weight: 2, life: { kind: "sustained" } } });
    if (ev.health !== undefined || ev.addItem) {
      send({ op: "vital", role: "human", change: { health: ev.health, addItem: ev.addItem } });
    }
  };

  if (!visible) return null;

  const Sep = () => <span className="h-5 w-px bg-white/15" />;

  return (
    <div
      className="relative z-40 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-white/15 bg-black/85 backdrop-blur-sm px-3 py-2 text-white shadow-lg"
      onMouseDownCapture={(e) => {
        // Clicking a director BUTTON must not steal keyboard focus from the game,
        // so the player can drive WASD/hold-keys and fire director events at the
        // same time. Inputs (key/clause/ws) keep normal focus.
        if ((e.target as HTMLElement).closest("button")) e.preventDefault();
      }}
    >
      {/* Header + who switch */}
      <div className="flex items-center gap-2">
        <span className={cn("w-2 h-2 rounded-full", connected ? "bg-emerald-400" : "bg-red-500")} />
        <span className="font-mono text-[11px] uppercase tracking-widest text-white/80 whitespace-nowrap">Human Director</span>
        {gameName && (
          <span className="font-mono text-[11px] text-emerald-300/90 whitespace-nowrap">· {gameName}</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {MODES.map((mo) => (
          <button key={mo} className={btn(mode === mo)} onClick={() => send({ op: "mode", mode: mo })}>
            {mo}
          </button>
        ))}
      </div>
      <Sep />

      {/* Scene events (director-owned: scene change / death) from the active scene */}
      {sceneEvents.length > 0 && (
        <>
          <div className="flex items-center gap-1">
            <span className="font-mono text-[9px] uppercase tracking-wider text-white/40">scene</span>
            {sceneEvents.map((ev) => (
              <button key={ev.name} className={btn()} title={ev.clause} onClick={() => fireEvent(ev)}>
                {ev.name}
              </button>
            ))}
          </div>
          <Sep />
        </>
      )}

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

      {!connected && (
        <div className="w-full flex items-center gap-2">
          <span className="font-mono text-[10px] text-white/40 whitespace-nowrap">
            coordinator ws
          </span>
          <input
            className="flex-1 min-w-0 rounded border border-white/15 bg-white/5 px-2 py-0.5 font-mono text-[10px] text-white/80 outline-none focus:border-emerald-400/50"
            placeholder="ws://localhost:8080/director"
            value={wsUrl}
            spellCheck={false}
            onChange={(e) => setWsUrl(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
