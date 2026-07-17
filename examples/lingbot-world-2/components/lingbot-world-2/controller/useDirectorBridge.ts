"use client";

// Director/coordinator bridge, extracted from LingbotWorldController.
//
// This owns the DIRECTOR-facing plumbing: the `director` control surface
// (assert/retract facts on the shared History), pushing the active scene's
// director events + objective to the in-app Human Director panel (localStorage +
// window events) and to the coordinator, the runtime-switchable coordinator WS
// URL, and the `__director` console hook.
//
// It does NOT own the coordinator WebSocket itself — that socket is shared
// infrastructure (it also carries player ops, `facts` broadcasts, ticks, etc.),
// so the controller keeps the connection lifecycle and just reads the refs this
// hook returns (e.g. re-pushing scene events / objective on `onopen`). The shared
// refs are passed in; the director-specific state/refs are created and returned.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  STRUCTURED_EXAMPLES,
  isEventAvailable,
  type StructuredScene,
  type Objective,
  type GateState,
} from "@/lib/lingbot-world-prompts";
import { type Fact } from "@/lib/history";

// Brief shape of a director event as bridged to the panel / coordinator. The
// extra gate fields (requires/win/chance) ride along in the JSON payload.
type DirEventBrief = {
  name: string;
  clause: string;
  health?: number;
  addItem?: string;
  count?: number;
  available?: boolean;
};

export function useDirectorBridge({
  coordWsRef,
  coordConnectedRef,
  activeExampleId,
  gateStateNow,
  setHudObjective,
}: {
  coordWsRef: MutableRefObject<WebSocket | null>;
  coordConnectedRef: MutableRefObject<boolean>;
  activeExampleId: string | null;
  gateStateNow: () => GateState;
  setHudObjective: (summary: string) => void;
}) {
  // The active scene's DIRECTOR events (scene change / death), extracted for the
  // Director panel/AI to fire. Kept in a ref so we can re-push on (re)connect.
  const sceneDirEventsRef = useRef<DirEventBrief[]>([]);
  const pushSceneEvents = useCallback(
    (sc: StructuredScene | null) => {
      const gs = gateStateNow();
      const list = (sc?.events ?? [])
        .filter((e) => e.actor === "director")
        .map((e) => ({
          name: e.name,
          clause: typeof e.detail === "string" ? e.detail : e.detail.static,
          health: e.health,
          addItem: e.addItem,
          count: e.count,
          available: isEventAvailable(e, gs),
          // Ship the raw gate too, so the AI director enforces it against ITS OWN
          // fired-state (authoritative for its arc), not just the player-computed flag.
          requires: e.requires,
          win: e.win, // terminal win event → coordinator flips `won` when it fires
          chance: e.chance, // per-tick fire probability (randomized timing, rules engine)
        }));
      sceneDirEventsRef.current = list;
      // Bridge the current scene's director events to the in-app Human Director
      // panel directly (works with NO coordinator connection), so the panel
      // updates per game the moment a scene is selected.
      if (typeof window !== "undefined") {
        window.localStorage.setItem("directorSceneEvents", JSON.stringify(list));
        window.dispatchEvent(
          new CustomEvent("director-scene-events", { detail: list }),
        );
      }
      if (coordConnectedRef.current) {
        coordWsRef.current?.send(
          JSON.stringify({ op: "scene_events", events: list }),
        );
      }
    },
    [gateStateNow, coordConnectedRef, coordWsRef],
  );

  // The active scene's objective — HUD shows `summary`, Director panel/AI use
  // `director`. Bridged to the in-app panel (localStorage + event) and, when
  // present, the coordinator. Kept in a ref to re-push on (re)connect.
  const objectiveRef = useRef<Objective | null>(null);
  const activeGameRef = useRef<string>(""); // active scene slug, re-pushed on (re)connect
  const pushObjective = useCallback(
    (obj: Objective | null) => {
      objectiveRef.current = obj ?? null;
      setHudObjective(obj?.summary ?? "");
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          "directorObjective",
          JSON.stringify(obj ?? null),
        );
        window.dispatchEvent(
          new CustomEvent("director-objective", { detail: obj ?? null }),
        );
      }
      if (coordConnectedRef.current) {
        coordWsRef.current?.send(
          JSON.stringify({ op: "objective", objective: obj ?? null }),
        );
      }
    },
    [setHudObjective, coordConnectedRef, coordWsRef],
  );

  // Broadcast the selected game's title to the UI (Director panel etc.) whenever
  // the active example changes, via the same localStorage + window-event bridge.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const title = activeExampleId
      ? (STRUCTURED_EXAMPLES[activeExampleId]?.name ?? "")
      : "";
    window.localStorage.setItem("activeSceneName", title);
    window.dispatchEvent(new CustomEvent("active-scene-name", { detail: title }));
    // Clear stale director facts from the shared History on game switch, so the
    // previous game's asserted world events (weather, spawns, etc.) don't carry over.
    // Also publish the active game's slug so the AI director can reload that scene
    // (re-derive its probes/identity/events) and follow the UI selection.
    activeGameRef.current = activeExampleId ?? "";
    if (activeExampleId && coordConnectedRef.current) {
      const gameName =
        STRUCTURED_EXAMPLES[activeExampleId]?.name ?? activeExampleId;
      coordWsRef.current?.send(JSON.stringify({ op: "clear" }));
      coordWsRef.current?.send(
        JSON.stringify({
          op: "game",
          role: "player",
          slug: activeExampleId,
          name: gameName,
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeExampleId]);

  // Director control surface: write to the one History (in the coordinator). The op
  // goes to the server (authority); the new facts arrive back via the socket `facts`
  // broadcast, which re-narrates. Requires a coordinator connection (no local store).
  const director = useMemo(
    () => ({
      // Add/refresh a persistent world fact (weather, spawn, timed effect).
      assert(fact: Fact) {
        coordWsRef.current?.send(JSON.stringify({ op: "assert", fact }));
      },
      // Remove a fact by key (clear the snowstorm).
      retract(key: string) {
        coordWsRef.current?.send(JSON.stringify({ op: "retract", key }));
      },
    }),
    [coordWsRef],
  );

  // Runtime-switchable coordinator WS, DEFAULTING to the local History
  // coordinator (ws://localhost:8090) so the human-director loop is on by
  // default. Shared with the Director panel via localStorage + a window event,
  // so changing it there reconnects the Player here with no restart.
  const [coordWsUrl, setCoordWsUrl] = useState<string>(
    () =>
      (typeof window !== "undefined" &&
        window.localStorage.getItem("coordinatorWs")) ||
      process.env.NEXT_PUBLIC_COORDINATOR_WS ||
      "ws://localhost:8090",
  );
  useEffect(() => {
    const onEv = (e: Event) =>
      setCoordWsUrl((e as CustomEvent).detail || "ws://localhost:8090");
    if (typeof window !== "undefined")
      window.addEventListener("coordinator-ws", onEv);
    return () => {
      if (typeof window !== "undefined")
        window.removeEventListener("coordinator-ws", onEv);
    };
  }, []);

  // Dev/testing hook: drive the Director from the browser console, e.g.
  //   __director.assert({ key: "env:weather", clause: "a heavy snowstorm blows in", weight: 5, life: { kind: "sustained" } })
  //   __director.retract("env:weather")
  useEffect(() => {
    (window as unknown as { __director?: typeof director }).__director = director;
    return () => {
      delete (window as unknown as { __director?: typeof director }).__director;
    };
  }, [director]);

  return {
    director,
    pushSceneEvents,
    pushObjective,
    sceneDirEventsRef,
    objectiveRef,
    activeGameRef,
    coordWsUrl,
  };
}
