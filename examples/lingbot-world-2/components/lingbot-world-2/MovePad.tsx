"use client";

// The WASD movement pad: Q/E roll above, W/A/S/D move, Space jump + C crouch
// stacked to the right. Pure presentational — all state (lit/pressed) and
// handlers are passed in from the controller.

import { PadButton, HoldBtn } from "@/components/lingbot-world-2/ControlPrimitives";

type MoveL = "idle" | "forward" | "back";
type MoveLat = "idle" | "strafe_left" | "strafe_right";

export function MovePad({
  rollDir,
  moveL,
  moveLat,
  jumpLit,
  vertDir,
  setRoll,
  onMoveLPress,
  onMoveLRelease,
  onMoveLatPress,
  onMoveLatRelease,
  onJumpDown,
  onJumpUp,
  setVert,
}: {
  rollDir: number;
  moveL: MoveL;
  moveLat: MoveLat;
  jumpLit: boolean;
  vertDir: number;
  setRoll: (dir: number) => void;
  onMoveLPress: (dir: "forward" | "back") => void;
  onMoveLRelease: (dir: "forward" | "back") => void;
  onMoveLatPress: (dir: "strafe_left" | "strafe_right") => void;
  onMoveLatRelease: (dir: "strafe_left" | "strafe_right") => void;
  onJumpDown: () => void;
  onJumpUp: () => void;
  setVert: (dir: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="font-mono text-[9px] uppercase tracking-wider text-white/40">
        Move (WASD)
      </span>
      {/* WASD pad (with Q/E roll above, left & right) + Space/C stacked to the right.
          items-end so the Space/C stack aligns to the WASD pad (W + ASD), not Q/E. */}
      <div className="flex items-end gap-2">
        <div className="flex flex-col items-center gap-0.5">
          {/* Top row: Q | W | E — Q/E fill the gaps either side of W */}
          <div className="flex gap-0.5">
            <HoldBtn
              label="Q"
              lit={rollDir === -1}
              disabled={false}
              className="h-10 w-10"
              title="Roll left (Q)"
              onDown={() => setRoll(-1)}
              onUp={() => setRoll(0)}
            />
            <PadButton
              label="W"
              pressed={moveL === "forward"}
              disabled={false}
              onPress={() => onMoveLPress("forward")}
              onRelease={() => onMoveLRelease("forward")}
            />
            <HoldBtn
              label="E"
              lit={rollDir === 1}
              disabled={false}
              className="h-10 w-10"
              title="Roll right (E)"
              onDown={() => setRoll(1)}
              onUp={() => setRoll(0)}
            />
          </div>
          {/* Bottom row: A | S | D */}
          <div className="flex gap-0.5">
            <PadButton
              label="A"
              pressed={moveLat === "strafe_left"}
              disabled={false}
              onPress={() => onMoveLatPress("strafe_left")}
              onRelease={() => onMoveLatRelease("strafe_left")}
            />
            <PadButton
              label="S"
              pressed={moveL === "back"}
              disabled={false}
              onPress={() => onMoveLPress("back")}
              onRelease={() => onMoveLRelease("back")}
            />
            <PadButton
              label="D"
              pressed={moveLat === "strafe_right"}
              disabled={false}
              onPress={() => onMoveLatPress("strafe_right")}
              onRelease={() => onMoveLatRelease("strafe_right")}
            />
          </div>
        </div>
        {/* Space jump (up) / C crouch (down) — bigger, stacked to the right of WASD. */}
        <div className="flex flex-col gap-0.5">
          <HoldBtn
            label="Space"
            lit={jumpLit}
            disabled={false}
            className="h-10 w-16 text-[11px]"
            title="Jump (Space) — see the Jump mode switch"
            onDown={onJumpDown}
            onUp={onJumpUp}
          />
          <HoldBtn
            label="C"
            lit={vertDir < 0}
            disabled={false}
            className="h-10 w-16 text-[11px]"
            title="Crouch (C) — see the Crouch mode switch below"
            onDown={() => setVert(-1)}
            onUp={() => setVert(0)}
          />
        </div>
      </div>
    </div>
  );
}
