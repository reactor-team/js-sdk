"use client";

import { useEffect, useState } from "react";
import {
  useViskoOrbisStable,
  useViskoState,
  useCommandError,
  useChunkComplete,
  type StateMessage,
  type CommandErrorMessage,
  type ChunkCompleteMessage,
} from "../lib/visko";

// Connection lifecycle + the model's command errors, one panel.
//
// This is the ONLY place a reader needs to look for "is it working?" — a
// bare spinner or a wrong "Disconnected" is the single biggest lie a
// real-time model frontend can tell, so this badge keeps the truth
// visible through every slow / failure phase:
//
//   - connecting / waiting — placing the session. Measured warm-pod
//     placement is seconds (9.5–13.3 s in this week's e2e runs) — the
//     badge's progress label is the honest signal here; no separate
//     wait-explainer copy (it once claimed "a few minutes", which was
//     stale and was removed at user direction).
//   - priming — after start, the FIRST chunk emits 0 frames (SR warmup).
//     First picture ~2 chunks / ~4 s. Brief, so "you may briefly see this".
//   - capacity — a 429 means the pod is BUSY, not gone. We auto-retry
//     with backoff and say so; never surface 429 as a bare disconnect.
//   - command_error — the model rejected a command (bad precondition /
//     bad input). Without this, failures are silent clicks.
const TONE: Record<string, { dot: string; label: string }> = {
  disconnected: { dot: "bg-zinc-500", label: "Disconnected" },
  connecting: { dot: "bg-amber-400 animate-pulse", label: "Placing session…" },
  waiting: {
    dot: "bg-amber-400 animate-pulse",
    label: "Starting up…",
  },
  priming: {
    dot: "bg-amber-400 animate-pulse",
    label: "Priming stream — first frames…",
  },
  capacity: {
    dot: "bg-amber-400 animate-pulse",
    label: "At capacity — retrying…",
  },
  ready: { dot: "bg-active", label: "Connected" },
};

const RETRY_DELAYS_MS = [3000, 3000, 4000, 5000, 6000, 8000, 10000, 10000];

function isCapacityError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /429|no available capacity|none is currently available/i.test(msg);
}

export function StatusBadge() {
  const { status, lastError, connect, disconnect } = useViskoOrbisStable();
  const [priming, setPriming] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [retryIn, setRetryIn] = useState<number | null>(null);
  const [commandError, setCommandError] = useState<{
    command: string;
    reason: string;
  } | null>(null);

  useViskoState((msg: StateMessage) => {
    if (msg.started) setPriming(true);
    // Any state update implies the user has moved on — clear the error chip.
    setCommandError(null);
  });
  useChunkComplete((m: ChunkCompleteMessage) => {
    // SR warmup ends with the first nonzero-frame chunk.
    if ((m.frames_emitted ?? 0) > 0) setPriming(false);
  });
  useCommandError((msg: CommandErrorMessage) => {
    setCommandError({
      command: msg.command,
      reason: msg.reason,
    });
  });

  const capacity = status === "disconnected" && isCapacityError(lastError);

  useEffect(() => {
    if (status !== "ready") {
      setPriming(false);
      setRetryCount(0);
      setRetryIn(null);
    }
  }, [status]);

  // Auto-retry through 429 capacity with backoff, with a live countdown
  // so the wait reads as "working", not "stuck". Stops when capacity
  // clears or the user manually retries.
  useEffect(() => {
    if (!capacity) return;
    if (retryCount >= RETRY_DELAYS_MS.length) return;

    const delay =
      RETRY_DELAYS_MS[Math.min(retryCount, RETRY_DELAYS_MS.length - 1)];
    setRetryIn(Math.ceil(delay / 1000));
    const countdown = setInterval(() => {
      setRetryIn((s) => (s === null || s <= 1 ? null : s - 1));
    }, 1000);
    const timer = setTimeout(() => {
      setRetryCount((c) => c + 1);
      connect();
    }, delay);
    return () => {
      clearTimeout(timer);
      clearInterval(countdown);
    };
  }, [capacity, retryCount, connect]);

  const effective = capacity
    ? "capacity"
    : priming && status === "ready"
      ? "priming"
      : status;
  const tone = TONE[effective] ?? TONE.disconnected;
  const idle = status === "disconnected" && !capacity;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
          <span className="text-sm text-zinc-200">{tone.label}</span>
        </div>
        {idle ? (
          <button
            onClick={() => connect()}
            className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-brand-fg hover:opacity-90"
          >
            Connect
          </button>
        ) : capacity ? (
          <button
            onClick={() => {
              setRetryCount(0);
              setRetryIn(null);
              disconnect();
            }}
            className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Retrying{retryIn !== null ? ` (${retryIn}s)` : ""}
          </button>
        ) : (
          <button
            onClick={() => disconnect()}
            className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Disconnect
          </button>
        )}
      </div>

      {(status === "connecting" || status === "waiting") && null}

      {capacity && (
        <p className="mt-2 text-[11px] leading-snug text-zinc-500">
          The pod is busy (one session per deployment). Retrying automatically —
          it frees in ~1–2 min after a hard exit.
        </p>
      )}

      {commandError && (
        <p className="mt-2 border-t border-zinc-800 pt-2 text-xs text-red-400">
          <span className="font-mono text-red-500">{commandError.command}</span>
          {" — "}
          {commandError.reason}
        </p>
      )}
    </div>
  );
}
