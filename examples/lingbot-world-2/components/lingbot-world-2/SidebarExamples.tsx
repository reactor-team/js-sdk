"use client";

// The Quick Start example list: a card per scene (thumbnail + name + description)
// with Apply (whole card), ↺ revert-override, and ✎ edit. Presentational — the
// override logic lives in the controller and is exposed via `hasOverride` +
// callbacks.

import { cn } from "@/lib/utils";
import type { StructuredExample } from "@/lib/lingbot-world-prompts";

export function SidebarExamples({
  examples,
  activeExampleId,
  loadingExampleId,
  disabled,
  hasOverride,
  onApply,
  onClearOverride,
  onEdit,
}: {
  examples: StructuredExample[];
  activeExampleId: string | null;
  loadingExampleId: string | null;
  disabled: boolean;
  hasOverride: (id: string) => boolean;
  onApply: (ex: StructuredExample) => void;
  onClearOverride: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  if (examples.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-mono uppercase tracking-widest text-primary">
        Quick Start
      </span>
      <p className="text-[10px] text-white/40 leading-snug">
        Click an example to auto-load its image, prompt, and start generating.
        Click ✎ to preset / customize its layered prompt; your edits persist
        across re-clicks until you press ↺ to revert.
      </p>
      <div className="flex flex-col gap-2">
        {examples.map((ex) => {
          const isActive = activeExampleId === ex.id;
          const isLoading = loadingExampleId === ex.id;
          const edited = hasOverride(ex.id);
          return (
            <div
              key={ex.id}
              className={cn(
                "group flex items-stretch gap-1.5 rounded-lg border transition-all",
                isActive
                  ? "border-amber-300/60 bg-amber-300/10"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20",
              )}
            >
              <button
                type="button"
                onClick={() => onApply(ex)}
                disabled={disabled}
                title="Apply this example (loads image and starts generation)"
                className={cn(
                  "relative flex items-center gap-3 flex-1 min-w-0 p-2 text-left rounded-l-lg",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                <div className="relative shrink-0 w-24 h-14 rounded-md overflow-hidden border border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ex.image.src}
                    alt={ex.image.label}
                    className="w-full h-full object-cover"
                  />
                  {isLoading && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <div className="w-4 h-4 border-2 border-amber-300 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono text-sm text-white font-medium truncate">
                      {ex.name}
                    </span>
                    {edited && (
                      <span
                        title="You've customized this prompt — your edits load whenever this example is applied. Press ↺ on the right to revert to the built-in default."
                        className="shrink-0 font-mono text-[9px] uppercase tracking-wider rounded bg-amber-300/15 text-amber-200 px-1.5 py-0.5 border border-amber-300/30"
                      >
                        edited
                      </span>
                    )}
                  </div>
                  {ex.description && (
                    <span className="font-mono text-[10px] text-white/50 leading-snug">
                      {ex.description}
                    </span>
                  )}
                </div>
                {isActive && (
                  <div className="shrink-0 w-2 h-2 rounded-full bg-amber-300" />
                )}
              </button>
              {edited && (
                <button
                  type="button"
                  onClick={() => onClearOverride(ex.id)}
                  title={`Revert "${ex.name}" to the built-in default prompt (discards your edits)`}
                  className={cn(
                    "shrink-0 w-9 flex items-center justify-center border-l border-white/5",
                    "font-mono text-sm text-white/55 hover:text-red-300 hover:bg-white/[0.06] transition-colors",
                  )}
                  aria-label={`Reset ${ex.name} to default`}
                >
                  ↺
                </button>
              )}
              <button
                type="button"
                onClick={() => onEdit(ex.id)}
                title={`Edit ${ex.name} prompt (no image upload / no auto-start)`}
                className={cn(
                  "shrink-0 w-9 flex items-center justify-center rounded-r-lg border-l border-white/5",
                  "font-mono text-sm text-white/55 hover:text-amber-200 hover:bg-white/[0.06] transition-colors",
                )}
              >
                ✎
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
