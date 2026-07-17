"use client";

// The player's hold-key event chips (numeric keys 1-9), derived from the active
// scene's PLAYER events. Director-owned events are excluded (they're fired from
// the Director panel, not player keys). Presentational — press/release delegate
// to the controller's holdPress/holdRelease.

import { HoldChip } from "@/components/lingbot-world-2/ControlPrimitives";
import type { NamedEvent, StructuredScene } from "@/lib/lingbot-world-prompts";

// Render up to this many hold-key chips. Keyboard number keys only reach slots
// 0-8 (keys 1-9, see keyToHoldSlot); chips beyond that are click-only.
const MAX_EVENTS = 24;

export function EventChips({
  scene,
  heldSlots,
  onPress,
  onRelease,
  isAvailable,
}: {
  scene: StructuredScene | null;
  heldSlots: number[];
  onPress: (slot: number) => void;
  onRelease: (slot: number) => void;
  // Gate predicate: a locked player chip (prerequisites not met) renders greyed
  // and inert, mirroring how the DirectorPanel greys locked director events.
  // Omitted (or returns true) → chip stays live, as before.
  isAvailable?: (event: NamedEvent) => boolean;
}) {
  if (!scene || scene.events.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9px] text-white/40 uppercase tracking-wider">
        Hold (keys 1-{scene.events.length} — reverts on release)
      </span>
      <div className="flex flex-wrap gap-1">
        {scene.events.slice(0, MAX_EVENTS).map((event, slot) => {
          // Director-owned events (scene change / death) aren't player keys.
          if (event.actor === "director") return null;
          const detailEmpty =
            typeof event.detail === "string"
              ? !event.detail.trim()
              : !event.detail.static.trim() && !event.detail.dynamic.trim();
          // Gated-locked player chips grey out and go inert; ungated stay live
          // (even before video connects — availability is about prereqs, not connection).
          const locked = isAvailable ? !isAvailable(event as NamedEvent) : false;
          return (
            <HoldChip
              key={slot}
              slot={slot}
              name={event.name}
              empty={detailEmpty && !event.name.trim()}
              pressed={heldSlots.includes(slot)}
              disabled={locked}
              onPress={() => onPress(slot)}
              onRelease={() => onRelease(slot)}
            />
          );
        })}
      </div>
    </div>
  );
}
