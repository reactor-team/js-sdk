"use client";

// Always-visible activity view fed by watch_activity.py (via /api/activity, which
// tails coordinator/activity.log). Shows the same stream the headless listener
// prints — AI director fires, player actions, game switches — without opening the
// Director panel. Polls every 2s. Empty until watch_activity.bat is running.

import { useEffect, useState } from "react";

export function ActivityTicker() {
  const [lines, setLines] = useState<string[]>([]);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/activity", { cache: "no-store" });
        const j = (await r.json()) as { lines?: string[]; ok?: boolean };
        if (alive) {
          setLines(j.lines ?? []);
          setOk(!!j.ok);
        }
      } catch {
        /* ignore transient fetch errors */
      }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4">
      <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-white/40">
        activity · {ok ? `${lines.length} lines` : "run watch_activity.bat"}
      </div>
      <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto mono-xs leading-tight text-white/70">
        {lines.length === 0 ? (
          <span className="text-white/30">— start watch_activity.bat to stream activity here —</span>
        ) : (
          lines.map((l, i) => (
            <span
              key={i}
              className={
                l.startsWith("ai")
                  ? "text-emerald-200/90"
                  : l.startsWith("human")
                    ? "text-sky-200/80"
                    : "text-white/70"
              }
            >
              {l}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
