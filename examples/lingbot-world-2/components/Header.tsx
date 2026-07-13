"use client";

import { useEffect, useState } from "react";

export function Header() {
  // Selected game title, broadcast by the controller on scene select (same
  // localStorage + window-event bridge the Director panel uses). Shown in place
  // of the tagline once a game is loaded.
  const [gameName, setGameName] = useState("");
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
  }, []);

  return (
    <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/40 px-4 py-3 lg:px-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-sm font-semibold tracking-tight text-zinc-100">
          LingBot World 2
        </h1>
        {gameName ? (
          <span className="hidden border-l border-zinc-800 pl-3 text-xs font-medium tracking-tight text-emerald-300/90 sm:inline">
            {gameName}
          </span>
        ) : (
          <span className="hidden border-l border-zinc-800 pl-3 text-[11px] uppercase tracking-wider text-zinc-500 sm:inline">
            Real-time interactive world model
          </span>
        )}
      </div>
      <span className="text-[11px] uppercase tracking-wider text-zinc-500">
        Powered by Reactor
      </span>
    </header>
  );
}
