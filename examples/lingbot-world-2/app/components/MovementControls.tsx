"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  useLingbotWorld2,
  useLingbotWorld2State,
  type LingbotWorld2StateMessage,
} from "@reactor-models/lingbot-world-2";

// Live-phase panel — LingBot World 2's signature capability.
//
// LingBot World 2 is a real-time interactive world model: while it's
// generating, the client can stream movement and camera commands
// that the model picks up at chunk boundaries. The output video
// reflects those inputs a fraction of a second later, producing the
// feeling of "driving" the scene.
//
// Four commands flow from this component:
//   - set_move_longitudinal  "idle" | "forward" | "back"
//   - set_move_lateral       "idle" | "strafe_left" | "strafe_right"
//   - set_look_horizontal    "idle" | "left" | "right"
//   - set_look_vertical      "idle" | "up" | "down"
//
// Movement is TWO independent axes in v2 (it was one combined
// `set_movement` field in v1). W/S drive the longitudinal axis, A/D
// drive the lateral axis, and both can be active at once — holding
// W+A produces genuine diagonal movement ("w+a" on the wire). Each
// axis is tracked as its own local press state and returns to "idle"
// independently when its key is released.
//
// The look axes are mapped to arrow keys, both in the on-screen pad
// (good for touch / discoverability) AND in a global keyboard
// listener (good for the actual gameplay feel).
//
// We also expose a rotation-speed slider (`set_rotation_speed_deg`,
// 0–30 deg/latent-frame) — the only "knob" the live phase tweaks.
//
// IMPORTANT — UI highlighting reads LOCAL PRESS STATE, not the
// snapshot. The snapshot.move_* / look_* fields lag user input by
// a chunk (they reflect what the model is currently using to
// generate, not what was just pressed) which makes the buttons
// flicker visibly behind the user's fingers. Local press state is
// instant and matches what the user just did. The slider, on the
// other hand, is a persistent value with no "release" — that still
// reads from the snapshot.

type Longitudinal = "idle" | "forward" | "back";
type Lateral = "idle" | "strafe_left" | "strafe_right";
type LookH = "idle" | "left" | "right";
type LookV = "idle" | "up" | "down";

// Keys → axis values. WASD for translation (split across the two
// movement axes), arrow keys for look. Any additional key bindings
// (e.g. shift for sprint, gamepad sticks) would be added here.
const LONGITUDINAL_KEYS: Record<string, Longitudinal> = {
  w: "forward",
  s: "back",
};
const LATERAL_KEYS: Record<string, Lateral> = {
  a: "strafe_left",
  d: "strafe_right",
};
const LOOK_H_KEYS: Record<string, LookH> = {
  arrowleft: "left",
  arrowright: "right",
};
const LOOK_V_KEYS: Record<string, LookV> = {
  arrowup: "up",
  arrowdown: "down",
};

export function MovementControls() {
  const {
    status,
    setMoveLongitudinal,
    setMoveLateral,
    setLookHorizontal,
    setLookVertical,
    setRotationSpeedDeg,
  } = useLingbotWorld2();
  const [snapshot, setSnapshot] = useState<LingbotWorld2StateMessage | null>(null);

  // Local "what the user is pressing right now" state. Drives the
  // button highlights so they react instantly instead of waiting for
  // the next state snapshot to come back from the model. One entry
  // per model axis — longitudinal and lateral are deliberately
  // separate so a W+A hold highlights both.
  const [pressedLongitudinal, setPressedLongitudinal] =
    useState<Longitudinal>("idle");
  const [pressedLateral, setPressedLateral] = useState<Lateral>("idle");
  const [pressedLookH, setPressedLookH] = useState<LookH>("idle");
  const [pressedLookV, setPressedLookV] = useState<LookV>("idle");

  useLingbotWorld2State((msg) => setSnapshot(msg));

  // Clear on disconnect. Also clear local press state — otherwise
  // a button could remain highlighted across a reconnect.
  useEffect(() => {
    if (status !== "ready") {
      setSnapshot(null);
      setPressedLongitudinal("idle");
      setPressedLateral("idle");
      setPressedLookH("idle");
      setPressedLookV("idle");
    }
  }, [status]);

  const ready = status === "ready" && snapshot?.started === true;

  // Send each axis as a typed event AND update local press state.
  // We don't try to debounce — LingBot World 2 only consults the value at
  // the next chunk boundary, so sending more frequent updates is
  // harmless. Local state is the source of truth for the UI.
  const sendLongitudinal = useCallback(
    (m: Longitudinal) => {
      if (!ready) return;
      setPressedLongitudinal(m);
      setMoveLongitudinal({ move_longitudinal: m });
    },
    [ready, setMoveLongitudinal],
  );
  const sendLateral = useCallback(
    (m: Lateral) => {
      if (!ready) return;
      setPressedLateral(m);
      setMoveLateral({ move_lateral: m });
    },
    [ready, setMoveLateral],
  );
  const sendLookH = useCallback(
    (l: LookH) => {
      if (!ready) return;
      setPressedLookH(l);
      setLookHorizontal({ look_horizontal: l });
    },
    [ready, setLookHorizontal],
  );
  const sendLookV = useCallback(
    (l: LookV) => {
      if (!ready) return;
      setPressedLookV(l);
      setLookVertical({ look_vertical: l });
    },
    [ready, setLookVertical],
  );

  // Global keyboard handling. We attach a single keydown/keyup pair
  // to the window so the pad responds even when the user hasn't
  // clicked into anything. Each axis is tracked independently, so
  // holding W + A keeps both movement axes non-idle and the model
  // drives diagonally; releasing A returns only the lateral axis to
  // "idle" while W keeps pushing forward.
  //
  // We deliberately don't filter out repeat events on keydown — the
  // first event sets the axis, subsequent repeats re-send the same
  // value, which the model treats as a no-op.
  useEffect(() => {
    if (!ready) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't hijack keys when the user is typing into an input.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const k = e.key.toLowerCase();
      if (LONGITUDINAL_KEYS[k]) {
        e.preventDefault();
        sendLongitudinal(LONGITUDINAL_KEYS[k]);
      } else if (LATERAL_KEYS[k]) {
        e.preventDefault();
        sendLateral(LATERAL_KEYS[k]);
      } else if (LOOK_H_KEYS[k]) {
        e.preventDefault();
        sendLookH(LOOK_H_KEYS[k]);
      } else if (LOOK_V_KEYS[k]) {
        e.preventDefault();
        sendLookV(LOOK_V_KEYS[k]);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (LONGITUDINAL_KEYS[k]) {
        e.preventDefault();
        sendLongitudinal("idle");
      } else if (LATERAL_KEYS[k]) {
        e.preventDefault();
        sendLateral("idle");
      } else if (LOOK_H_KEYS[k]) {
        e.preventDefault();
        sendLookH("idle");
      } else if (LOOK_V_KEYS[k]) {
        e.preventDefault();
        sendLookV("idle");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [ready, sendLongitudinal, sendLateral, sendLookH, sendLookV]);

  if (status !== "ready" || !snapshot?.started) return null;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <label className="text-[10px] uppercase tracking-wider text-zinc-500">
        Drive the scene
      </label>

      <p className="mt-2 text-[11px] leading-snug text-zinc-500">
        WASD moves the subject — hold two keys (W+A) to drive diagonally. Arrow
        keys turn the camera. Hold to sustain — release to stop.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {/* Move pad — two independent axes sharing one cross: W/S go
            to set_move_longitudinal, A/D go to set_move_lateral. Both
            can be held at once for diagonal movement. */}
        <PadFrame
          title="Move"
          legend="W A S D"
          top={
            <PadButton
              label="W"
              pressed={pressedLongitudinal === "forward"}
              onPress={() => sendLongitudinal("forward")}
              onRelease={() => sendLongitudinal("idle")}
            />
          }
          left={
            <PadButton
              label="A"
              pressed={pressedLateral === "strafe_left"}
              onPress={() => sendLateral("strafe_left")}
              onRelease={() => sendLateral("idle")}
            />
          }
          right={
            <PadButton
              label="D"
              pressed={pressedLateral === "strafe_right"}
              onPress={() => sendLateral("strafe_right")}
              onRelease={() => sendLateral("idle")}
            />
          }
          bottom={
            <PadButton
              label="S"
              pressed={pressedLongitudinal === "back"}
              onPress={() => sendLongitudinal("back")}
              onRelease={() => sendLongitudinal("idle")}
            />
          }
        />

        {/* Look pad — same 3x3 layout as Move, but each axis goes to a
            different setter: vertical arrows → set_look_vertical,
            horizontal arrows → set_look_horizontal. */}
        <PadFrame
          title="Look"
          legend="↑ ↓ ← →"
          top={
            <PadButton
              label="↑"
              pressed={pressedLookV === "up"}
              onPress={() => sendLookV("up")}
              onRelease={() => sendLookV("idle")}
            />
          }
          left={
            <PadButton
              label="←"
              pressed={pressedLookH === "left"}
              onPress={() => sendLookH("left")}
              onRelease={() => sendLookH("idle")}
            />
          }
          right={
            <PadButton
              label="→"
              pressed={pressedLookH === "right"}
              onPress={() => sendLookH("right")}
              onRelease={() => sendLookH("idle")}
            />
          }
          bottom={
            <PadButton
              label="↓"
              pressed={pressedLookV === "down"}
              onPress={() => sendLookV("down")}
              onRelease={() => sendLookV("idle")}
            />
          }
        />
      </div>

      <label className="mt-4 block text-[10px] uppercase tracking-wider text-zinc-500">
        Rotation speed · {snapshot.rotation_speed_deg.toFixed(1)}°/frame
      </label>
      <input
        type="range"
        min={0}
        max={30}
        step={0.5}
        value={snapshot.rotation_speed_deg}
        onChange={(e) =>
          setRotationSpeedDeg({ rotation_speed_deg: Number(e.target.value) })
        }
        className="mt-2 w-full accent-[color:var(--reactor-color-light-gold)]"
      />
    </div>
  );
}

// A framed 3x3 pad where the four corners are empty, the centre is
// a non-interactive neutral marker, and each directional slot is
// supplied as a named prop. Both Move and Look pads share this
// shape — each binds its vertical slots and horizontal slots to two
// different axes.
function PadFrame({
  title,
  legend,
  top,
  left,
  right,
  bottom,
}: {
  title: string;
  legend: string;
  top: ReactNode;
  left: ReactNode;
  right: ReactNode;
  bottom: ReactNode;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400">
          {title}
        </span>
        <span className="font-mono text-[10px] text-zinc-600">{legend}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1">
        <span />
        {top}
        <span />
        {left}
        <IdleCenter />
        {right}
        <span />
        {bottom}
        <span />
      </div>
    </div>
  );
}

function PadButton({
  label,
  pressed,
  onPress,
  onRelease,
}: {
  label: string;
  pressed: boolean;
  onPress: () => void;
  onRelease: () => void;
}) {
  return (
    <button
      onMouseDown={onPress}
      onMouseUp={onRelease}
      onMouseLeave={() => pressed && onRelease()}
      onTouchStart={onPress}
      onTouchEnd={onRelease}
      className={[
        "select-none rounded-sm border px-2 py-2 text-center text-sm font-medium transition-colors",
        pressed
          ? "border-brand bg-brand text-brand-fg"
          : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-brand hover:text-brand",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

// Non-interactive neutral marker at the centre of each pad. A
// small outlined circle just anchors the cross visually without
// inviting a click.
function IdleCenter() {
  return (
    <span className="grid place-items-center">
      <span className="h-2 w-2 rounded-full border border-zinc-700" />
    </span>
  );
}
