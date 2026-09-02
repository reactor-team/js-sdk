"use client";

import { useFastH3 } from "@reactor-models/fast-h3";

// The four-state connection machine, surfaced visibly:
//   disconnected → connecting → waiting → ready
//
// Deliberately no Connect button: connecting is not a user action in this
// app. You compose an episode first, and "Queue episode" connects on
// demand the moment there is something to build — sessions only run while
// they have work. Disconnect stays, as the way to end a session early.
const TONE: Record<string, { dot: string; label: string }> = {
  disconnected: { dot: "bg-zinc-500", label: "Offline" },
  connecting: { dot: "bg-blue-500 animate-pulse", label: "Connecting…" },
  waiting: { dot: "bg-blue-500 animate-pulse", label: "Waiting for GPU…" },
  ready: { dot: "bg-active animate-pulse", label: "Connected" },
};

export function StatusBadge() {
  const { status, lastError, disconnect } = useFastH3();
  const tone = TONE[status] ?? TONE.disconnected;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
          <span className="text-sm text-zinc-200">{tone.label}</span>
        </div>
        {status !== "disconnected" && (
          <button
            onClick={() => void disconnect()}
            className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300"
          >
            Disconnect
          </button>
        )}
      </div>
      {status === "disconnected" && (
        <p className="mt-1.5 text-[11px] text-zinc-600">
          Connects on its own when you queue an episode.
        </p>
      )}
      {lastError && (
        <p className="mt-2 text-xs text-red-400">{lastError.message}</p>
      )}
    </div>
  );
}
