"use client";

import { useEffect, useState } from "react";
import {
  useLingbotV2,
  useLingbotV2State,
  type LingbotV2StateMessage,
} from "@reactor-models/lingbot-v2";
import { CAMERA_MOVES } from "../lib/camera-moves";

// Live-phase panel — Lingbot 2's native camera-pose layer on a
// clickable surface.
//
// Where MovementControls speaks the high-level axes (WASD + look),
// this panel drives `set_camera_pose`: a per-chunk 6-float motion
// delta the model applies directly to the camera. One click activates
// a curated cinematographic move (orbit, push-in, crane); re-clicking
// the active move sends an empty list, which deactivates the layer.
//
// Single-active, like DynamicEvents: each press fully determines the
// pose the model sees, so there's no ambiguity about what's applied.
//
// Highlighting reads LOCAL selection state (same rationale as the
// movement pad — the snapshot lags a chunk). The snapshot's
// `camera_pose_active` flag is still consulted as a safety net: if
// the model reports the layer inactive while we think a move is
// selected (e.g. another surface cleared it), we drop our selection
// so the UI can't show a phantom active move.
//
// While a pose is active its rotation OVERRIDES the arrow-key look
// axes and its translation ADDS to WASD — the caption under the
// buttons says so, because otherwise "my arrow keys stopped working"
// looks like a bug.
export function CameraPose() {
  const { status, setCameraPose } = useLingbotV2();
  const [snapshot, setSnapshot] = useState<LingbotV2StateMessage | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useLingbotV2State((msg) => setSnapshot(msg));

  // Clear on disconnect, like every snapshot-holding component.
  useEffect(() => {
    if (status !== "ready") {
      setSnapshot(null);
      setActiveId(null);
    }
  }, [status]);

  // Safety net: trust the model over local state. If the snapshot
  // says the pose layer is inactive (reset, or cleared elsewhere),
  // drop the local selection.
  useEffect(() => {
    if (snapshot && !snapshot.camera_pose_active) setActiveId(null);
  }, [snapshot]);

  if (status !== "ready" || !snapshot?.started) return null;

  async function apply(id: string) {
    if (activeId === id) {
      // Toggle off — empty list deactivates the layer and hands the
      // camera back to the look axes.
      setActiveId(null);
      await setCameraPose({ camera_pose: [] });
      return;
    }

    const move = CAMERA_MOVES.find((m) => m.id === id);
    if (!move) return;
    setActiveId(id);
    await setCameraPose({ camera_pose: [...move.pose] });
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <label className="text-[10px] uppercase tracking-wider text-zinc-500">
        Camera moves
      </label>

      <p className="mt-1 text-[11px] leading-snug text-zinc-500">
        Preset cinematographic moves via the native camera-pose layer. While one
        is active, it overrides the arrow-key look and adds to WASD. Re-click to
        release the camera.
      </p>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {CAMERA_MOVES.map((move) => {
          const active = activeId === move.id;
          return (
            <button
              key={move.id}
              onClick={() => apply(move.id)}
              className={`rounded-md border p-2 text-center text-[11px] font-medium transition-colors ${
                active
                  ? "border-brand bg-zinc-900 text-brand"
                  : "border-zinc-800 bg-zinc-950 text-zinc-200 hover:border-brand hover:text-brand"
              }`}
              title={move.description}
            >
              {move.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
