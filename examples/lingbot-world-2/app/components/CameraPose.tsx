"use client";

import { useEffect, useRef, useState } from "react";
import {
  useLingbotWorld2,
  useLingbotWorld2ChunkComplete,
  useLingbotWorld2State,
  type LingbotWorld2StateMessage,
} from "@reactor-models/lingbot-world-2";
import {
  CAMERA_MOVES,
  composeCameraPrompt,
  findCameraMoveById,
  stripCameraPromptHints,
  type CameraMove,
} from "../lib/camera-moves";

// Live-phase panel — LingBot World 2's native camera-pose layer on a
// clickable surface.
//
// Where MovementControls speaks the high-level axes (WASD + look),
// this panel drives `set_camera_pose`: per-frame 6-float motion
// deltas the model applies directly to the camera. Two kinds of
// preset (see app/lib/camera-moves.ts):
//
//   - SUSTAINED — click to hold, re-click to release. The camera
//     keeps the move's velocity until the empty-list send hands it
//     back to the look axes.
//   - ONE-SHOT — click to run. The move spans a fixed number of
//     chunks with an eased velocity envelope; the panel streams one
//     slice per chunk and releases the camera automatically when the
//     move completes. Re-click mid-move to cancel.
//
// PROMPT COUPLING — the pattern that makes moves land consistently.
// The pose layer is a bias, not a rig: the lab scene prompts describe
// a stationary subject and camera, so pose-only moves fight the text
// conditioning and sometimes drag the subject along with the camera.
// Each move therefore carries a `promptHint` sentence — in the lab
// prompts' own vocabulary, the camera moves while the subject "stays
// perfectly still" — that we compose onto the current prompt via
// `set_prompt` on activation and strip again on release. Both channels
// then tell the model the same story. Strip-by-verbatim-sentence keeps this stateless — no
// captured base to desync. Known limitation: DynamicEvents rebuilds
// the prompt entirely from ITS state, so clicking a world event
// mid-move drops the camera hint (the pose layer keeps running, the
// move just loses its text reinforcement — degraded, not broken).
//
// CHUNK CLOCKING — the pattern that makes multi-chunk moves work.
// One `set_camera_pose` call conditions one chunk, so a move longer
// than a chunk means sending successive slices. `chunk_complete` is
// the clock: each tick advances a cursor and sends the next slice
// (or the empty list when the move is done). Sustained moves need no
// ticking — a constant velocity persists server-side until replaced.
// Timing is chunk-quantized and off by at most one chunk (the tick
// for a chunk generated before our first slice landed), which is
// inherent to the transport and invisible in practice.
//
// Single-active, like DynamicEvents: each press fully determines the
// pose the model sees, so there's no ambiguity about what's applied.
//
// Highlighting reads LOCAL selection state (same rationale as the
// movement pad — the snapshot lags a chunk). The snapshot's
// `camera_pose_active` flag is still consulted as a safety net: if
// the model reports the layer inactive while we think a move is
// selected (e.g. another surface cleared it), we drop our selection
// so the UI can't show a phantom active move. One-shots get a grace
// window for this check — the flag genuinely reads false until the
// first slice reaches the model.
//
// While a pose is active its rotation OVERRIDES the arrow-key look
// axes and its translation ADDS to WASD — the caption under the
// buttons says so, because otherwise "my arrow keys stopped working"
// looks like a bug.

const SUSTAINED_MOVES = CAMERA_MOVES.filter((m) => m.chunks === null);
const ONE_SHOT_MOVES = CAMERA_MOVES.filter((m) => m.chunks !== null);

export function CameraPose() {
  const { status, setCameraPose, setPrompt } = useLingbotWorld2();
  const [snapshot, setSnapshot] = useState<LingbotWorld2StateMessage | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Zero-based chunk cursor within the active move. State (not just a
  // ref) because one-shot buttons render it as progress ("2/6").
  const [cursor, setCursor] = useState(0);
  // The exact payload of the most recent send — the teaching layer.
  // Seeing "orbit is just [0, 0.04, 0, -0.35, 0, 0]" is what turns
  // the presets from magic buttons into a format users can author.
  const [lastPayload, setLastPayload] = useState<number[] | null>(null);

  // The chunk_complete handler needs the CURRENT move/cursor/prompt,
  // but the subscription lives for the component's lifetime — mirror
  // them in refs so the handler never closes over stale state.
  const activeRef = useRef<{ move: CameraMove; cursor: number } | null>(null);
  const snapshotRef = useRef<LingbotWorld2StateMessage | null>(null);

  useLingbotWorld2State((msg) => {
    snapshotRef.current = msg;
    setSnapshot(msg);
  });

  function clearSelection() {
    activeRef.current = null;
    setActiveId(null);
    setCursor(0);
    setLastPayload(null);
  }

  // Clear on disconnect, like every snapshot-holding component.
  useEffect(() => {
    if (status !== "ready") {
      snapshotRef.current = null;
      setSnapshot(null);
      clearSelection();
    }
  }, [status]);

  // Safety net: trust the model over local state. If the snapshot
  // says the pose layer is inactive (reset, or cleared elsewhere),
  // drop the local selection. Skip the very start of a move — the
  // flag lags our first send by up to a chunk. No prompt cleanup
  // here: this path fires when the session was reset or another
  // surface took over the pose, and re-sending a prompt from a
  // stale context would do more harm than a leftover hint sentence.
  useEffect(() => {
    if (
      snapshot &&
      !snapshot.camera_pose_active &&
      activeRef.current &&
      activeRef.current.cursor > 0
    ) {
      clearSelection();
    }
  }, [snapshot]);

  function sendPose(payload: number[]) {
    setLastPayload(payload.length > 0 ? payload : null);
    void setCameraPose({ camera_pose: payload });
  }

  // Strip the active move's hint from the current prompt — the
  // release half of prompt coupling. Reads the prompt off the latest
  // snapshot; a no-op if the hint is no longer there (e.g. a world
  // event rebuilt the prompt mid-move).
  function releasePrompt() {
    const prompt = snapshotRef.current?.current_prompt;
    if (typeof prompt !== "string") return;
    const stripped = stripCameraPromptHints(prompt);
    if (stripped !== prompt) void setPrompt({ prompt: stripped });
  }

  // The chunk clock. Every completed chunk advances the active
  // one-shot move: step to the next slice, or release the camera
  // (pose and prompt) when the last slice has played out. Sustained
  // moves don't tick — their constant velocity persists server-side.
  useLingbotWorld2ChunkComplete(() => {
    const active = activeRef.current;
    if (!active || active.move.chunks === null) return;

    const next = active.cursor + 1;
    if (next >= active.move.chunks) {
      // Move complete — release the camera back to the look axes.
      clearSelection();
      sendPose([]);
      releasePrompt();
      return;
    }

    activeRef.current = { move: active.move, cursor: next };
    setCursor(next);
    sendPose(active.move.poseForChunk(next));
  });

  if (status !== "ready" || !snapshot?.started) return null;

  function apply(id: string) {
    if (activeId === id) {
      // Toggle off (or cancel a one-shot mid-move) — empty list
      // deactivates the layer and hands the camera back to the look
      // axes; the prompt loses its hint sentence.
      clearSelection();
      sendPose([]);
      releasePrompt();
      return;
    }

    const move = findCameraMoveById(id);
    if (!move) return;
    activeRef.current = { move, cursor: 0 };
    setActiveId(id);
    setCursor(0);
    sendPose(move.poseForChunk(0));

    // The text half of the move: compose the hint onto the current
    // prompt (stripping any previous move's hint first, so switching
    // moves never stacks sentences).
    const prompt = snapshotRef.current?.current_prompt;
    if (typeof prompt === "string") {
      void setPrompt({ prompt: composeCameraPrompt(prompt, move) });
    }
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <label className="text-[10px] uppercase tracking-wider text-zinc-500">
        Camera moves
      </label>

      <p className="mt-1 text-[11px] leading-snug text-zinc-500">
        Preset cinematographic moves via the native camera-pose layer, with a
        matching prompt nudge so the subject holds its course. While one is
        active, it overrides the arrow-key look and adds to WASD.
      </p>

      <MoveGroup
        title="Hold"
        hint="click to toggle"
        moves={SUSTAINED_MOVES}
        activeId={activeId}
        onPick={apply}
      />
      <MoveGroup
        title="One-shot"
        hint="runs, then releases"
        moves={ONE_SHOT_MOVES}
        activeId={activeId}
        cursor={cursor}
        onPick={apply}
      />

      {/* Raw-payload readout — the array behind the active button,
          rounded for legibility. Collapsed by default; the summary
          line alone already tells the story (a move is just floats). */}
      {lastPayload && (
        <details className="mt-2 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5">
          <summary className="cursor-pointer font-mono text-[10px] text-zinc-500">
            camera_pose · {lastPayload.length / 6} frame
            {lastPayload.length > 6 ? "s" : ""} · [rx ry rz tx ty tz]
          </summary>
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre font-mono text-[10px] leading-4 text-zinc-400">
            {formatPayload(lastPayload)}
          </pre>
        </details>
      )}
    </div>
  );
}

function MoveGroup({
  title,
  hint,
  moves,
  activeId,
  cursor,
  onPick,
}: {
  title: string;
  hint: string;
  moves: ReadonlyArray<CameraMove>;
  activeId: string | null;
  cursor?: number;
  onPick: (id: string) => void;
}) {
  return (
    <>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400">
          {title}
        </span>
        <span className="text-[10px] text-zinc-600">{hint}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        {moves.map((move) => {
          const active = activeId === move.id;
          return (
            <button
              key={move.id}
              onClick={() => onPick(move.id)}
              className={`rounded-md border p-2 text-center text-[11px] font-medium transition-colors ${
                active
                  ? "border-brand bg-zinc-900 text-brand"
                  : "border-zinc-800 bg-zinc-950 text-zinc-200 hover:border-brand hover:text-brand"
              }`}
              title={move.description}
            >
              {move.label}
              {active && move.chunks !== null && cursor !== undefined && (
                <span className="ml-1 font-mono text-[10px] text-zinc-500">
                  {cursor + 1}/{move.chunks}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** One frame per line, 3 decimals — enough to read the easing curve. */
function formatPayload(payload: number[]): string {
  const lines: string[] = [];
  for (let i = 0; i < payload.length; i += 6) {
    lines.push(
      payload
        .slice(i, i + 6)
        .map((v) => v.toFixed(3).padStart(7))
        .join(" "),
    );
  }
  return lines.join("\n");
}
