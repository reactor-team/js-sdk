// Import + conversion for uploaded "world" JSON files (the multi-room state
// machine exported by the world builder) into shapes the fast-v1 controller
// can drive.
//
// An uploaded world is a state machine: a set of named rooms (`states`), each
// with its own base / camera{static,dynamic} / movement{static,dynamic} prose,
// plus directional `transition` events (from-rooms -> to-room) and an entrance
// (start image + start room).
//
// The runtime model in lingbot-world-prompts.ts is a single StructuredScene. We
// bridge the two by treating "the room you're currently in" as that scene: each
// room is compiled to a StructuredScene whose `default` layer versions hold that
// room's prose (buildRoomScene). Walking to another room just swaps the active
// scene + re-sends set_prompt — no held events, so WASD static/dynamic and the
// rest of the controller keep working unchanged.

import { emptyScene } from "@/lib/lingbot-world-prompts";
import type {
  ImagePreset,
  ShotVariant,
  StructuredScene,
} from "@/lib/lingbot-world-prompts";

export interface UploadedWorldState {
  base: string;
  camera: ShotVariant;
  movement: ShotVariant;
}

export interface UploadedWorldTransition {
  name?: string;
  // Rooms this transition may be taken from. Empty = available anywhere.
  from: string[];
  to: string;
}

export interface UploadedWorld {
  id: string;
  name: string;
  description?: string;
  // Starting image. src may be empty if the upload had none — the UI then
  // requires the user to pick one before applying (like the custom scene).
  image: ImagePreset;
  entranceState: string;
  // Preserves upload order so room lists render predictably.
  stateOrder: string[];
  states: Record<string, UploadedWorldState>;
  transitions: UploadedWorldTransition[];
}

export type ParseWorldResult =
  | { ok: true; world: UploadedWorld }
  | { ok: false; error: string };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asShotVariant(v: unknown): ShotVariant {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return { static: asString(o.static), dynamic: asString(o.dynamic) };
  }
  // A bare string is accepted and used for both framings.
  if (typeof v === "string") return { static: v, dynamic: v };
  return { static: "", dynamic: "" };
}

// Turn a display name into a stable, url-ish slug used as the world id when the
// upload lacks one.
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "world";
}

// Parse the `scene.states` map into rooms, in insertion order, dropping any
// room with no prose at all.
function parseStates(statesRaw: Record<string, unknown>): {
  states: Record<string, UploadedWorldState>;
  stateOrder: string[];
} {
  const states: Record<string, UploadedWorldState> = {};
  const stateOrder: string[] = [];
  for (const [name, val] of Object.entries(statesRaw)) {
    if (!val || typeof val !== "object") continue;
    const s = val as Record<string, unknown>;
    const base = asString(s.base);
    const camera = asShotVariant(s.camera);
    const movement = asShotVariant(s.movement);
    if (
      !base.trim() &&
      !camera.static.trim() &&
      !camera.dynamic.trim() &&
      !movement.static.trim() &&
      !movement.dynamic.trim()
    ) {
      continue;
    }
    states[name] = { base, camera, movement };
    stateOrder.push(name);
  }
  return { states, stateOrder };
}

// Parse `scene.events` into transitions: keep only those whose target is a real
// room, and filter each `from` list down to real rooms too.
function parseTransitions(
  eventsRaw: unknown,
  states: Record<string, UploadedWorldState>,
): UploadedWorldTransition[] {
  if (!Array.isArray(eventsRaw)) return [];
  const transitions: UploadedWorldTransition[] = [];
  for (const e of eventsRaw) {
    if (!e || typeof e !== "object") continue;
    const ev = e as Record<string, unknown>;
    const to = asString(ev.to);
    if (!to || !(to in states)) continue;
    const from = Array.isArray(ev.from)
      ? (ev.from as unknown[]).filter(
          (f): f is string => typeof f === "string" && f in states,
        )
      : [];
    transitions.push({
      name: isNonEmptyString(ev.name) ? ev.name : undefined,
      from,
      to,
    });
  }
  return transitions;
}

// Parse + validate a parsed-JSON value into an UploadedWorld. Defensive: the
// input is a user-supplied file, so every field is checked and bad rooms /
// transitions are dropped rather than throwing.
export function parseWorldJson(raw: unknown): ParseWorldResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "File is not a JSON object." };
  }
  const root = raw as Record<string, unknown>;
  const scene = root.scene as Record<string, unknown> | undefined;
  if (!scene || typeof scene !== "object") {
    return { ok: false, error: "Missing top-level \"scene\" object." };
  }
  const statesRaw = scene.states as Record<string, unknown> | undefined;
  if (!statesRaw || typeof statesRaw !== "object" || Array.isArray(statesRaw)) {
    return { ok: false, error: "Missing \"scene.states\" object." };
  }

  const { states, stateOrder } = parseStates(statesRaw);
  if (stateOrder.length === 0) {
    return { ok: false, error: "No usable rooms found in \"scene.states\"." };
  }
  const transitions = parseTransitions(scene.events, states);

  // Entrance: prefer the declared start room; fall back to the first room.
  const entrance = root.entrance as Record<string, unknown> | undefined;
  const declaredEntrance = asString(entrance?.state);
  const entranceState =
    declaredEntrance && declaredEntrance in states
      ? declaredEntrance
      : stateOrder[0];

  const entranceImage = (entrance?.image ?? {}) as Record<string, unknown>;
  const name = isNonEmptyString(root.name) ? root.name : "Untitled world";
  const image: ImagePreset = {
    src: asString(entranceImage.src),
    label: isNonEmptyString(entranceImage.label) ? entranceImage.label : name,
  };
  const id = isNonEmptyString(root.id) ? root.id : slugify(name);

  return {
    ok: true,
    world: {
      id,
      name,
      description: isNonEmptyString(root.description)
        ? root.description
        : undefined,
      image,
      entranceState,
      stateOrder,
      states,
      transitions,
    },
  };
}

// Compile a single room into a StructuredScene the runtime composer drives.
// The room's prose lives on the `default` version of every layer, so
// composePrompt(scene, isMoving, []) yields base + camera[static|dynamic] +
// movement[static|dynamic] — a coherent room prompt that responds to WASD.
export function buildRoomScene(
  world: UploadedWorld,
  roomName: string,
): StructuredScene {
  const st = world.states[roomName] ?? world.states[world.entranceState];
  // Start from the shared empty-scene skeleton (events: [], jump/crouch: "")
  // and fill the three layers' default versions with this room's prose.
  return {
    ...emptyScene(),
    base: { default: st.base },
    camera: { default: { static: st.camera.static, dynamic: st.camera.dynamic } },
    movement: {
      default: { static: st.movement.static, dynamic: st.movement.dynamic },
    },
  };
}

// Target rooms reachable from `roomName`, in transition order, de-duplicated.
// A transition with an empty `from` is available from any room.
export function exitsFrom(world: UploadedWorld, roomName: string): string[] {
  const out: string[] = [];
  for (const t of world.transitions) {
    if (t.from.length !== 0 && !t.from.includes(roomName)) continue;
    if (t.to === roomName) continue; // no self-loops in the exit list
    if (!out.includes(t.to)) out.push(t.to);
  }
  return out;
}
