"use client";

// Player HUD slot — the health/inventory/objective overlay, extracted from
// LingbotWorldController so the app can mount it INSIDE the video's relative
// container (absolute overlay on the viewport), not in the controls panel below.
//
// Thin wrapper over the presentational <Hud>: it fixes `visible` on so the HUD
// shows as soon as a scene opts in (even before the model connects — initHud
// runs offline on preset select). To hide it again on the idle/pre-connect page,
// pass a `visible` through instead of hard-coding true here.

import { Hud, type GameResult } from "@/components/lingbot-world-2/Hud";

export function PlayerHud({
  health,
  maxHealth,
  inventory,
  objective,
  healthLabel,
  result,
}: {
  health: number;
  maxHealth: number;
  inventory: string[];
  objective?: string;
  healthLabel?: string;
  result?: GameResult;
}) {
  return (
    <Hud
      health={health}
      maxHealth={maxHealth}
      inventory={inventory}
      objective={objective}
      healthLabel={healthLabel}
      visible={true}
      result={result}
    />
  );
}
