import type {
  CreateWorldParams,
  HappyOysterMode,
} from "@reactor-models/happy-oyster";
import baseWorlds from "./featured-worlds.json";
import worldPins from "./world-pins.json";

/** The experience number the featured-world data uses → the SDK's mode name. */
export function modeName(mode: 1 | 2): HappyOysterMode {
  return mode === 2 ? "director" : "adventure";
}

export interface FeaturedWorld {
  key: string;
  title: string;
  /** 1 = Adventure (walk it, WASD) · 2 = Director (steer the story, text). */
  mode: 1 | 2;
  /** Display copy, and the create prompt when this world has no pinned id. */
  prompt: string;
  /** A pre-built world's capability id. When present, activation attaches it
   * (instant) instead of creating a fresh one (~30s build). */
  encryptedWorldId?: string;
  /** Bubble fill, and the fallback when `image` is absent or fails to load. */
  gradient: string;
  /** Thumbnail rendered over the gradient; falls back to the gradient on error. */
  image?: string;
}

interface WorldPin {
  encryptedWorldId: string;
}

const pins = worldPins as Record<string, WorldPin>;

// A placeholder pin is a marker in world-pins.json, not a real world, treat it
// as unpinned so the world takes the create path until you seed real ids.
function realPin(pin: WorldPin | undefined): WorldPin | undefined {
  if (!pin || pin.encryptedWorldId.startsWith("REPLACE_WITH_"))
    return undefined;
  return pin;
}

export const FEATURED_WORLDS: FeaturedWorld[] = (
  baseWorlds as FeaturedWorld[]
).map((world) => ({ ...world, ...realPin(pins[world.key]) }));

/** Client-side travel time limits, per experience mode (seconds). */
export const TRAVEL_SECONDS: Record<1 | 2, number> = {
  1: 60,
  2: 180,
};

// The experience is fixed per session — each mode is its own Reactor model —
// so every intent carries the mode the session must connect with, and the
// create params carry only that mode's own knobs (no mode field).
/** One thing to do with the session: build a new world, or attach an existing one. */
export type WorldIntent =
  | {
      kind: "create";
      mode: HappyOysterMode;
      params: CreateWorldParams;
      title: string;
    }
  | {
      kind: "attach";
      mode: HappyOysterMode;
      encryptedWorldId: string;
      title: string;
    };
