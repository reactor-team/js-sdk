"use client";

// The controller's bottom control panel (objective + telemetry, hold-key chips,
// WASD/joystick/look/mouse pads, and the jump/crouch/orbit vertical controls),
// extracted from LingbotWorldController's `controls` slot. Pure presentational:
// the mouse/arrow HUD + joystick-knob geometry is derived here from the raw
// input state passed in; everything else is props (state + handlers).

import {
  type ComponentProps,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EventChips } from "@/components/lingbot-world-2/EventChips";
import { MovePad } from "@/components/lingbot-world-2/MovePad";
import { PadButton } from "@/components/lingbot-world-2/ControlPrimitives";
import {
  ChargeGridEditor,
  CrouchDipEditor,
} from "@/components/lingbot-world-2/controller/ChargeCrouchEditors";
import {
  CHUNK_LATENTS,
  NUM_CHARGE_LEVELS,
  type CrouchPhase,
  type CrouchPatterns,
} from "@/components/lingbot-world-2/controller/charge-crouch";

type LookH = "idle" | "left" | "right";
type LookV = "idle" | "up" | "down";
type JumpMode = "hold" | "prompt" | "charge";
type CrouchMode = "hold" | "prompt" | "camera";
type Vec2 = { x: number; y: number };

export function ControllerControls({
  // status / telemetry
  hudObjective,
  tspSize,
  isGenerating,
  chunkNum,
  chunkIndex,
  isReady,
  activeAction,
  isPaused,
  canPauseResume,
  sendLifecycle,
  // hold-key chips + WASD pad (whole prop objects, passed through)
  eventChips,
  movePad,
  // charge/crouch grid editors
  editingLevel,
  chargePatterns,
  cycleChargeCell,
  resetChargeLevel,
  setEditingLevel,
  editingCrouch,
  crouchPatterns,
  cycleCrouchCell,
  resetCrouchPatterns,
  setEditingCrouch,
  // joystick
  joyAreaRef,
  onJoyPointer,
  joy,
  // look (arrows)
  lookH,
  lookV,
  pushLookH,
  pushLookV,
  // mouse-look
  mouseLook,
  toggleMouseLook,
  mouseViz,
  // vertical controls
  jumpMode,
  changeJumpMode,
  chargeLevel,
  crouchMode,
  changeCrouchMode,
  orbitRadius,
  setOrbitRadius,
  orbitRadiusStep,
}: {
  hudObjective: string;
  tspSize: number | null;
  isGenerating: boolean;
  chunkNum: number;
  chunkIndex: number;
  isReady: boolean;
  activeAction: string;
  isPaused: boolean;
  canPauseResume: boolean;
  sendLifecycle: (cmd: "start" | "pause" | "resume" | "reset") => void;
  eventChips: ComponentProps<typeof EventChips>;
  movePad: ComponentProps<typeof MovePad>;
  editingLevel: number | null;
  chargePatterns: number[][];
  cycleChargeCell: (level: number, idx: number) => void;
  resetChargeLevel: (level: number) => void;
  setEditingLevel: (v: number | null) => void;
  editingCrouch: boolean;
  crouchPatterns: CrouchPatterns;
  cycleCrouchCell: (phase: CrouchPhase, idx: number) => void;
  resetCrouchPatterns: () => void;
  setEditingCrouch: (v: boolean) => void;
  joyAreaRef: RefObject<HTMLDivElement | null>;
  onJoyPointer: (e: ReactPointerEvent, kind: "down" | "move" | "up") => void;
  joy: Vec2;
  lookH: LookH;
  lookV: LookV;
  pushLookH: (v: LookH) => void;
  pushLookV: (v: LookV) => void;
  mouseLook: boolean;
  toggleMouseLook: () => void;
  mouseViz: Vec2;
  jumpMode: JumpMode;
  changeJumpMode: (m: JumpMode) => void;
  chargeLevel: number;
  crouchMode: CrouchMode;
  changeCrouchMode: (m: CrouchMode) => void;
  orbitRadius: number;
  setOrbitRadius: Dispatch<SetStateAction<number>>;
  orbitRadiusStep: number;
}) {
  // Mouse-signal HUD geometry: arrow from circle center in the direction of
  // recent mouse motion, length ∝ strength (clamped to the circle radius).
  const HUD = 72,
    HUD_C = HUD / 2,
    HUD_R = 28;
  const _vx = mouseViz.x * 0.5,
    _vy = mouseViz.y * 0.5;
  const _mag = Math.hypot(_vx, _vy);
  const _s = _mag > HUD_R ? HUD_R / _mag : 1;
  // Arrow-key look direction (svg coords: up = -y). Mirrored into the Mouse HUD
  // when mouse-look is off, so arrows ↔ Mouse read as one "look" control.
  const _arrowX = (lookH === "right" ? 1 : 0) - (lookH === "left" ? 1 : 0);
  const _arrowY = (lookV === "down" ? 1 : 0) - (lookV === "up" ? 1 : 0);
  const _arrowActive = _arrowX !== 0 || _arrowY !== 0;
  let hudEx = HUD_C,
    hudEy = HUD_C,
    hudActive = false;
  if (mouseLook) {
    hudEx = HUD_C + _vx * _s;
    hudEy = HUD_C + _vy * _s;
    hudActive = _mag > 0.5;
  } else if (_arrowActive) {
    const _am = (HUD_R * 0.9) / Math.hypot(_arrowX, _arrowY);
    hudEx = HUD_C + _arrowX * _am;
    hudEy = HUD_C + _arrowY * _am;
    hudActive = true;
  }

  // Joystick knob: show the drag vector if dragging, else mirror the WASD state.
  const _wasdX =
    (movePad.moveLat === "strafe_right" ? 1 : 0) -
    (movePad.moveLat === "strafe_left" ? 1 : 0);
  const _wasdY =
    (movePad.moveL === "back" ? 1 : 0) - (movePad.moveL === "forward" ? 1 : 0);
  const joyDragging = joy.x !== 0 || joy.y !== 0;
  const joyDispX = joyDragging ? joy.x : _wasdX;
  const joyDispY = joyDragging ? joy.y : _wasdY;
  const joyLit = joyDragging || _wasdX !== 0 || _wasdY !== 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Player objective — the goal (objective.summary), shown in the player section */}
      {hudObjective && (
        <div className="flex items-baseline gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
          <span className="font-mono text-[9px] uppercase tracking-widest text-emerald-300/80 shrink-0">
            Objective
          </span>
          <span className="font-mono text-[11px] text-white/85">{hudObjective}</span>
        </div>
      )}
      {/* Status telemetry */}
      {(tspSize !== null || (isGenerating && chunkNum > 0) || isReady) && (
        <div className="flex items-center gap-3 flex-wrap">
          {tspSize !== null && (
            <span className="mono-xs text-white/40">workers: {tspSize}</span>
          )}
          {isGenerating && chunkNum > 0 && (
            <span className="mono-xs text-white/40">
              chunk {chunkIndex + 1}/{chunkNum}
            </span>
          )}
          {isReady && (
            <span className="mono-xs text-amber-300/70">action: {activeAction}</span>
          )}
          <div className="flex-1" />
          {(isGenerating || isPaused) && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => sendLifecycle(isPaused ? "resume" : "pause")}
              disabled={!canPauseResume}
              className="mono-xs"
            >
              {isPaused ? "Resume" : "Pause"}
            </Button>
          )}
        </div>
      )}

      {/* Hold-key event chips, derived from the active scene's player events */}
      <EventChips {...eventChips} />

      {/* Move (WASD) + Joystick + Look + Mouse-signal HUD */}
      <div className="grid grid-cols-4 gap-3">
        <MovePad {...movePad} />

        {/* Charge-level grid editor popup */}
        {editingLevel !== null && (
          <ChargeGridEditor
            level={editingLevel}
            patterns={chargePatterns}
            chunkLatents={CHUNK_LATENTS}
            onCycle={cycleChargeCell}
            onReset={resetChargeLevel}
            onClose={() => setEditingLevel(null)}
          />
        )}

        {/* Crouch dip editor popup */}
        {editingCrouch && (
          <CrouchDipEditor
            patterns={crouchPatterns}
            chunkLatents={CHUNK_LATENTS}
            onCycle={cycleCrouchCell}
            onReset={resetCrouchPatterns}
            onClose={() => setEditingCrouch(false)}
          />
        )}

        {/* Drag joystick: continuous translation; mirrors WASD when not dragging */}
        <div className="flex flex-col items-center gap-1.5">
          <span className="mono-label">Joystick</span>
          <div
            ref={joyAreaRef}
            onPointerDown={(e) => {
              if (!isReady) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              onJoyPointer(e, "down");
            }}
            onPointerMove={(e) => {
              if (e.buttons !== 0) onJoyPointer(e, "move");
            }}
            onPointerUp={(e) => onJoyPointer(e, "up")}
            onPointerCancel={(e) => onJoyPointer(e, "up")}
            title="Drag for continuous movement (up = forward, down = back, left/right = strafe). Adds to WASD; mirrors WASD when idle."
            className={cn(
              "relative rounded-full border touch-none select-none",
              isReady
                ? "cursor-grab active:cursor-grabbing border-white/15 bg-white/[0.03]"
                : "opacity-30 border-white/10",
            )}
            style={{ width: HUD, height: HUD }}
          >
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/8" />
            <div className="absolute top-1/2 left-0 w-full h-px -translate-y-1/2 bg-white/8" />
            <div
              className={cn(
                "absolute h-4 w-4 rounded-full -translate-x-1/2 -translate-y-1/2 transition-all",
                joyLit ? "bg-amber-300" : "bg-white/40",
              )}
              style={{
                left: `calc(50% + ${joyDispX * HUD_R}px)`,
                top: `calc(50% + ${joyDispY * HUD_R}px)`,
              }}
            />
          </div>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <span className="mono-label">Look (Arrows)</span>
          <div className="flex flex-col items-center gap-0.5">
            <PadButton
              label="↑"
              pressed={lookV === "up"}
              disabled={false}
              onPress={() => pushLookV("up")}
              onRelease={() => pushLookV("idle")}
            />
            <div className="flex gap-0.5">
              <PadButton
                label="←"
                pressed={lookH === "left"}
                disabled={false}
                onPress={() => pushLookH("left")}
                onRelease={() => pushLookH("idle")}
              />
              <PadButton
                label="↓"
                pressed={lookV === "down"}
                disabled={false}
                onPress={() => pushLookV("down")}
                onRelease={() => pushLookV("idle")}
              />
              <PadButton
                label="→"
                pressed={lookH === "right"}
                disabled={false}
                onPress={() => pushLookH("right")}
                onRelease={() => pushLookH("idle")}
              />
            </div>
          </div>
        </div>

        {/* Mouse-look: click the circle to engage (pointer lock); Esc/M to release. */}
        <div className="flex flex-col items-center gap-1.5">
          <span className="mono-label">Mouse {mouseLook ? "(Esc/M)" : "(click)"}</span>
          <button
            type="button"
            disabled={false}
            onClick={toggleMouseLook}
            title={
              mouseLook
                ? "Mouse-look ON — move the mouse to rotate (yaw+pitch). Esc, M, or an arrow key to release."
                : "Click to engage mouse-look (pointer lock). Move the mouse to rotate; Esc/M to release."
            }
            className={cn(
              "rounded-full transition-transform disabled:opacity-30",
              "cursor-pointer hover:scale-105",
              mouseLook && "ring-2 ring-amber-300/60",
            )}
          >
            <svg width={HUD} height={HUD} className="shrink-0 block">
              <circle
                cx={HUD_C}
                cy={HUD_C}
                r={HUD_R}
                fill={mouseLook ? "rgba(252,211,77,0.06)" : "rgba(255,255,255,0.02)"}
                stroke={mouseLook ? "rgba(252,211,77,0.45)" : "rgba(255,255,255,0.15)"}
                strokeWidth="1"
              />
              <line
                x1={HUD_C}
                y1={HUD_C - HUD_R}
                x2={HUD_C}
                y2={HUD_C + HUD_R}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
              <line
                x1={HUD_C - HUD_R}
                y1={HUD_C}
                x2={HUD_C + HUD_R}
                y2={HUD_C}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
              {hudActive && (
                <>
                  <line
                    x1={HUD_C}
                    y1={HUD_C}
                    x2={hudEx}
                    y2={hudEy}
                    stroke="rgb(252,211,77)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <circle cx={hudEx} cy={hudEy} r="3" fill="rgb(252,211,77)" />
                </>
              )}
              <circle
                cx={HUD_C}
                cy={HUD_C}
                r="2"
                fill={mouseLook ? "rgba(252,211,77,0.8)" : "rgba(255,255,255,0.3)"}
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Vertical controls — jump + crouch mode switches and the charge-level editor. */}
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3 border-t border-white/[0.06] pt-3">
        <div className="flex flex-col gap-1.5">
          <span className="mono-label">Jump (Space)</span>
          <div className="flex gap-1">
            {(
              [
                ["hold", "Hold — translate up while held (no descent)"],
                ["prompt", "Prompt — only append the scene's jump prompt"],
                [
                  "charge",
                  "Charge — hold to charge a level, release to fire that level's arc",
                ],
              ] as const
            ).map(([m, title]) => (
              <button
                key={m}
                type="button"
                disabled={false}
                onClick={() => changeJumpMode(m)}
                title={title}
                className={cn(
                  "h-7 rounded border px-3 font-mono text-[11px] capitalize transition-colors disabled:opacity-30",
                  jumpMode === m
                    ? "border-amber-300/60 bg-amber-300/20 text-amber-200"
                    : "border-white/15 bg-white/5 text-white/60 hover:bg-white/10",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {jumpMode === "charge" && (
          <div className="flex flex-col gap-1.5">
            <span className="mono-label">Charge levels — click to edit</span>
            <div className="flex gap-1.5">
              {Array.from({ length: NUM_CHARGE_LEVELS }, (_, i) => {
                const level = i + 1;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setEditingLevel(level)}
                    title={`Level ${level} — ${level} chunk${level > 1 ? "s" : ""}; click to edit its per-latent up/down/still pattern`}
                    className={cn(
                      "flex h-9 w-14 flex-col items-center justify-center rounded border font-mono transition-colors",
                      i < chargeLevel
                        ? "border-amber-300/60 bg-amber-300/25 text-amber-100"
                        : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10",
                    )}
                  >
                    <span className="text-[13px] leading-none">{level}</span>
                    <span className="text-[8px] leading-none text-white/45">✎ edit</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="mono-label">Crouch (C)</span>
          <div className="flex items-center gap-1">
            {(
              [
                [
                  "hold",
                  "Hold — translate straight down for as long as held (no return)",
                ],
                [
                  "prompt",
                  "Prompt — inject the scene's crouch line, no camera motion",
                ],
                [
                  "camera",
                  "Camera — a one-shot downward dip (+ the crouch line) while held",
                ],
              ] as const
            ).map(([m, title]) => (
              <button
                key={m}
                type="button"
                disabled={false}
                onClick={() => changeCrouchMode(m)}
                title={title}
                className={cn(
                  "h-7 rounded border px-3 font-mono text-[11px] capitalize transition-colors disabled:opacity-30",
                  crouchMode === m
                    ? "border-amber-300/60 bg-amber-300/20 text-amber-200"
                    : "border-white/15 bg-white/5 text-white/60 hover:bg-white/10",
                )}
              >
                {m}
              </button>
            ))}
            {crouchMode === "camera" && (
              <button
                type="button"
                onClick={() => setEditingCrouch(true)}
                title="Edit the crouch dip — which of this chunk's latents are down / still"
                className="ml-1 flex h-7 items-center rounded border border-white/15 bg-white/5 px-2 mono-xs text-white/70 hover:bg-white/10"
              >
                ✎ dip
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="mono-label">Orbit radius (O)</span>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              inputMode="decimal"
              step={orbitRadiusStep}
              min={0}
              value={orbitRadius}
              disabled={false}
              onChange={(e) => {
                const v = Number(e.target.value);
                setOrbitRadius(Number.isFinite(v) ? Math.max(0, v) : 0);
              }}
              className={cn(
                "h-7 w-24 font-mono text-xs tabular-nums",
                "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                orbitRadius > 0 ? "text-amber-200" : "text-white/60",
              )}
              title="Orbit radius — 0 = rotate in place (normal). Type any value; bigger = wider/farther. Press O to mute / un-mute."
            />
            <div className="flex flex-col">
              <button
                type="button"
                disabled={false}
                onClick={() => setOrbitRadius((r) => Math.max(0, r + orbitRadiusStep))}
                className="flex h-3.5 w-5 items-center justify-center rounded-t border border-b-0 border-white/15 bg-white/5 text-[8px] leading-none text-white/60 hover:bg-white/10 disabled:opacity-30"
                title="Increase orbit radius"
              >
                &#9650;
              </button>
              <button
                type="button"
                disabled={false}
                onClick={() => setOrbitRadius((r) => Math.max(0, r - orbitRadiusStep))}
                className="flex h-3.5 w-5 items-center justify-center rounded-b border border-white/15 bg-white/5 text-[8px] leading-none text-white/60 hover:bg-white/10 disabled:opacity-30"
                title="Decrease orbit radius"
              >
                &#9660;
              </button>
            </div>
          </div>
        </div>
      </div>

      <p className="font-mono text-[9px] text-white/35 leading-snug">
        WASD / joystick = move · arrows = look · Q/E = roll · Space = jump / C =
        crouch · click the Mouse circle for free-look (Esc/M to release).
        <span className="text-white/50">Orbit radius</span> = while looking
        (mouse or arrows), circle a point R ahead instead of turning in place; R
        = 0 is normal rotation, press <span className="text-white/50">O</span>{" "}
        to mute / un-mute. Jump mode:{" "}
        <span className="text-white/50">Hold</span> = up while held ·
        <span className="text-white/50"> Prompt</span> = prompt only ·
        <span className="text-white/50"> Charge</span> = hold to charge a level,
        release for that level&apos;s up→down arc (click a level to edit its
        per-latent pattern). Crouch (all modes inject the scene&apos;s crouch
        line):
        <span className="text-white/50"> Hold</span> = straight down while held
        ·<span className="text-white/50"> Prompt</span> = line only ·
        <span className="text-white/50"> Camera</span> = a one-shot editable dip
        (✎) plus the line.
      </p>
    </div>
  );
}
