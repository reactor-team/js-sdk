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

// One entry of the live activity feed broadcast by the coordinator.
type ActivityEntry = {
  id: number;
  role: string; // "ai" | "human" | "player" | "?"
  op: string; // assert | retract | vital | count | clear
  key?: string;
  clause?: string;
  change?: { health?: number; setHealth?: number; addItem?: string; removeItem?: string };
  name?: string; // the action that caused a vital (e.g. "Machete Slash")
  slug?: string; // for op:"game" — the game switched to
  cmd?: string; // for op:"log" — "look" (heartbeat) | "error" | "action"
  detail?: unknown; // for op:"log" — error text / payload
  ts?: string; // HH:MM:SS stamped on arrival in the browser (for the feed)
};

const MODES = ["human", "ai", "both"] as const;

// Human-readable label for an activity entry (e.g. "Shark Appears", "health -8").
function activityLabel(a: ActivityEntry): string {
  if (a.op === "assert" && a.key?.startsWith("scene:")) {
    return a.key
      .slice(6)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()); // scene:shark_appears -> Shark Appears
  }
  if (a.op === "assert") return a.key ?? a.clause ?? "assert";
  if (a.op === "retract") return `drop ${a.key ?? ""}`.trim();
  if (a.op === "vital") {
    const c = a.change ?? {};
    const bits: string[] = [];
    if (c.setHealth !== undefined) bits.push(`health =${c.setHealth}`);
    if (c.health !== undefined) bits.push(`health ${c.health >= 0 ? "+" : ""}${c.health}`);
    if (c.addItem) bits.push(`+${c.addItem}`);
    if (c.removeItem) bits.push(`-${c.removeItem}`);
    const effect = bits.join(", ") || "vital";
    return a.name ? `${a.name}  (${effect})` : effect; // show WHICH action caused it
  }
  if (a.op === "count") return "spawn/kill";
  if (a.op === "clear") return "clear all";
  if (a.op === "game") return `game → ${a.name ?? a.slug ?? ""}`;
  if (a.op === "hello") return "director connected";
  if (a.op === "bye") return "director disconnected";
  if (a.op === "log") {
    // AI-director heartbeat / error / player action. cmd distinguishes them.
    if (a.cmd === "error") return `⚠ ${typeof a.detail === "string" ? a.detail : "error"}`;
    return a.name ?? "action"; // "look" heartbeat carries its label in name
  }
  return a.op;
}

// Alphabetic hotkeys for director scene events — MUST stay in sync with
// DIRECTOR_HOTKEYS in LingbotWorldController.tsx (the source of truth). The i-th
// SCENE button is fired by the i-th letter, both by clicking here and by the
// player's keyboard, so the character can be driven and directed at once.
const DIRECTOR_HOTKEYS = "tyupfghbnvxz";

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
  const [mode, setMode] = useState("human"); // matches the coordinator default until it broadcasts
  const [key, setKey] = useState("");
  const [clause, setClause] = useState("");
  const [objective, setObjective] = useState<{ summary?: string; director?: string } | null>(null);
  const [showState, setShowState] = useState(false); // optional coordinator-state view
  const [optionsOpen, setOptionsOpen] = useState(true); // fold the scene-event fire buttons (headline stays)
  const [coordFacts, setCoordFacts] = useState<
    { key: string; clause: string; weight: number; remaining: string }[]
  >([]);
  const [rawState, setRawState] = useState<Record<string, unknown> | null>(null); // full state snapshot
  const [sceneEvents, setSceneEvents] = useState<
    { name: string; clause: string; health?: number; addItem?: string; count?: number; available?: boolean }[]
  >([]);
  const [count, setCount] = useState(0); // shared entity/spawn count
  // Live activity feed — who did what (esp. the AI director's fires), newest first.
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const activityBoxRef = useRef<HTMLDivElement>(null); // to keep the newest row in view

  useEffect(() => {
    if (!visible || !wsUrl) return;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => { console.log(`[panel] connected to coordinator ${wsUrl}`); setConnected(true); };
    ws.onclose = () => { console.log("[panel] coordinator socket closed"); setConnected(false); };
    ws.onerror = () => { console.log("[panel] coordinator socket error"); setConnected(false); };
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(String(e.data));
        if (m.type === "facts") setFacts(m.prompt || "");
        else if (m.type === "mode") setMode(m.mode);
        else if (m.type === "scene_events") setSceneEvents(m.events || []);
        else if (m.type === "objective") setObjective(m.objective || null);
        else if (m.type === "count") setCount(m.count ?? 0);
        else if (m.type === "state") {
          setCoordFacts(m.facts || []);
          if (typeof m.count === "number") setCount(m.count);
          setRawState(m); // keep the full snapshot for the raw view
        } else if (m.type === "activity") {
          const entry = m as ActivityEntry & { type: string };
          // Stamp arrival time (browser local, HH:MM:SS) so each feed row is timed.
          entry.ts = new Date().toLocaleTimeString(undefined, { hour12: false });
          // Debug: confirm activity broadcasts reach the browser (F12 -> Console).
          console.log(`[panel] activity: ${entry.role} ${entry.op} ${entry.key ?? entry.name ?? ""}`, entry);
          setActivity((prev) => [...prev, entry].slice(-40)); // keep INCOMING order (newest at bottom), cap 40
        }
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

  // Keep the newest activity row in view (feed is in arrival order, newest last).
  useEffect(() => {
    const el = activityBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activity]);

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

  // Active objective (summary + director intent), coordinator-independent —
  // same localStorage + window-event bridge as scene events.
  useEffect(() => {
    const load = (o: unknown) =>
      setObjective(o && typeof o === "object" ? (o as { summary?: string; director?: string }) : null);
    try {
      const raw =
        typeof window !== "undefined" ? window.localStorage.getItem("directorObjective") : null;
      if (raw) load(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    const onEv = (e: Event) => load((e as CustomEvent).detail);
    if (typeof window !== "undefined") window.addEventListener("director-objective", onEv);
    return () => {
      if (typeof window !== "undefined") window.removeEventListener("director-objective", onEv);
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
  const fireEvent = (ev: { name: string; clause: string; health?: number; addItem?: string; count?: number }) => {
    const k = "scene:" + ev.name.toLowerCase().replace(/\s+/g, "_");
    send({ op: "assert", role: "human", fact: { key: k, clause: ev.clause, weight: 2, life: { kind: "sustained" } } });
    if (ev.health !== undefined || ev.addItem) {
      send({ op: "vital", role: "human", change: { health: ev.health, addItem: ev.addItem } });
    }
    // Spawn/kill: bump the shared entity count when the event carries a delta.
    if (ev.count) send({ op: "count", role: "human", delta: ev.count });
  };

  if (!visible) return null;

  const Sep = () => <span className="h-5 w-px bg-white/15" />;
  // In AI-only mode the human's ops are dropped by the coordinator anyway, so
  // disable the human-action buttons for clear feedback. The who-switch and
  // feed toggle stay enabled so you can switch back.
  const humanDisabled = mode === "ai";

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
        <span className="font-mono text-[11px] uppercase tracking-widest text-white/80 whitespace-nowrap">
          {mode === "ai"
            ? "AI Director"
            : mode === "both"
              ? "Human + AI Director"
              : "Human Director"}
        </span>
        {gameName && (
          <span className="font-mono text-[11px] text-emerald-300/90 whitespace-nowrap">· {gameName}</span>
        )}
        {count > 0 && (
          <span
            className="font-mono text-[11px] text-amber-300/90 whitespace-nowrap"
            title="Shared entity/spawn count — bumped by director spawn/kill events"
          >
            · {count} spawned
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {MODES.map((mo) => (
          <button key={mo} className={btn(mode === mo)} onClick={() => send({ op: "mode", mode: mo })}>
            {mo}
          </button>
        ))}
      </div>
      <button className={btn(showState)} onClick={() => setShowState((v) => !v)} title="Show the live coordinator state (History facts + lifetimes)">
        state
      </button>
      <Sep />

      {/* Objective — player goal (summary) + the Director agent's standing intent */}
      {objective && (objective.summary || objective.director) && (
        <div className="flex basis-full items-start gap-2 min-w-0">
          <span className="mono-label mt-0.5">objective</span>
          <div className="flex flex-col min-w-0 leading-tight">
            {objective.summary && (
              <span className="mono-xs text-sky-200/85 truncate" title={objective.summary}>
                <span className="text-white/40">player:</span> {objective.summary}
              </span>
            )}
            {objective.director && (
              <span className="mono-xs text-emerald-200/70 truncate" title={objective.director}>
                <span className="text-white/40">director:</span> {objective.director}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Optional coordinator-state view — live History facts + remaining lifetime */}
      {showState && (
        <div className="flex basis-full flex-col gap-0.5 rounded border border-white/10 bg-black/40 p-1.5 max-h-32 overflow-y-auto">
          <span className="mono-label">
            state · history · {coordFacts.length} fact{coordFacts.length === 1 ? "" : "s"}
          </span>
          {coordFacts.length === 0 ? (
            <span className="mono-xs text-white/30">— empty —</span>
          ) : (
            coordFacts.map((f) => (
              <div key={f.key} className="flex items-start gap-1.5 mono-xs">
                <span className="shrink-0 rounded bg-white/10 px-1 text-emerald-200/80">{f.remaining}</span>
                <span className="shrink-0 text-sky-200/70">{f.key}</span>
                <span className="text-white/60 truncate" title={f.clause}>{f.clause}</span>
              </div>
            ))
          )}
          {/* Raw state snapshot — the full coordinator state object as JSON */}
          {rawState && (
            <>
              <span className="mt-1 mono-label">
                raw state
              </span>
              <pre className="whitespace-pre-wrap break-all font-mono text-[9px] leading-tight text-white/55">
                {JSON.stringify(rawState, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}

      {/* Scene events (director-owned: scene change / death) from the active scene */}
      {sceneEvents.length > 0 && (
        <>
          <div className="flex basis-full flex-wrap items-center gap-1 min-w-0">
            <button
              type="button"
              onClick={() => setOptionsOpen((v) => !v)}
              className="mono-label hover:text-white/70 shrink-0"
              title={optionsOpen ? "Collapse director options" : "Expand director options"}
            >
              {optionsOpen ? "▾" : "▸"} scene · {sceneEvents.length}
            </button>
            {optionsOpen &&
              sceneEvents.map((ev, i) => (
              <button
                key={ev.name}
                // Only LOCKED events are disabled-greyed. In AI mode the human can't
                // fire, but VALID events still show at full opacity (so you can see
                // what the AI could fire) — made non-clickable via pointer-events-none.
                disabled={ev.available === false}
                className={cn(
                  btn(),
                  "whitespace-nowrap",
                  ev.available === false && "opacity-40",
                  humanDisabled && "pointer-events-none cursor-default",
                )}
                title={
                  ev.available === false
                    ? `${ev.name} — locked (prerequisite not met yet)`
                    : humanDisabled
                      ? `${ev.name} — valid; AI director fires it (not clickable)`
                      : ev.clause
                }
                onClick={() => fireEvent(ev)}
              >
                {DIRECTOR_HOTKEYS[i] && (
                  <kbd className="mr-1 rounded bg-white/15 px-1 font-mono text-[9px] uppercase text-emerald-200/90">
                    {DIRECTOR_HOTKEYS[i]}
                  </kbd>
                )}
                {ev.name}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Live activity feed — who fired what (esp. the AI director), newest first.
          Always shown, with a live status line, so an empty feed is diagnosable. */}
      {(
        <div ref={activityBoxRef} className="flex basis-full flex-col gap-0.5 rounded border border-white/10 bg-black/40 p-1.5 max-h-28 overflow-y-auto">
          {activity.length === 0 && (
            <span className="mono-xs text-white/30">
              waiting… player actions + ai fires appear here
            </span>
          )}
          {activity.map((a) => (
            <div key={a.id} className="flex items-start gap-1.5 mono-xs">
              {a.ts && <span className="shrink-0 tabular-nums text-white/30">{a.ts}</span>}
              <span
                className={cn(
                  "shrink-0 rounded px-1 uppercase",
                  a.role === "ai"
                    ? "bg-emerald-400/20 text-emerald-200/90"
                    : a.role === "human"
                      ? "bg-sky-400/20 text-sky-200/90"
                      : "bg-white/10 text-white/60",
                )}
              >
                {a.role}
              </span>
              <span className="shrink-0 text-white/80">{activityLabel(a)}</span>
              {a.clause && (
                <span className="text-white/40 truncate" title={a.clause}>
                  {a.clause}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Custom fact */}
      <div className="flex items-center gap-1">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          disabled={humanDisabled}
          placeholder="key"
          className="h-7 w-28 rounded border border-white/15 bg-white/5 px-2 font-mono text-[11px] text-white/80 placeholder:text-white/25 disabled:opacity-30"
        />
        <input
          value={clause}
          onChange={(e) => setClause(e.target.value)}
          disabled={humanDisabled}
          placeholder="clause of prose…"
          className="h-7 w-40 rounded border border-white/15 bg-white/5 px-2 font-mono text-[11px] text-white/80 placeholder:text-white/25 disabled:opacity-30"
        />
        <button
          className={btn()}
          disabled={humanDisabled}
          onClick={() => {
            if (key.trim() && clause.trim()) assert(key.trim(), clause.trim());
          }}
        >
          assert
        </button>
        <button className={btn()} disabled={humanDisabled} onClick={() => send({ op: "clear" })}>
          clear
        </button>
      </div>

      {/* Live projected-prompt readout + close, pushed right */}
      <div className="ml-auto flex items-center gap-2 min-w-0">
        <span
          className="mono-xs text-emerald-200/70 truncate max-w-[16rem]"
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
          <span className="mono-xs text-white/40 whitespace-nowrap">
            coordinator ws
          </span>
          <input
            className="flex-1 min-w-0 rounded border border-white/15 bg-white/5 px-2 py-0.5 mono-xs text-white/80 outline-none focus:border-emerald-400/50"
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
