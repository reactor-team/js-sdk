"use client";

// The player's hold-key event chips (numeric keys 1-9), derived from the active
// scene's PLAYER events. Director-owned events are excluded (they're fired from
// the Director panel, not player keys). Presentational — press/release delegate
// to the controller's holdPress/holdRelease.

import { HoldChip } from "@/components/lingbot-world-2/ControlPrimitives";
import type { StructuredScene } from "@/lib/lingbot-world-prompts";

const MAX_EVENTS = 9; // keys 1-9

export function EventChips({
  scene,
  heldSlots,
  onPress,
  onRelease,
}: {
  scene: StructuredScene | null;
  heldSlots: number[];
  onPress: (slot: number) => void;
  onRelease: (slot: number) => void;
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
          return (
            <HoldChip
              key={slot}
              slot={slot}
              name={event.name}
              empty={detailEmpty && !event.name.trim()}
              pressed={heldSlots.includes(slot)}
              disabled={false /* player controls stay live even before video connects */}
              onPress={() => onPress(slot)}
              onRelease={() => onRelease(slot)}
            />
          );
        })}
      </div>
    </div>
  );
}
