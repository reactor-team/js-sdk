"use client";

// Shared pointer-driven control buttons used by the WASD pad, hold-keys, and
// event chips. Pure presentational — pointer capture + press/release only.

import { cn } from "@/lib/utils";

// A square press-and-hold button (WASD keys). Fires onPress on down, onRelease
// on up/cancel/leave-while-pressed.
export function PadButton({
  label,
  pressed,
  disabled,
  onPress,
  onRelease,
  className,
}: {
  label: React.ReactNode;
  pressed: boolean;
  disabled?: boolean;
  onPress: () => void;
  onRelease: () => void;
  className?: string;
}) {
  const handlers = disabled
    ? {}
    : {
        onPointerDown: (e: React.PointerEvent) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onPress();
        },
        onPointerUp: onRelease,
        onPointerCancel: onRelease,
        onPointerLeave: (e: React.PointerEvent) => {
          if (e.buttons !== 0) onRelease();
        },
      };

  return (
    <button
      type="button"
      disabled={disabled}
      {...handlers}
      className={cn(
        "h-10 w-10 rounded border font-mono text-xs select-none transition-all",
        "disabled:opacity-30 disabled:cursor-not-allowed",
        pressed
          ? "bg-amber-300/20 border-amber-300/60 text-amber-200 scale-95"
          : "bg-white/5 border-white/15 text-white/80 hover:bg-white/10 active:scale-95",
        className,
      )}
    >
      {label}
    </button>
  );
}

// Small hold-to-activate button (roll / jump / crouch) — fires onDown while
// held, onUp on release. Sits beside the WASD pad.
export function HoldBtn({
  label,
  lit,
  disabled,
  title,
  onDown,
  onUp,
  className,
}: {
  label: React.ReactNode;
  lit: boolean;
  disabled?: boolean;
  title?: string;
  onDown: () => void;
  onUp: () => void;
  className?: string;
}) {
  const handlers = disabled
    ? {}
    : {
        onPointerDown: (e: React.PointerEvent) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onDown();
        },
        onPointerUp: onUp,
        onPointerCancel: onUp,
        onPointerLeave: (e: React.PointerEvent) => {
          if (e.buttons !== 0) onUp();
        },
      };
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      {...handlers}
      className={cn(
        "h-7 w-11 rounded border font-mono text-[10px] select-none transition-all",
        "disabled:opacity-30 disabled:cursor-not-allowed",
        lit
          ? "bg-amber-300/20 border-amber-300/60 text-amber-200 scale-95"
          : "bg-white/5 border-white/15 text-white/80 hover:bg-white/10 active:scale-95",
        className,
      )}
    >
      {label}
    </button>
  );
}

// A hold-key event chip (numeric slots 1-9). Shows the slot number + name;
// disabled/empty chips are inert.
export function HoldChip({
  slot,
  name,
  empty,
  pressed,
  disabled,
  onPress,
  onRelease,
}: {
  slot: number;
  name: string;
  empty: boolean;
  pressed: boolean;
  disabled: boolean;
  onPress: () => void;
  onRelease: () => void;
}) {
  const handlers =
    disabled || empty
      ? {}
      : {
          onPointerDown: (e: React.PointerEvent) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            onPress();
          },
          onPointerUp: onRelease,
          onPointerCancel: onRelease,
          onPointerLeave: (e: React.PointerEvent) => {
            if (e.buttons !== 0) onRelease();
          },
        };
  const displayName = name.trim() || `event ${slot + 1}`;
  return (
    <div
      {...handlers}
      title={empty ? `Slot ${slot + 1} is empty` : displayName}
      aria-disabled={disabled || empty}
      className={cn(
        "group flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] transition-colors text-left max-w-full select-none",
        (disabled || empty) && "opacity-40 cursor-not-allowed",
        !disabled && !empty && "cursor-pointer",
        pressed
          ? "border-amber-300/80 bg-amber-300/25 text-amber-100"
          : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:border-white/25",
      )}
    >
      <span
        className={cn(
          "inline-flex h-4 min-w-4 items-center justify-center rounded border px-0.5 text-[9px] font-bold",
          pressed
            ? "border-amber-300/80 bg-amber-300/30 text-amber-100"
            : "border-white/25 bg-white/10 text-white/80",
        )}
      >
        {slot + 1}
      </span>
      <span className="truncate">
        {empty ? <em className="text-white/30">empty</em> : displayName}
      </span>
    </div>
  );
}
