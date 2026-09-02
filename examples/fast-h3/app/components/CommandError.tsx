"use client";

import { useState } from "react";
import {
  useFastH3CommandError,
  useFastH3StateUpdate,
} from "@reactor-models/fast-h3";

// Every refused command broadcasts `command_error` with the reason — a full
// generation queue, an unknown clip id, an empty prompt. Surfacing it is
// non-negotiable: silent refusals are the #1 confusion source.
export function CommandError() {
  const [err, setErr] = useState<{ command: string; reason: string } | null>(
    null,
  );
  useFastH3CommandError((m) =>
    setErr({ command: m.command, reason: m.reason }),
  );
  // Any accepted state change means the user moved on.
  useFastH3StateUpdate(() => setErr(null));
  if (!err) return null;
  return (
    <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-300">
      <span className="font-mono">{err.command}</span> refused: {err.reason}
    </div>
  );
}
