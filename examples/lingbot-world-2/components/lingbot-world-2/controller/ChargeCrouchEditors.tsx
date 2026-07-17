"use client";

// The two per-latent grid-editor modals lifted out of LingbotWorldController's
// `controls` slot: the jump charge-level editor and the crouch dip editor. Both
// are self-contained popups — click a cell to cycle up (↑) / down (↓) / still (·)
// — driven entirely by props (pattern data + cell/reset/close callbacks), so the
// controller keeps ownership of the pattern state and persistence.

import { cn } from "@/lib/utils";

// Cell button shared by both editors: ↑ up / ↓ down / · still, color-coded.
function PatternCell({
  value,
  onClick,
}: {
  value: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={value === 1 ? "up" : value === -1 ? "down" : "still"}
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-md border font-mono text-xl transition-colors",
        value === 1
          ? "bg-amber-300/20 border-amber-300/60 text-amber-200"
          : value === -1
            ? "bg-sky-400/20 border-sky-400/60 text-sky-200"
            : "bg-white/5 border-white/15 text-white/40",
      )}
    >
      {value === 1 ? "↑" : value === -1 ? "↓" : "·"}
    </button>
  );
}

function ModalShell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-white/15 bg-neutral-950 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// Jump charge-level editor: `level` chunks × chunkLatents cells each.
export function ChargeGridEditor({
  level,
  patterns,
  chunkLatents,
  onCycle,
  onReset,
  onClose,
}: {
  level: number;
  patterns: number[][];
  chunkLatents: number;
  onCycle: (level: number, idx: number) => void;
  onReset: (level: number) => void;
  onClose: () => void;
}) {
  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm text-white">
          Jump level {level} · {level} chunk
          {level > 1 ? "s" : ""} ({level * chunkLatents} latents)
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="h-7 w-7 rounded font-mono text-xs text-white/60 hover:bg-white/10"
        >
          ✕
        </button>
      </div>
      <p className="mt-1 mb-4 font-mono text-[11px] leading-relaxed text-white/50">
        One cell per latent (3 per chunk), played left→right, top→bottom. Click a
        cell to cycle <span className="text-amber-200">↑ up</span> →{" "}
        <span className="text-sky-200">↓ down</span> →{" "}
        <span className="text-white/40">· still</span>. Stills are the pause /
        hang; put as many as you want. Saved automatically.
      </p>
      <div className="flex flex-col gap-2">
        {Array.from({ length: level }, (_, c) => (
          <div key={c} className="flex items-center gap-3">
            <span className="w-14 font-mono text-[9px] uppercase tracking-wider text-white/30">
              chunk {c + 1}
            </span>
            <div className="flex gap-2">
              {Array.from({ length: chunkLatents }, (_, j) => {
                const idx = c * chunkLatents + j;
                return (
                  <PatternCell
                    key={j}
                    value={patterns[level - 1][idx]}
                    onClick={() => onCycle(level, idx)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onReset(level)}
          className="rounded border border-white/15 px-3 py-1.5 font-mono text-[11px] text-white/60 hover:bg-white/10"
        >
          Reset to default
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-amber-300/40 bg-amber-300/15 px-3 py-1.5 font-mono text-[11px] text-amber-200 hover:bg-amber-300/25"
        >
          Done
        </button>
      </div>
    </ModalShell>
  );
}

// Crouch dip editor: two one-chunk dips (press on C-down, release on C-up).
export function CrouchDipEditor({
  patterns,
  chunkLatents,
  onCycle,
  onReset,
  onClose,
}: {
  patterns: { press: number[]; release: number[] };
  chunkLatents: number;
  onCycle: (phase: "press" | "release", j: number) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm text-white">
          Crouch — press &amp; release chunks
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="h-7 w-7 rounded font-mono text-xs text-white/60 hover:bg-white/10"
        >
          ✕
        </button>
      </div>
      <p className="mt-1 mb-4 font-mono text-[11px] leading-relaxed text-white/50">
        Two one-chunk dips: <strong>press</strong> fires on C-down,{" "}
        <strong>release</strong> fires on C-up (standing back up). One cell per
        latent — click to cycle <span className="text-amber-200">↑ up</span> →{" "}
        <span className="text-sky-200">↓ down</span> →{" "}
        <span className="text-white/40">· still</span>. Added on top of forward.
        Saved automatically.
      </p>
      <div className="flex flex-col gap-3">
        {(["press", "release"] as const).map((phase) => (
          <div key={phase} className="flex items-center gap-3">
            <span className="w-16 font-mono text-[9px] uppercase tracking-wider text-white/30">
              {phase} {phase === "press" ? "(↓)" : "(↑)"}
            </span>
            <div className="flex gap-2">
              {Array.from({ length: chunkLatents }, (_, j) => (
                <PatternCell
                  key={j}
                  value={patterns[phase][j]}
                  onClick={() => onCycle(phase, j)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          onClick={onReset}
          className="rounded border border-white/15 px-3 py-1.5 font-mono text-[11px] text-white/60 hover:bg-white/10"
        >
          Reset to default
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-amber-300/40 bg-amber-300/15 px-3 py-1.5 font-mono text-[11px] text-amber-200 hover:bg-amber-300/25"
        >
          Done
        </button>
      </div>
    </ModalShell>
  );
}
