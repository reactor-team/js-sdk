// Small pure scene helpers + storage keys for the controller (no React).

import type { StructuredScene } from "@/lib/lingbot-world-prompts";
import type { VitalChange } from "@/components/lingbot-world-2/controller/useHudGating";

// Sentinel id used in the overrides map for the user's custom (bring-your-own)
// scene. "edited" state simply means a non-empty override exists.
export const CUSTOM_SCENE_ID = "__custom__";

// Per-example user overrides. Each example id maps to the user's edited
// StructuredScene; persisted to localStorage so edits survive reloads.
export const OVERRIDES_STORAGE_KEY = "lingbot-world-2:overrides:v1";

// Default event-name → vital change, so pressing an event key visibly moves the
// HUD. A simple keyword table for now. Returns null for events with no effect.
export function vitalForEvent(name?: string): VitalChange | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (/(crash|thrown|blast|fire|takedown|roundhouse|grapple)/.test(n))
    return { health: -20 };
  if (/(heal|medkit|rest|recover|bandage)/.test(n)) return { health: 25 };
  if (/(pick ?up|cash|grab|collect|loot)/.test(n)) return { addItem: name };
  return null;
}

// Validate a parsed object is a StructuredScene shape — used when hydrating
// overrides from localStorage.
export function isStructuredScene(v: unknown): v is StructuredScene {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    !!s.base &&
    typeof s.base === "object" &&
    !!s.camera &&
    typeof s.camera === "object" &&
    !!s.movement &&
    typeof s.movement === "object" &&
    Array.isArray(s.events)
  );
}
