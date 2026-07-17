// Input + native camera-pose constants, type unions, and key maps for the
// controller — pure module (no React), extracted from LingbotWorldController.

export type MoveL = "idle" | "forward" | "back";
export type MoveLat = "idle" | "strafe_left" | "strafe_right";
export type LookH = "idle" | "left" | "right";
export type LookV = "idle" | "up" | "down";

export const MAX_EVENTS = 9;

export const KEY_TO_MOVE_L: Record<string, Exclude<MoveL, "idle">> = {
  w: "forward",
  W: "forward",
  s: "back",
  S: "back",
};
export const KEY_TO_MOVE_LAT: Record<string, Exclude<MoveLat, "idle">> = {
  a: "strafe_left",
  A: "strafe_left",
  d: "strafe_right",
  D: "strafe_right",
};
export const KEY_TO_LOOK_H: Record<string, Exclude<LookH, "idle">> = {
  ArrowLeft: "left",
  ArrowRight: "right",
};
export const KEY_TO_LOOK_V: Record<string, Exclude<LookV, "idle">> = {
  ArrowUp: "up",
  ArrowDown: "down",
};

// ---- Native camera-pose layer (set_camera_pose) ----
//
// The backend's camera_pose input takes a flat list of per-frame motion
// DELTAS: [rx, ry, rz, tx, ty, tz] per frame (Euler-radian rotation +
// translation, camera-local). Rotation OVERRIDES the arrow keys, translation
// ADDS to WASD. We send one delta per chunk (6 floats; the backend repeats it
// across its chunk_size) — no absolute pose, no matrices, no client state to
// maintain. The backend sanitizes any payload, so this is hard to misuse.
export const MOUSE_SENS_DEFAULT = 0.0003; // per-frame radians of look per pixel (user-adjustable)
export const MOUSE_SENS_MIN = 0.00005;
export const MOUSE_SENS_MAX = 0.0012;
export const MOUSE_MAX_ROT = 0.2; // hard ceiling on per-chunk |yaw|/|pitch| (the HUD
// outer ring) — a fast fling can't over-rotate
export const ROLL_SPEED = 0.08; // per-frame radians of roll (Q/E) — matched to the
// keyboard arrow rate (~4.6°/frame) so it's visible
// Arrow-key look is routed through the SAME camera_pose yaw/pitch as mouse-look
// (rather than the backend's separate discrete look_horizontal/look_vertical
// state), so it's just a steady, fixed-rate version of mouse movement — it
// stacks with the mouse and drives everything mouse-driven yaw does, incl. orbit.
export const ARROW_LOOK_SPEED = ROLL_SPEED; // per-frame radians of yaw/pitch while an arrow is held
export const JUMP_SPEED = 1.0; // per-frame up-translation while held (magnitude
// is washed out by per-chunk normalization)
export const JOY_SPEED = 1.0; // per-frame translation magnitude at full joystick deflect
// Camera-local "up" sign for Jump. Empirically verified against the backend:
// characters dove DOWN with +1, so up is -1 in this model's local-Y convention.
export const JUMP_UP_SIGN = -1;

// ---- Orbit mode (Phase 1: horizontal) ----
// Orbit couples the YAW (mouse OR arrow-key look — both land in the same `ry`,
// see ARROW_LOOK_SPEED) with a proportional camera-local strafe (+ a slight
// forward dolly) so the point R ahead stays centered while the camera circles it.
// R is the coupling RATIO (strafe per unit yaw) = the orbit radius in the model's
// local units; R = 0 reproduces rotate-in-place.
export const ORBIT_RADIUS_DEFAULT = 6;
export const ORBIT_RADIUS_STEP = 0.5; // per-click nudge from the up/down stepper buttons

// Jump has three selectable modes (the "Jump" switch by the pad):
//   "hold"   — hold to translate straight UP for as long as held (no descent).
//   "prompt" — jump toggles ONLY the scene's jumpPrompt; no camera_pose at all.
//   "charge" — hold to charge a meter; release to fire that level's per-latent arc.
export type JumpMode = "hold" | "prompt" | "charge";

// Crouch modes (the "Crouch" switch), mirroring Jump:
//   "hold"   — C held → sustained straight-DOWN translation for as long as held.
//   "prompt" — C held → inject the scene's crouchPrompt, no camera_pose.
//   "camera" — C press → a one-shot downward camera dip.
export type CrouchMode = "hold" | "prompt" | "camera";

// DiT self-attention window override (the backend `set_attn_window` event):
//   "auto"  — motion-based still-window trigger (default).
//   "small" — force the still (small) window always.
//   "large" — force the moving (large/full) window always.
export type AttnWindow = "auto" | "small" | "large";

// KV-cache / RoPE reset mode (backend `set_kv_cache_reset`):
//   "off"    — no reset at all.
//   "auto"   — periodic window reset (~every 88 latent frames) + manual trigger.
//   "manual" — no periodic reset; only the manual `trigger_kv_cache_reset` fires.
export type KvResetMode = "off" | "auto" | "manual";

// One-shot crouch dip (camera mode): applied to the FIRST chunk after C press,
// additive to WASD/forward, then the pose reverts so the camera holds its new,
// slightly-lower height. CROUCH_DIP tunes the dip depth vs forward when moving.
export const CROUCH_DIP = 0.5;
// Sustained per-frame DOWN translation while C is held in crouch "hold" mode
// (mirror of JUMP_SPEED). Sets the down:forward ratio when walking down while W.
export const CROUCH_SPEED = 1.0;

export function keyToHoldSlot(key: string): number | undefined {
  if (key.length !== 1) return undefined;
  const code = key.charCodeAt(0);
  if (code >= 49 && code <= 57) return code - 49;
  return undefined;
}

// Alphabetic hotkeys for DIRECTOR events, so a solo player can act (numbers 1-9
// + WASD) AND direct (letters) at the same time. Assigned in scene director-order
// (1st director event -> "t", 2nd -> "y", ...). Letters deliberately avoid every
// player control. DirectorPanel labels its SCENE buttons from this same string.
export const DIRECTOR_HOTKEYS = "tyupfghbnvxz";
export function keyToDirectorIndex(key: string): number | undefined {
  if (key.length !== 1) return undefined;
  const i = DIRECTOR_HOTKEYS.indexOf(key.toLowerCase());
  return i >= 0 ? i : undefined;
}
