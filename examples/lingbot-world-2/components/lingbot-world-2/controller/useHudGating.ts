"use client";

// Player HUD vitals + event gating, extracted from LingbotWorldController.
// These two concerns are combined because they share state: `gateStateNow`
// reads the HUD health/inventory refs, and `initHud` resets BOTH the HUD and
// the fired-event set on scene change. The hook owns all of it (state, refs,
// ref-sync effects, win/lose banner, the `__hud` console hook); the controller
// keeps the cross-cutting effects that wire HUD state into other subsystems
// (re-push director events, the health-0 "downed" hold), using the returns here.
//
// `applyVital` routes through the shared coordinator socket when connected, so
// the coordinator refs are passed in.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  isEventAvailable,
  type GateState,
  type NamedEvent,
} from "@/lib/lingbot-world-prompts";
import { type GameResult } from "@/components/lingbot-world-2/Hud";

// A change to the shared player vitals, emitted by either role (Player event
// or Director op). Applied server-side (coordinator) or locally.
export type VitalChange = {
  health?: number; // delta: +heal / -damage
  setHealth?: number; // absolute
  addItem?: string;
  removeItem?: string;
  reset?: boolean; // full health, empty inventory (on session reset)
};

export function useHudGating({
  coordConnectedRef,
  coordWsRef,
}: {
  coordConnectedRef: MutableRefObject<boolean>;
  coordWsRef: MutableRefObject<WebSocket | null>;
}) {
  // --- Event gating ---------------------------------------------------------
  // Fired scene events + a version counter so the UI (player keys + Director
  // panel) re-derives availability when the fired-set changes. Reset on scene
  // select / restart (via initHud).
  const firedEventsRef = useRef<Set<string>>(new Set());
  const [firedVersion, setFiredVersion] = useState(0);
  // Ref mirrors of the HUD vitals so the imperative event handlers read fresh
  // values without stale closures (synced from state by effects below).
  const hudHealthRef = useRef(100);
  const hudInventoryRef = useRef<string[]>([]);
  const gateStateNow = useCallback(
    (): GateState => ({
      fired: firedEventsRef.current,
      chunks: 0, // local play has no chunk clock; connected mode gates on `fired`
      health: hudHealthRef.current,
      inventory: hudInventoryRef.current,
    }),
    [],
  );
  const isAvailableNow = useCallback(
    (ev?: NamedEvent | null) => (ev ? isEventAvailable(ev, gateStateNow()) : true),
    [gateStateNow],
  );
  const recordFired = useCallback((name?: string) => {
    if (!name || firedEventsRef.current.has(name)) return;
    firedEventsRef.current.add(name);
    setFiredVersion((v) => v + 1);
  }, []);

  // --- HUD vitals -----------------------------------------------------------
  // maxHealth / show / starting values come from the active scene's `hud`
  // section. maxHealth in a ref so the stable applyVital clamps against the
  // current scene's value.
  const [hudMaxHealth, setHudMaxHealth] = useState(100);
  const hudMaxHealthRef = useRef(100);
  const [hudShow, setHudShow] = useState(false);
  const [hudHealth, setHudHealth] = useState(100);
  const [hudInventory, setHudInventory] = useState<string[]>([]);
  const [hudHealthLabel, setHudHealthLabel] = useState<string>("Health"); // per-scene bar label
  const [gameResult, setGameResult] = useState<GameResult>(null); // win/lose banner below the HUD
  // Keep the gate refs (read by imperative event handlers) synced to HUD state.
  useEffect(() => {
    hudHealthRef.current = hudHealth;
  }, [hudHealth]);
  useEffect(() => {
    hudInventoryRef.current = hudInventory;
  }, [hudInventory]);

  // Initialise the HUD from a scene's `hud` config (on scene apply / reset).
  const initHud = useCallback(
    (cfg?: {
      show?: boolean;
      maxHealth?: number;
      health?: number;
      healthLabel?: string;
      inventory?: string[];
    }) => {
      const max = Math.min(100, cfg?.maxHealth ?? 100); // hard ceiling: 100
      // Reset event gating for the new scene so fired-state doesn't leak across scenes.
      firedEventsRef.current = new Set();
      setFiredVersion((v) => v + 1);
      hudMaxHealthRef.current = max;
      setHudMaxHealth(max);
      setHudShow(cfg ? cfg.show !== false : false); // hidden unless the scene opts in
      setHudHealth(Math.max(0, Math.min(max, cfg?.health ?? max)));
      setHudHealthLabel(cfg?.healthLabel ?? "Health"); // per-scene bar rename (e.g. "Fuel")
      setHudInventory([...(cfg?.inventory ?? [])]);
      setGameResult(null); // clear any win/lose banner for the fresh scene
    },
    [],
  );

  // Apply a vital change from either role. Routes to the coordinator (which
  // reduces + broadcasts back) when connected; else mutates local HUD state.
  const applyVital = useCallback(
    (change: VitalChange, label?: string) => {
      if (coordConnectedRef.current) {
        // `label` (the action name) rides along so the activity feed can show WHICH
        // action caused the change (e.g. "Machete Slash  +4 health"), not just "+4".
        coordWsRef.current?.send(
          JSON.stringify({
            op: "vital",
            role: "player",
            change,
            ...(label ? { name: label } : {}),
          }),
        );
        return; // authoritative vitals return via {type:"vitals"}
      }
      const max = hudMaxHealthRef.current;
      if (change.reset) {
        setHudHealth(max);
        setHudInventory([]);
        setGameResult(null); // reset clears the win/lose banner
        return;
      }
      if (change.setHealth !== undefined) {
        const v = change.setHealth;
        setHudHealth(Math.max(0, Math.min(max, v)));
      }
      if (change.health !== undefined) {
        const d = change.health;
        setHudHealth((h) => Math.max(0, Math.min(max, h + d)));
      }
      if (change.addItem) {
        const it = change.addItem;
        setHudInventory((inv) => (inv.includes(it) ? inv : [...inv, it]));
      }
      if (change.removeItem) {
        const it = change.removeItem;
        setHudInventory((inv) => inv.filter((x) => x !== it));
      }
    },
    [coordConnectedRef, coordWsRef],
  );
  const applyVitalRef = useRef(applyVital);
  useEffect(() => {
    applyVitalRef.current = applyVital;
  }, [applyVital]);

  // Push server-authoritative vitals into HUD state (called by the controller's
  // coordinator socket on a {type:"vitals"} broadcast). Stable, so the socket
  // effect can close over it directly.
  const setVitalsFromServer = useCallback(
    (health: number, inventory: string[]) => {
      setHudHealth(health);
      setHudInventory(inventory);
    },
    [],
  );

  // Win/lose banner (text popup below the HUD). "lost" when a health-tracking
  // scene hits 0; cleared when health recovers. "won" is set from the
  // coordinator's `won` broadcast and cleared on scene apply/reset.
  useEffect(() => {
    if (hudShow && hudHealth <= 0) setGameResult("lost");
    else if (hudHealth > 0) setGameResult((r) => (r === "lost" ? null : r));
  }, [hudHealth, hudShow]);

  // Console hook — same entry point the Player events and Director use.
  useEffect(() => {
    const hud = {
      damage: (n: number) => applyVitalRef.current({ health: -n }),
      heal: (n: number) => applyVitalRef.current({ health: n }),
      setHealth: (n: number) => applyVitalRef.current({ setHealth: n }),
      addItem: (item: string) => applyVitalRef.current({ addItem: item }),
      removeItem: (item: string) => applyVitalRef.current({ removeItem: item }),
      reset: () => applyVitalRef.current({ reset: true }),
    };
    (window as unknown as { __hud?: typeof hud }).__hud = hud;
    return () => {
      delete (window as unknown as { __hud?: typeof hud }).__hud;
    };
  }, []);

  return {
    // gating
    firedVersion,
    gateStateNow,
    isAvailableNow,
    recordFired,
    // HUD state (for render)
    hudHealth,
    hudMaxHealth,
    hudInventory,
    hudHealthLabel,
    hudShow,
    gameResult,
    // HUD mutators (used by controller effects / scene apply / coordinator socket)
    setGameResult,
    initHud,
    applyVital,
    setVitalsFromServer,
  };
}
