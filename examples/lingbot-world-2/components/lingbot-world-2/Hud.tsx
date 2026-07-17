"use client";

// On-screen player HUD — health bar + inventory — overlaid on the viewport.
// Purely presentational: it renders whatever health/inventory it's handed. The
// values live in the controller (and can be driven by the Director/coordinator
// or the PlayerController binding); this just draws them.

export type GameResult = "won" | "lost" | null;

interface HudProps {
  health: number;
  maxHealth: number;
  inventory: string[];
  objective?: string; // objective.summary — kept for compatibility; no longer shown on the HUD
  healthLabel?: string; // bar label; per-scene rename (e.g. "Fuel"). Default "Health".
  // Hidden until a scene is running, so it doesn't float over the idle page.
  visible: boolean;
  result?: GameResult; // win/lose outcome — shows a text banner below the bars
}

export function Hud({ health, maxHealth, inventory, healthLabel, visible, result }: HudProps) {
  // Show the container when the HUD is up OR there's a win/lose outcome to announce.
  if (!visible && !result) return null;
  const pct = Math.max(0, Math.min(1, health / maxHealth));
  // green → amber → red as health drops.
  const bar =
    pct > 0.5 ? "bg-emerald-400" : pct > 0.25 ? "bg-amber-400" : "bg-red-500";

  return (
    <div className="absolute top-3 left-3 z-30 pointer-events-none select-none flex flex-col gap-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
      {/* Bars only render while the HUD is up; the result banner can show on its own. */}
      {visible && (
        <>
          {/* Health (label is per-scene renameable, e.g. "Fuel") */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] uppercase tracking-widest text-white/80 w-12">
              {healthLabel ?? "Health"}
            </span>
            <div className="w-40 h-3 rounded-sm bg-black/60 border border-white/25 overflow-hidden">
              <div
                className={`h-full ${bar} transition-all duration-300`}
                style={{ width: `${pct * 100}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-white/90 tabular-nums">
              {Math.round(health)}/{maxHealth}
            </span>
          </div>

          {/* Inventory */}
          {inventory.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap max-w-[16rem]">
              <span className="font-mono text-[9px] uppercase tracking-widest text-white/80 w-12">
                Inv
              </span>
              {inventory.map((item) => (
                <span
                  key={item}
                  className="font-mono text-[10px] rounded bg-black/70 text-white/90 px-1.5 py-0.5 border border-white/25"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {/* Win/lose banner — a text popup below the HUD. */}
      {result && (
        <div
          className={`mt-1 self-start rounded-md px-3 py-1.5 font-mono text-[13px] font-bold uppercase tracking-widest border animate-in fade-in zoom-in-95 duration-300 ${
            result === "won"
              ? "bg-emerald-500/85 border-emerald-200/60 text-black"
              : "bg-red-600/85 border-red-200/60 text-white"
          }`}
        >
          {result === "won" ? "You win" : "Game over"}
        </div>
      )}
    </div>
  );
}
