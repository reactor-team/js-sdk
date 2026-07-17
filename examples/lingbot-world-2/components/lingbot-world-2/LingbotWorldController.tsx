"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  useLingbotWorld2,
  useLingbotWorld2Message,
  type LingbotWorld2Message,
} from "@reactor-models/lingbot-world-2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  EXAMPLES,
  STRUCTURED_EXAMPLES,
  composePrompt,
  cloneScene,
  emptyScene,
  scenesEqual,
  isEventAvailable,
  type StructuredExample,
  type StructuredScene,
  type Objective,
  type NamedEvent,
  type GateState,
} from "@/lib/lingbot-world-prompts";
import { PlayerController } from "@/lib/player-controller";

import { LayeredSceneEditor } from "@/components/lingbot-world-2/LayeredSceneEditor";
import { LivePromptInspector } from "@/components/lingbot-world-2/LivePromptInspector";
import { PlayerHud } from "@/components/lingbot-world-2/PlayerHud";
import { useDirectorBridge } from "@/components/lingbot-world-2/controller/useDirectorBridge";
import {
  ChargeGridEditor,
  CrouchDipEditor,
} from "@/components/lingbot-world-2/controller/ChargeCrouchEditors";
import {
  CHUNK_LATENTS,
  NUM_CHARGE_LEVELS,
  LEVEL_DWELL_MS,
  useChargeCrouchPatterns,
} from "@/components/lingbot-world-2/controller/charge-crouch";
import { PadButton } from "@/components/lingbot-world-2/ControlPrimitives";
import { EventChips } from "@/components/lingbot-world-2/EventChips";
import { MovePad } from "@/components/lingbot-world-2/MovePad";
import { SidebarExamples } from "@/components/lingbot-world-2/SidebarExamples";
import {
  useHudGating,
  type VitalChange,
} from "@/components/lingbot-world-2/controller/useHudGating";
import { ControllerSidebar } from "@/components/lingbot-world-2/controller/ControllerSidebar";
import { ControllerControls } from "@/components/lingbot-world-2/controller/ControllerControls";
import {
  KEY_TO_MOVE_L,
  KEY_TO_MOVE_LAT,
  KEY_TO_LOOK_H,
  KEY_TO_LOOK_V,
  MOUSE_SENS_DEFAULT,
  MOUSE_SENS_MIN,
  MOUSE_SENS_MAX,
  MOUSE_MAX_ROT,
  ROLL_SPEED,
  ARROW_LOOK_SPEED,
  JUMP_SPEED,
  JOY_SPEED,
  JUMP_UP_SIGN,
  ORBIT_RADIUS_DEFAULT,
  ORBIT_RADIUS_STEP,
  CROUCH_DIP,
  CROUCH_SPEED,
  DIRECTOR_HOTKEYS,
  keyToHoldSlot,
  keyToDirectorIndex,
  type MoveL,
  type MoveLat,
  type LookH,
  type LookV,
  type JumpMode,
  type CrouchMode,
  type AttnWindow,
  type KvResetMode,
} from "@/components/lingbot-world-2/controller/input";
import {
  CUSTOM_SCENE_ID,
  OVERRIDES_STORAGE_KEY,
  vitalForEvent,
  isStructuredScene,
} from "@/components/lingbot-world-2/controller/scene-utils";

export function LingbotWorldController({ className }: { className?: string }) {
  // Typed LingBot World 2 surface. The setter methods (lw2.setPrompt, …) are
  // per-render wrappers around the store's stable `sendCommand`, so callbacks
  // keep `sendCommand` as their dependency anchor — a stale `lw2` closure
  // still drives the same underlying store. Raw `sendCommand` remains in use
  // only for the commands the published schema doesn't declare yet
  // (set_kv_cache_reset, trigger_kv_cache_reset).
  const lw2 = useLingbotWorld2();
  const { status, sendCommand, uploadFile } = lw2;

  const isReady = status === "ready";

  const [sentImagePreview, setSentImagePreview] = useState<string | null>(null);
  const [imageInfo, setImageInfo] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [pendingImage, setPendingImage] = useState<{
    file: File;
    previewUrl: string;
    label: string;
    presetSrc?: string;
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [loadingExampleId, setLoadingExampleId] = useState<string | null>(null);

  const [hasPrompt, setHasPrompt] = useState(false);
  const [hasImage, setHasImage] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [chunkNum, setChunkNum] = useState(0);
  const [activeAction, setActiveAction] = useState<string>("still");
  const [tspSize, setTspSize] = useState<number | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const [moveL, setMoveL] = useState<MoveL>("idle");
  const [moveLat, setMoveLat] = useState<MoveLat>("idle");
  const [lookH, setLookH] = useState<LookH>("idle");
  const [lookV, setLookV] = useState<LookV>("idle");
  const [cameraPoseActive, setCameraPoseActive] = useState(false);

  // --- Native camera-pose layer (mouse-look + jump) ---
  const [mouseLook, setMouseLook] = useState(false); // pointer-lock engaged
  const [vertDir, setVertState] = useState(0); // vertical: -1 crouch (C). Jump no longer uses this.
  const [rollDir, setRollDir] = useState(0); // roll: -1 (Q) / 0 / +1 (E)
  const [jumpMode, setJumpMode] = useState<JumpMode>("charge"); // "Jump" switch: hold / prompt / charge
  const [crouchMode, setCrouchMode] = useState<CrouchMode>("camera"); // "Crouch" switch: hold / prompt / camera
  const [jumpLit, setJumpLit] = useState(false); // Space button highlight (held or arc in flight)
  const [charging, setCharging] = useState(false); // charge mode: meter stepping while held
  const [chargeLevel, setChargeLevel] = useState(0); // discrete level 0..NUM (0 = empty)
  const [verticalPrompt, setVerticalPrompt] = useState(""); // live jump/crouch sentence (for the inspector)
  // Charge (jump) + crouch per-latent grid-editor patterns — state, persistence,
  // and cell/reset handlers. Refs are read by the jump-arc + crouch-dip logic below.
  const {
    chargePatterns,
    chargePatternsRef,
    editingLevel,
    setEditingLevel,
    cycleChargeCell,
    resetChargeLevel,
    crouchPatterns,
    crouchPatternsRef,
    editingCrouch,
    setEditingCrouch,
    cycleCrouchCell,
    resetCrouchPatterns,
  } = useChargeCrouchPatterns();
  const [mouseSens, setMouseSens] = useState(MOUSE_SENS_DEFAULT); // look sensitivity
  const [joy, setJoy] = useState({ x: 0, y: 0 }); // joystick knob (normalized −1..1)
  // Orbit: mouse-look circles a point R ahead instead of rotating in place. R is
  // the SOLE control — 0 = normal rotate-in-place (identical to no orbit), >0 =
  // orbit (bigger = wider/farther). No separate on/off flag: R=0 already IS "off".
  const [orbitRadius, setOrbitRadius] = useState(0);
  // DiT self-attention window override (backend `set_attn_window`). Default
  // "auto" mirrors the backend default (motion-based still-window trigger).
  const [attnWindow, setAttnWindow] = useState<AttnWindow>("auto");
  // KV-cache / RoPE reset mode (backend `set_kv_cache_reset`). Default "auto"
  // mirrors the shipped config default (kv_cache_reset_enable: true -> "auto").
  const [kvCacheResetMode, setKvCacheResetMode] = useState<KvResetMode>("auto");
  // Jump/crouch sentences live on the active scene (scene.jumpPrompt /
  // scene.crouchPrompt), edited in the scene editor — no outer state here.
  // Live mouse-signal HUD: a decaying recent-motion vector (screen px).
  const [mouseViz, setMouseViz] = useState({ x: 0, y: 0 });
  // Mouse movement accumulated (in pixels) since the last per-chunk send.
  // Converted to a per-frame rotation delta at send time, then zeroed.
  const pendingDYawRef = useRef(0); // += movementX (mouse right → yaw right)
  const pendingDPitchRef = useRef(0); // += movementY (mouse up → pitch up)
  const mouseVizRef = useRef({ x: 0, y: 0 }); // decaying viz vector (rAF-driven)
  const mouseLookRef = useRef(false);
  const vertDirRef = useRef(0); // -1 crouch / 0  (jump is tracked separately below)
  const rollDirRef = useRef(0); // -1 / 0 / +1
  // --- Jump (decoupled from vertDir so it can be prompt-only or camera) ---
  const jumpModeRef = useRef<JumpMode>("charge");
  useEffect(() => {
    jumpModeRef.current = jumpMode;
  }, [jumpMode]);
  const crouchModeRef = useRef<CrouchMode>("camera");
  useEffect(() => {
    crouchModeRef.current = crouchMode;
  }, [crouchMode]);
  // Camera mode: one-shot dips queued for the next chunk (press = down, release = up).
  const crouchPressDipRef = useRef(false);
  const crouchReleaseDipRef = useRef(false);
  const jumpHeldRef = useRef(false); // is the jump key/button physically held?
  // Charge-arc state (a per-latent vertical-intent plan, consumed CHUNK_LATENTS
  // at a time). arc[i] ∈ {+1 up, 0 still, -1 down}; empty = no arc in flight.
  const jumpArcRef = useRef<number[]>([]);
  const jumpArcPosRef = useRef(0); // index of the current chunk's first latent
  const chargeLevelRef = useRef(0); // live discrete level 1..NUM while charging
  const chargeLevelDirRef = useRef(1); // meter step direction (+1/-1)
  const mouseSensRef = useRef(MOUSE_SENS_DEFAULT);
  useEffect(() => {
    mouseSensRef.current = mouseSens;
  }, [mouseSens]);
  // Orbit: mirror to a ref so sendCameraPoseChunk reads the latest without re-subscribing.
  const orbitRadiusRef = useRef(0);
  useEffect(() => {
    orbitRadiusRef.current = orbitRadius;
  }, [orbitRadius]);
  // Last non-zero radius, so the O key can mute (→0) and un-mute back to it without losing the setting.
  const lastOrbitRadiusRef = useRef(ORBIT_RADIUS_DEFAULT);
  useEffect(() => {
    if (orbitRadius > 0) lastOrbitRadiusRef.current = orbitRadius;
  }, [orbitRadius]);
  const joyRef = useRef({ x: 0, y: 0 }); // normalized joystick vector (−1..1)
  const joyAreaRef = useRef<HTMLDivElement>(null);
  const poseSentActiveRef = useRef(false); // did we last send a non-empty pose?
  // Ref indirection so the message handler (defined above the callback) can
  // invoke the latest sendCameraPoseChunk without a declaration-order issue.
  const sendCameraPoseChunkRef = useRef<() => void>(() => {});

  const [rotationSpeed, setRotationSpeed] = useState(5.0);
  const [seed, setSeed] = useState(42);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // The active layered scene = the scene currently driving set_prompt.
  // Mirrors overrides[activeExampleId] (or the pristine example constant)
  // and lives separately because the user may pre-edit a different
  // example while one is running.
  const [scene, setScene] = useState<StructuredScene | null>(null);
  const [activeExampleId, setActiveExampleId] = useState<string | null>(null);

  // Per-example user edits. Reading the override during applyExample is
  // what makes edits survive re-clicks; clicking an example without an
  // override gets the pristine constant.
  const [overrides, setOverrides] = useState<Record<string, StructuredScene>>(
    {},
  );
  const [overridesLoaded, setOverridesLoaded] = useState(false);

  // Which example the editor modal is open for. Independent of
  // activeExampleId so the user can pre-edit example B while example A
  // is generating in the background.
  const [editingExampleId, setEditingExampleId] = useState<string | null>(null);
  const [heldSlots, setHeldSlots] = useState<number[]>([]);

  // Live read-only inspector — shown alongside the running generation
  // so the user can audit the current composed prompt and per-layer
  // contributions without leaving the running session.
  const [inspectorOpen, setInspectorOpen] = useState(false);

  // Restore overrides from localStorage on mount. Prune any whose
  // content is byte-equal to the pristine constant — those can happen
  // if a default ships with text the user had previously typed by hand,
  // and they'd otherwise leave a misleading "edited" badge on a card
  // whose effective prompt is identical to default.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(OVERRIDES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const out: Record<string, StructuredScene> = {};
          for (const [id, val] of Object.entries(
            parsed as Record<string, unknown>,
          )) {
            if (!isStructuredScene(val)) continue;
            const pristine = STRUCTURED_EXAMPLES[id]?.scene;
            if (pristine && scenesEqual(val, pristine)) continue;
            out[id] = val;
          }
          setOverrides(out);
        }
      }
    } catch {}
    setOverridesLoaded(true);
  }, []);

  useEffect(() => {
    if (!overridesLoaded) return;
    try {
      if (Object.keys(overrides).length > 0) {
        localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
      } else {
        localStorage.removeItem(OVERRIDES_STORAGE_KEY);
      }
    } catch {}
  }, [overrides, overridesLoaded]);

  const overridesRef = useRef<Record<string, StructuredScene>>({});
  useEffect(() => {
    overridesRef.current = overrides;
  }, [overrides]);

  // Returns the user-edited scene for an example if one exists, else a
  // freshly cloned copy of the pristine constant. Always returns a fresh
  // clone so the caller can mutate it without touching the source. For
  // CUSTOM_SCENE_ID there is no pristine constant — only the override.
  const effectiveSceneFor = useCallback(
    (id: string): StructuredScene | null => {
      const override = overridesRef.current[id];
      if (override) return cloneScene(override);
      if (id === CUSTOM_SCENE_ID) return null;
      const structured = STRUCTURED_EXAMPLES[id];
      return structured ? cloneScene(structured.scene) : null;
    },
    [],
  );

  const moveLStackRef = useRef<Array<Exclude<MoveL, "idle">>>([]);
  const moveLatStackRef = useRef<Array<Exclude<MoveLat, "idle">>>([]);
  const lastSentMoveLRef = useRef<MoveL>("idle");
  const lastSentMoveLatRef = useRef<MoveLat>("idle");
  const lookHDirRef = useRef(0); // -1 left / 0 / +1 right (feeds camera_pose yaw)
  const lookVDirRef = useRef(0); // -1 down / 0 / +1 up (feeds camera_pose pitch)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isReadyRef = useRef(isReady);
  useEffect(() => {
    isReadyRef.current = isReady;
  }, [isReady]);
  const isApplyingExampleRef = useRef(false);

  const lastSentPromptRef = useRef<string>("");
  // Mirror of the React `scene` state. Key handlers and recompose run
  // synchronously and need a ref-current value rather than the captured
  // stale state from their closure.
  const sceneRef = useRef<StructuredScene | null>(null);
  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);
  const heldSlotsRef = useRef<number[]>([]);

  // Declarative event gating: names of events that have fired this session, plus
  // a version counter so the UI (player keys + Director panel) re-derives event
  // availability when the fired-set changes. Reset on scene select / restart.

  // Persistent world facts contributed on top of the scene prose — Director
  // interventions (weather/time/spawns) and any timed effects. composePrompt()
  // owns the scene layer (base/camera/movement/held events, the ephemeral
  // "now"); history owns what PERSISTS across chunks and is re-narrated until
  // it expires. project() runs with no identity prefix so it emits only these
  // extra clauses, appended to the composed scene string.
  //   - Player + Director both write here (Director ops arrive via the relay in
  //     step #2; same-machine callers can use director directly).
  //   - advance() ages timed facts once per chunk_complete; an expired fact
  //     changes the string, which triggers a fresh set_prompt.
  // The one History lives in the coordinator (§6.1); no local instance here.
  // PlayerController = the client's input+rules+narration layer (rebuilt per scene in
  // recomputePromptAndSend). It owns no state — emits player ops to the coordinator.
  const pcRef = useRef<PlayerController | null>(null);

  // Optional remote coordinator (#2): when NEXT_PUBLIC_COORDINATOR_WS is set, the
  // authoritative History lives on a shared WebSocket server so a Director on a
  // SEPARATE browser/machine can write to it. This browser then becomes a thin
  // client — it forwards ops/ticks and consumes the server's projected clauses
  // instead of its local History. Unset → local History (single-machine), so #1
  // is unchanged. Video path (Reactor/local) is untouched either way.
  const coordWsRef = useRef<WebSocket | null>(null);
  const coordConnectedRef = useRef(false);
  const coordPromptRef = useRef<string>(""); // latest project() from the server

  // Player HUD vitals + event gating (state, refs, initHud/applyVital, win/lose
  // banner, __hud console hook). Cross-cutting effects that wire HUD state into
  // other subsystems (re-push director events, health-0 downed hold) stay below.
  const {
    firedVersion,
    gateStateNow,
    isAvailableNow,
    recordFired,
    hudHealth,
    hudMaxHealth,
    hudInventory,
    hudHealthLabel,
    gameResult,
    setGameResult,
    initHud,
    applyVital,
    setVitalsFromServer,
  } = useHudGating({ coordConnectedRef, coordWsRef });

  // Record a player command to the coordinator's command log (role "player").
  // No-op unless a coordinator is connected — the log lives server-side.
  const logPlayerCmd = useCallback((cmd: string, detail: unknown) => {
    if (coordConnectedRef.current) {
      coordWsRef.current?.send(
        JSON.stringify({ op: "log", role: "player", cmd, detail }),
      );
    }
  }, []);

  // Director/coordinator bridge — the `director` control surface, scene-event +
  // objective pushing (panel + coordinator), the switchable coordinator WS URL,
  // and the __director console hook. Shared coordinator refs are passed in; the
  // socket lifecycle stays here (it also carries player ops / facts / ticks), and
  // reads the refs this returns on (re)connect. See useDirectorBridge.ts.
  const [hudObjective, setHudObjective] = useState<string>(""); // objective.summary
  const {
    pushSceneEvents,
    pushObjective,
    sceneDirEventsRef,
    objectiveRef,
    activeGameRef,
    coordWsUrl,
  } = useDirectorBridge({
    coordWsRef,
    coordConnectedRef,
    activeExampleId,
    gateStateNow,
    setHudObjective,
  });

  const recomputePromptAndSend = useCallback(() => {
    // Vertical (jump/crouch) sentence appended to the prose so it matches the
    // motion. Jump: for hold/prompt while held; for charge only once the arc is
    // actually playing (not while merely charging up). Crouch: while C held.
    const jumpEngaged =
      (jumpModeRef.current !== "charge" && jumpHeldRef.current) ||
      jumpArcRef.current.length > 0;
    let vp = "";
    if (jumpEngaged) {
      vp = sceneRef.current?.jumpPrompt ?? "";
    } else if (vertDirRef.current < 0) {
      // C held → the scene's (editable) crouch line, in BOTH modes ("prompt" =
      // line only, "camera" = line alongside the dip), for the whole hold.
      vp = (sceneRef.current?.crouchPrompt ?? "").trim();
    } else if (crouchReleaseDipRef.current) {
      // Just released (camera mode): the "stands back up" line during the
      // release chunk, dropped once the release dip is consumed.
      vp = (sceneRef.current?.standPrompt ?? "").trim();
    }
    // Mirror it into state so the "Show prompt" inspector reflects it live.
    setVerticalPrompt(vp);

    // No active scene → nothing to compose (prompts only flow from scenes).
    if (!sceneRef.current) return;
    const isMoving =
      moveLStackRef.current.length > 0 || moveLatStackRef.current.length > 0;
    // PlayerController is the prompt producer: rebuild it when the scene changes, sync
    // input, then narrate (scene layer + its read-through). Its emit sink writes player
    // ops to the coordinator (Contract 3) for rule-driven effects (tool/sticky). With no
    // per-scene rules yet, narrate() == the old composePrompt (behavior-preserving).
    let pc = pcRef.current;
    if (!pc || pc.scene !== sceneRef.current) {
      pc = new PlayerController({
        scene: sceneRef.current,
        emit: (op) =>
          coordWsRef.current?.send(JSON.stringify({ ...op, role: "player" })),
      });
      pcRef.current = pc;
    }
    pc.setMoving(isMoving);
    pc.setHeld(heldSlotsRef.current);
    const scenePrompt = pc.narrate(vp).trim();
    // Append persistent world facts (Director interventions, timed effects).
    // Empty until something is asserted, so single-player is unchanged. When a
    // coordinator is connected, the facts come from the shared server instead
    // of local History (which the Director on another machine can't reach).
    // One History — it lives in the coordinator; the client reads its projection.
    const facts = coordPromptRef.current;
    const next = [scenePrompt, facts].filter(Boolean).join(" ").trim();
    if (!next) return;
    if (next === lastSentPromptRef.current) return;
    lastSentPromptRef.current = next;
    if (isReadyRef.current) {
      lw2.setPrompt({ prompt: next }).catch(console.error);
      logPlayerCmd("prompt", next);
    }
  }, [sendCommand, logPlayerCmd]);
  // Ref indirection so the per-chunk message handler can drop the jump
  // sentence when the arc ends without capturing a stale callback.
  const recomputePromptAndSendRef = useRef<() => void>(() => {});
  useEffect(() => {
    recomputePromptAndSendRef.current = recomputePromptAndSend;
  }, [recomputePromptAndSend]);

  // Connect to the shared coordinator. On `facts` we cache the server's projected
  // clauses and re-narrate; a Director writing to the same server thus steers this
  // Player's prompt. If the server is unreachable the socket errors and we fall
  // back to local History (coordConnectedRef stays false).
  useEffect(() => {
    const url = coordWsUrl;
    if (!url) return;
    const ws = new WebSocket(url);
    coordWsRef.current = ws;
    ws.onopen = () => {
      coordConnectedRef.current = true;
      // Re-push the current scene's director events for a late-connecting panel.
      if (sceneDirEventsRef.current.length) {
        ws.send(JSON.stringify({ op: "scene_events", events: sceneDirEventsRef.current }));
      }
      if (objectiveRef.current) {
        ws.send(JSON.stringify({ op: "objective", objective: objectiveRef.current }));
      }
      if (activeGameRef.current) {
        const gameName = STRUCTURED_EXAMPLES[activeGameRef.current]?.name ?? activeGameRef.current;
        ws.send(JSON.stringify({ op: "game", role: "player", slug: activeGameRef.current, name: gameName }));
      }
    };
    ws.onclose = () => {
      coordConnectedRef.current = false;
    };
    ws.onerror = () => {
      coordConnectedRef.current = false;
    };
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(String(e.data)) as {
          type?: string;
          prompt?: string;
          health?: number;
          inventory?: string[];
        };
        if (m.type === "facts") {
          coordPromptRef.current = m.prompt ?? "";
          recomputePromptAndSendRef.current();
        } else if (m.type === "vitals") {
          setVitalsFromServer(m.health ?? 0, m.inventory ?? []);
        } else if (m.type === "won") {
          setGameResult("won"); // objective survived — the coordinator fired the reward
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => {
      coordConnectedRef.current = false;
      coordWsRef.current = null;
      ws.close();
    };
  }, [coordWsUrl]);

  // Re-push director events (with fresh `available` flags) whenever the fired-set
  // or health changes, so gated events unlock live in the Director panel.
  useEffect(() => {
    if (sceneRef.current) pushSceneEvents(sceneRef.current);
  }, [firedVersion, hudHealth, pushSceneEvents]);

  // Auto game-over: when health hits 0, "hold" the scene's "Falls and Dies" event
  // so composePrompt swaps to the downed base/camera/movement (the officer
  // collapses face-down and stays down). Reuses the same held-event compose path
  // as a player hold-key; auto-releases if health is restored (reset), returning
  // to the live scene. Requires a "Falls and Dies" event with baseVersion:"downed".
  useEffect(() => {
    const sc = sceneRef.current;
    if (!sc) return;
    const deathIdx = sc.events.findIndex((e) => e.name === "Player Falls and Dies");
    if (deathIdx < 0) return;
    const held = heldSlotsRef.current.includes(deathIdx);
    if (hudHealth <= 0 && !held) {
      heldSlotsRef.current = [...heldSlotsRef.current, deathIdx];
      setHeldSlots([...heldSlotsRef.current]);
      recomputePromptAndSendRef.current();
    } else if (hudHealth > 0 && held) {
      heldSlotsRef.current = heldSlotsRef.current.filter((s) => s !== deathIdx);
      setHeldSlots([...heldSlotsRef.current]);
      recomputePromptAndSendRef.current();
    }
  }, [hudHealth]);

  // ---- Messages from backend ----

  useLingbotWorld2Message((raw) => {
    // The published schema (0.2.5) doesn't declare `workers_ready` yet, so
    // widen the union locally; every other branch narrows to its typed shape.
    const msg = raw as
      | LingbotWorld2Message
      | { type: "workers_ready"; tsp_size?: number };
    if (!msg?.type) return;
    switch (msg.type) {
      case "workers_ready":
        setTspSize(msg.tsp_size ?? null);
        break;
      case "prompt_accepted":
        setHasPrompt(true);
        break;
      case "image_accepted":
        setHasImage(true);
        setImageInfo({ w: msg.width, h: msg.height });
        break;
      case "conditions_ready":
        setHasPrompt(msg.has_prompt);
        setHasImage(msg.has_image);
        break;
      case "state":
        setHasPrompt(msg.has_prompt);
        setHasImage(msg.has_image);
        setIsGenerating(msg.running && msg.started);
        setIsPaused(msg.paused);
        setCameraPoseActive(msg.camera_pose_active);
        break;
      case "generation_started":
        setIsGenerating(true);
        setIsPaused(false);
        setChunkNum(msg.chunk_num);
        setChunkIndex(0);
        break;
      case "chunk_complete":
        setChunkIndex(msg.chunk_index);
        setActiveAction(msg.active_action || "still");
        // Age persistent facts one chunk. A `steps` fact that runs out (a
        // Director spawn on a timer) drops, changing the composed string and
        // triggering a fresh set_prompt. Aging is the coordinator's job (the one
        // History) — forward the chunk tick so it tracks the real rate.
        coordWsRef.current?.send(JSON.stringify({ op: "tick" }));
        // The crouch dips each last a single chunk. When the release dip ends,
        // drop the "stands up" line too.
        crouchPressDipRef.current = false;
        if (crouchReleaseDipRef.current) {
          crouchReleaseDipRef.current = false;
          recomputePromptAndSendRef.current();
        }
        // Advance the charge-mode jump arc by one chunk (CHUNK_LATENTS latents).
        // The arc auto-plays after release — no hold required during flight.
        if (jumpModeRef.current === "charge" && jumpArcRef.current.length > 0) {
          jumpArcPosRef.current += CHUNK_LATENTS;
          if (jumpArcPosRef.current >= jumpArcRef.current.length) {
            jumpArcRef.current = []; // landed
            jumpArcPosRef.current = 0;
            setJumpLit(false);
            recomputePromptAndSendRef.current(); // drop the jump sentence
          }
        }
        // Drive the native camera-pose layer one chunk at a time.
        sendCameraPoseChunkRef.current();
        break;
      case "generation_paused":
        setIsPaused(true);
        break;
      case "generation_resumed":
        setIsPaused(false);
        break;
      case "generation_complete":
        setIsGenerating(false);
        setIsPaused(false);
        break;
      case "generation_reset":
        setIsGenerating(false);
        setIsPaused(false);
        clearMovementInputs(); // never leave a held control stuck after a reset
        // Drop Director facts — don't leak into the next world. Routed to the
        // coordinator (the one History) so the reset is authoritative.
        coordWsRef.current?.send(JSON.stringify({ op: "clear" }));
        applyVital({ reset: true }); // vitals back to full for the next world
        if (isApplyingExampleRef.current) break;
        setHasPrompt(false);
        setHasImage(false);
        setLoadingExampleId(null);
        setSentImagePreview(null);
        setImageInfo(null);
        setChunkIndex(0);
        lastSentPromptRef.current = "";
        heldSlotsRef.current = [];
        setHeldSlots([]);
        sceneRef.current = null;
        setScene(null);
        setActiveExampleId(null);
        // Overrides persist across resets (they're per-example presets,
        // not session state).
        if (pendingImage && pendingImage.previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(pendingImage.previewUrl);
        }
        setPendingImage(null);
        break;
      case "command_error":
        setErrorToast(
          `${msg.command || "?"}: ${msg.reason || "unknown error"}`,
        );
        break;
    }
  });

  useEffect(() => {
    if (!errorToast) return;
    const id = setTimeout(() => setErrorToast(null), 4000);
    return () => clearTimeout(id);
  }, [errorToast]);

  useEffect(() => {
    if (status === "disconnected") {
      setHasPrompt(false);
      setHasImage(false);
      setIsGenerating(false);
      setIsPaused(false);
      setChunkIndex(0);
      setChunkNum(0);
      setActiveAction("still");
      setTspSize(null);
      moveLStackRef.current = [];
      moveLatStackRef.current = [];
      lastSentMoveLRef.current = "idle";
      lastSentMoveLatRef.current = "idle";
      lookHDirRef.current = 0;
      lookVDirRef.current = 0;
      lastSentPromptRef.current = "";
      sceneRef.current = null;
      heldSlotsRef.current = [];
      setHeldSlots([]);
      setMoveL("idle");
      setMoveLat("idle");
      setLookH("idle");
      setLookV("idle");
      setCameraPoseActive(false);
      // Reset the camera-pose layer + release pointer lock.
      if (typeof document !== "undefined" && document.pointerLockElement)
        document.exitPointerLock();
      pendingDYawRef.current = 0;
      pendingDPitchRef.current = 0;
      mouseVizRef.current = { x: 0, y: 0 };
      setMouseViz({ x: 0, y: 0 });
      joyRef.current = { x: 0, y: 0 };
      setJoy({ x: 0, y: 0 });
      mouseLookRef.current = false;
      vertDirRef.current = 0;
      rollDirRef.current = 0;
      jumpHeldRef.current = false;
      jumpArcRef.current = [];
      jumpArcPosRef.current = 0;
      chargeLevelRef.current = 0;
      crouchPressDipRef.current = false;
      crouchReleaseDipRef.current = false;
      poseSentActiveRef.current = false;
      setMouseLook(false);
      setVertState(0);
      setRollDir(0);
      setJumpLit(false);
      setCharging(false);
      setChargeLevel(0);
      setScene(null);
      setActiveExampleId(null);
      setSentImagePreview(null);
      setImageInfo(null);
      setLoadingExampleId(null);
      setPendingImage((prev) => {
        if (prev && prev.previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(prev.previewUrl);
        }
        return null;
      });
      // Model session disconnected -> clear the SELECTED GAME on the shared
      // coordinator so the AI director goes idle (no game) instead of directing a
      // phantom scene. The coordinator also unloads on socket close, but a session
      // Disconnect can happen with the tab (and coordinator socket) still open.
      if (coordConnectedRef.current) {
        coordWsRef.current?.send(JSON.stringify({ op: "game", slug: "" }));
      }
      // Note: do NOT clear overrides on disconnect; they're a presets
      // store that should persist across sessions.
    }
  }, [status]);

  // Sync initial rotation speed to backend on connect
  useEffect(() => {
    if (isReady)
      lw2
        .setRotationSpeedDeg({ rotation_speed_deg: rotationSpeed })
        .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  // Re-assert the DiT attention-window + KV-cache-reset selections on connect,
  // so a fresh session reflects the UI state rather than only the config default.
  useEffect(() => {
    if (!isReady) return;
    lw2.setAttnWindow({ attn_window: attnWindow }).catch(console.error);
    sendCommand("set_kv_cache_reset", { mode: kvCacheResetMode }).catch(
      console.error,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  // ---- Native camera-pose layer (mouse-look + jump) ----

  // Send one per-frame camera-pose DELTA for the next chunk, reflecting input
  // accumulated since the last send. Called on every chunk_complete (and once
  // when a control engages). When nothing is active, send [] once to hand
  // rotation back to the arrow keys / translation back to WASD.
  const sendCameraPoseChunk = useCallback(() => {
    if (!isReadyRef.current) return;
    const joyActive = joyRef.current.x !== 0 || joyRef.current.y !== 0;
    // Jump contributes translation in "hold" (up while held) and "charge"
    // (the per-latent up→down arc while it plays). "prompt" never touches pose.
    const arcActive =
      jumpModeRef.current === "charge" && jumpArcRef.current.length > 0;
    const jumpMoving =
      (jumpModeRef.current === "hold" && jumpHeldRef.current) || arcActive;
    // Crouch camera mode contributes a one-shot dip (press = down / release = up),
    // each lasting exactly one chunk.
    const crouchDip = crouchPressDipRef.current
      ? crouchPatternsRef.current.press
      : crouchReleaseDipRef.current
        ? crouchPatternsRef.current.release
        : null;
    // Crouch "hold" mode contributes a sustained DOWN translation for as long as
    // C is held (mirror of jump "hold" up) — uniform on every latent, re-sent each
    // chunk so the descent continues, no return.
    const crouchHolding =
      crouchModeRef.current === "hold" && vertDirRef.current < 0;
    const arrowLooking = lookHDirRef.current !== 0 || lookVDirRef.current !== 0;
    const active =
      mouseLookRef.current ||
      crouchDip !== null ||
      crouchHolding ||
      rollDirRef.current !== 0 ||
      joyActive ||
      jumpMoving ||
      arrowLooking;
    if (!active) {
      if (poseSentActiveRef.current) {
        lw2.setCameraPose({ camera_pose: [] }).catch(console.error);
        poseSentActiveRef.current = false;
      }
      pendingDYawRef.current = 0;
      pendingDPitchRef.current = 0;
      return;
    }
    // Rotation + horizontal translation are UNIFORM across the chunk's latents:
    // yaw (mouse X + arrow left/right) + pitch (mouse Y + arrow up/down) + roll
    // (Q/E), clamped to ±MOUSE_MAX_ROT so a fling can't over-rotate; joystick
    // strafe/forward on tx/tz.
    const clampRot = (v: number) =>
      Math.max(-MOUSE_MAX_ROT, Math.min(MOUSE_MAX_ROT, v));
    const ry = clampRot(
      pendingDYawRef.current * mouseSensRef.current +
        lookHDirRef.current * ARROW_LOOK_SPEED,
    ); // yaw
    const rx = clampRot(
      -pendingDPitchRef.current * mouseSensRef.current +
        lookVDirRef.current * ARROW_LOOK_SPEED,
    ); // pitch
    const rz = rollDirRef.current * ROLL_SPEED; // roll
    pendingDYawRef.current = 0;
    pendingDPitchRef.current = 0;
    // Orbit (Phase 1, horizontal): pair the yaw θ we're already sending with a
    // camera-local strafe (−R·sinθ) + forward sagitta (R·(1−cosθ)) so the point
    // R ahead stays centered while the camera circles it. θ is the clamped ry,
    // so a fling can't over-strafe either; adds to any joystick translation.
    // Zero yaw → zero orbit motion, so this only moves while you mouse-look.
    let orbitTx = 0,
      orbitTz = 0;
    const R = orbitRadiusRef.current;
    if (R > 0 && ry !== 0) {
      orbitTx = -R * Math.sin(ry);
      orbitTz = R * (1 - Math.cos(ry));
    }
    const tx = joyRef.current.x * JOY_SPEED + orbitTx; // joystick strafe + orbit
    const tz = -joyRef.current.y * JOY_SPEED + orbitTz; // joystick forward (up = +Z) + orbit
    // Vertical (ty) is the only PER-LATENT component. Jump: "hold" = up on every
    // latent; "charge" = the arc's per-latent intent. Crouch (camera mode) = a
    // one-shot small down on the FIRST latent only, additive to WASD/forward
    // (the backend sums the action + camera_pose translations). +up = JUMP_UP_SIGN.
    const uniformJumpTy =
      jumpModeRef.current === "hold" && jumpHeldRef.current
        ? JUMP_SPEED * JUMP_UP_SIGN
        : 0;
    // Crouch "hold": sustained DOWN, opposite sign to jump's up, uniform per latent.
    const uniformCrouchTy = crouchHolding ? CROUCH_SPEED * -JUMP_UP_SIGN : 0;
    const arc = jumpArcRef.current;
    const pos = jumpArcPosRef.current;
    const camera_pose: number[] = [];
    for (let j = 0; j < CHUNK_LATENTS; j++) {
      const intent = arcActive && pos + j < arc.length ? arc[pos + j] : 0; // +1/0/-1
      const jumpTy = arcActive
        ? intent * JUMP_SPEED * JUMP_UP_SIGN
        : uniformJumpTy;
      // Crouch: camera-mode dip (editable per-latent +1 up/0 still/-1 down), else the
      // hold-mode sustained down. Dips and hold are mutually exclusive (distinct modes).
      const crouchTy = crouchDip
        ? crouchDip[j] * CROUCH_DIP * JUMP_UP_SIGN
        : uniformCrouchTy;
      camera_pose.push(rx, ry, rz, tx, jumpTy + crouchTy, tz);
    }
    lw2.setCameraPose({ camera_pose }).catch(console.error);
    poseSentActiveRef.current = true;
  }, [sendCommand]);
  useEffect(() => {
    sendCameraPoseChunkRef.current = sendCameraPoseChunk;
  }, [sendCameraPoseChunk]);

  // Pointer-lock mouse look: click the toggle to engage, move the mouse to
  // rotate (yaw from movementX, pitch from movementY), Esc / M to release.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!mouseLookRef.current) return;
      pendingDYawRef.current += e.movementX; // right → yaw right
      pendingDPitchRef.current += e.movementY; // converted (negated) at send
      // Feed the live HUD: accumulate recent motion (decayed each rAF frame).
      mouseVizRef.current.x += e.movementX;
      mouseVizRef.current.y += e.movementY;
    };
    const onLockChange = () => {
      const locked = document.pointerLockElement != null;
      mouseLookRef.current = locked;
      setMouseLook(locked);
      if (!locked) {
        // released → clear the HUD vector
        mouseVizRef.current.x = 0;
        mouseVizRef.current.y = 0;
        setMouseViz({ x: 0, y: 0 });
      }
      // Push promptly so the next chunk reflects the new state (engage or release).
      sendCameraPoseChunk();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("pointerlockchange", onLockChange);
    };
  }, [sendCameraPoseChunk]);

  // HUD animation: while mouse-look is on, decay the viz vector toward 0 each
  // frame so the arrow shows recent motion direction + strength and settles
  // when the mouse stops.
  useEffect(() => {
    if (!mouseLook) return;
    let raf = 0;
    const tick = () => {
      const v = mouseVizRef.current;
      v.x *= 0.8;
      v.y *= 0.8;
      if (Math.abs(v.x) < 0.1) v.x = 0;
      if (Math.abs(v.y) < 0.1) v.y = 0;
      setMouseViz({ x: v.x, y: v.y });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mouseLook]);

  const toggleMouseLook = useCallback(() => {
    if (mouseLookRef.current) {
      document.exitPointerLock();
    } else {
      try {
        document.body.requestPointerLock();
      } catch {
        /* needs user gesture */
      }
    }
  }, []);

  // Crouch control (C): -1 = held, 0 = off. Jump is separate.
  const setVert = useCallback(
    (dir: number) => {
      if (vertDirRef.current === dir) return;
      const wasIdle = vertDirRef.current === 0;
      vertDirRef.current = dir;
      setVertState(dir);
      // "hold" mode has no dip flags — the sustained DOWN is emitted every chunk by
      // sendCameraPoseChunk while vertDir < 0 (see `crouchHolding` there).
      // "camera" mode fires one-shot dips (consumed after one chunk): the PRESS
      // pattern (down) on C-down, the RELEASE pattern (stand back up) on C-up.
      // Prompt lines ride along via recomputePromptAndSend (crouch while held,
      // stand on release).
      if (crouchModeRef.current === "camera") {
        if (dir < 0 && wasIdle)
          crouchPressDipRef.current = true; // pressed → dip down
        else if (dir === 0) crouchReleaseDipRef.current = true; // released → stand up
      }
      sendCameraPoseChunk(); // engage the dip promptly (camera mode)
      recomputePromptAndSend(); // crouch line while held / stand line on release
    },
    [sendCameraPoseChunk, recomputePromptAndSend],
  );

  // Jump press. Behaviour depends on the "Jump" mode switch:
  //   hold   — engage a sustained UP translation while held.
  //   prompt — just append the scene's jumpPrompt (no camera_pose).
  //   charge — start the charge meter stepping through levels; no motion/prompt yet.
  const onJumpDown = useCallback(() => {
    // Block re-triggers: ignore key-repeat while held, AND ignore a fresh press
    // while a charge arc is still airborne — no re-jump until it lands (no
    // double-jump), mirroring how a real jump can't restart mid-flight.
    if (jumpHeldRef.current || jumpArcRef.current.length > 0) return;
    jumpHeldRef.current = true;
    setJumpLit(true);
    if (jumpModeRef.current === "charge") {
      jumpArcPosRef.current = 0; // arc is guaranteed empty here (guarded above)
      chargeLevelRef.current = 1;
      chargeLevelDirRef.current = 1;
      setChargeLevel(1);
      setCharging(true); // meter starts stepping; jump fires on release
      return; // no translation / no prompt while charging
    }
    sendCameraPoseChunk(); // hold: engage the up translation; prompt: no-op
    recomputePromptAndSend(); // append the jump sentence
  }, [sendCameraPoseChunk, recomputePromptAndSend]);

  // Jump release.
  const onJumpUp = useCallback(() => {
    if (!jumpHeldRef.current) return;
    jumpHeldRef.current = false;
    if (jumpModeRef.current === "charge") {
      // Freeze the meter at its discrete level and fire that level's hand-authored
      // per-latent pattern (edited in the grid popup; +1 up / -1 down / 0 still).
      // Auto-plays via the chunk driver.
      setCharging(false);
      const level = chargeLevelRef.current || 1;
      jumpArcRef.current = [...(chargePatternsRef.current[level - 1] ?? [])];
      jumpArcPosRef.current = 0;
      setChargeLevel(0); // meter empties; the arc is now in flight
      // keep lit + prompt through the flight (dropped when it lands)
      sendCameraPoseChunk(); // engage the first chunk's latents promptly
      recomputePromptAndSend(); // append the jump sentence for the arc
      return;
    }
    setJumpLit(false);
    sendCameraPoseChunk(); // hold: release the up translation; prompt: no-op
    recomputePromptAndSend(); // drop the jump sentence
  }, [sendCameraPoseChunk, recomputePromptAndSend]);

  // Flip the Jump mode. Cancel any in-flight jump / charge so the switch is clean.
  const changeJumpMode = useCallback(
    (mode: JumpMode) => {
      if (jumpModeRef.current === mode) return;
      jumpModeRef.current = mode;
      setJumpMode(mode);
      jumpHeldRef.current = false;
      jumpArcRef.current = [];
      jumpArcPosRef.current = 0;
      setCharging(false);
      chargeLevelRef.current = 0;
      setChargeLevel(0);
      setJumpLit(false);
      sendCameraPoseChunk(); // clear any lingering up/down pose
      recomputePromptAndSend(); // drop the jump sentence if it was appended
    },
    [sendCameraPoseChunk, recomputePromptAndSend],
  );

  // Flip the Crouch mode; release any held crouch so nothing sticks.
  const changeCrouchMode = useCallback(
    (mode: CrouchMode) => {
      if (crouchModeRef.current === mode) return;
      crouchModeRef.current = mode;
      setCrouchMode(mode);
      setVert(0); // release any held crouch (clears vertDir, re-sends pose)
      crouchPressDipRef.current = false;
      crouchReleaseDipRef.current = false; // after setVert, so no stray dip
    },
    [setVert],
  );

  // Charge meter: while charging, step through the discrete levels (1..NUM),
  // dwelling LEVEL_DWELL_MS on each and bouncing at the ends.
  useEffect(() => {
    if (!charging) return;
    let raf = 0;
    let lastStep = 0; // timestamp of the last level change
    const tick = (t: number) => {
      if (lastStep === 0) lastStep = t;
      if (t - lastStep >= LEVEL_DWELL_MS) {
        lastStep = t;
        let lvl = chargeLevelRef.current + chargeLevelDirRef.current;
        if (lvl >= NUM_CHARGE_LEVELS) {
          lvl = NUM_CHARGE_LEVELS;
          chargeLevelDirRef.current = -1;
        } else if (lvl <= 1) {
          lvl = 1;
          chargeLevelDirRef.current = 1;
        }
        chargeLevelRef.current = lvl;
        setChargeLevel(lvl);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [charging]);

  // Roll (the 3rd rotation DOF the mouse can't reach): -1 = Q, +1 = E, 0 = off.
  const setRoll = useCallback(
    (dir: number) => {
      if (rollDirRef.current === dir) return;
      rollDirRef.current = dir;
      setRollDir(dir);
      sendCameraPoseChunk();
    },
    [sendCameraPoseChunk],
  );

  // Drag joystick → continuous translation (camera_pose tx/tz). Unlike the
  // discrete WASD buttons, this gives a continuous direction + magnitude. The
  // knob position is normalized to the unit disk; releasing snaps back to 0.
  const onJoyPointer = useCallback(
    (e: React.PointerEvent, kind: "down" | "move" | "up") => {
      if (kind === "up") {
        joyRef.current = { x: 0, y: 0 };
        setJoy({ x: 0, y: 0 });
        sendCameraPoseChunk();
        return;
      }
      const el = joyAreaRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const m = Math.hypot(x, y);
      if (m > 1) {
        x /= m;
        y /= m;
      } // clamp to unit disk
      joyRef.current = { x, y };
      setJoy({ x, y });
      if (kind === "down") sendCameraPoseChunk(); // engage promptly
    },
    [sendCameraPoseChunk],
  );

  // ---- Movement / look emitters ----

  const pushMoveL = useCallback(
    (next: MoveL) => {
      setMoveL(next);
      if (lastSentMoveLRef.current === next) return;
      lastSentMoveLRef.current = next;
      if (isReadyRef.current)
        lw2
          .setMoveLongitudinal({ move_longitudinal: next })
          .catch(console.error);
    },
    [sendCommand],
  );

  const pushMoveLat = useCallback(
    (next: MoveLat) => {
      setMoveLat(next);
      if (lastSentMoveLatRef.current === next) return;
      lastSentMoveLatRef.current = next;
      if (isReadyRef.current)
        lw2.setMoveLateral({ move_lateral: next }).catch(console.error);
    },
    [sendCommand],
  );

  const pushLookH = useCallback(
    (next: LookH) => {
      setLookH(next);
      const dir = next === "right" ? 1 : next === "left" ? -1 : 0;
      if (lookHDirRef.current === dir) return;
      lookHDirRef.current = dir;
      sendCameraPoseChunk(); // engage promptly, like roll/joystick
    },
    [sendCameraPoseChunk],
  );

  const pushLookV = useCallback(
    (next: LookV) => {
      setLookV(next);
      const dir = next === "up" ? 1 : next === "down" ? -1 : 0;
      if (lookVDirRef.current === dir) return;
      lookVDirRef.current = dir;
      sendCameraPoseChunk(); // engage promptly, like roll/joystick
    },
    [sendCameraPoseChunk],
  );

  const applyMovementStack = useCallback(() => {
    const topL = moveLStackRef.current.at(-1);
    const topLat = moveLatStackRef.current.at(-1);
    pushMoveL(topL ?? "idle");
    pushMoveLat(topLat ?? "idle");
    // Structured prompts depend on whether anything is held; recompose so
    // base + movement[isMoving] + events stays in sync with the input state.
    if (sceneRef.current) recomputePromptAndSend();
  }, [pushMoveL, pushMoveLat, recomputePromptAndSend]);

  // Zero every held-input control (WASD/joystick/look/roll/vert + mouse viz).
  // Called on reset: a key still physically held when Reset is clicked can lose
  // its keyup (focus jumps to the Reset button), which would otherwise leave the
  // joystick mirror — and the move state it reflects — stuck deflected.
  const clearMovementInputs = useCallback(() => {
    moveLStackRef.current = [];
    moveLatStackRef.current = [];
    joyRef.current = { x: 0, y: 0 };
    setJoy({ x: 0, y: 0 });
    pendingDYawRef.current = 0;
    pendingDPitchRef.current = 0;
    mouseVizRef.current = { x: 0, y: 0 };
    setMouseViz({ x: 0, y: 0 });
    setVert(0);
    setRoll(0);
    jumpHeldRef.current = false;
    jumpArcRef.current = [];
    jumpArcPosRef.current = 0;
    crouchPressDipRef.current = false;
    crouchReleaseDipRef.current = false;
    setCharging(false);
    chargeLevelRef.current = 0;
    setChargeLevel(0);
    setJumpLit(false);
    applyMovementStack(); // pushes moveL/moveLat back to "idle"
    pushLookH("idle");
    pushLookV("idle");
  }, [applyMovementStack, pushLookH, pushLookV, setVert, setRoll]);

  // ---- Prompt handlers ----

  const holdPress = useCallback(
    (slot: number) => {
      const events = sceneRef.current?.events;
      if (!events || slot < 0 || slot >= events.length) return;
      if (events[slot]?.actor === "director") return; // director events use ALPHABETIC hotkeys (fireDirectorEvent), not number keys
      if (!isAvailableNow(events[slot])) return; // gated: prerequisites not met yet
      if (!heldSlotsRef.current.includes(slot)) {
        heldSlotsRef.current = [...heldSlotsRef.current, slot];
        const ev = events[slot];
        recordFired(ev?.name);
        logPlayerCmd("event_press", { slot, name: ev?.name });
        // Player event may change shared vitals (fires once, on fresh press).
        // Prefer the event's explicit vital fields; fall back to name keywords.
        const change: VitalChange | null =
          ev &&
          (ev.health !== undefined || ev.addItem || ev.removeItem)
            ? { health: ev.health, addItem: ev.addItem, removeItem: ev.removeItem }
            : vitalForEvent(ev?.name);
        if (change) {
          applyVital(change, ev?.name); // vital carries the name -> "player · <action> (+X)"
        } else if (ev?.name && coordConnectedRef.current) {
          // No vital: still log the action so EVERY player action shows in the feed, in order.
          coordWsRef.current?.send(
            JSON.stringify({ op: "log", role: "player", cmd: "action", detail: ev.name, name: ev.name }),
          );
        }
      }
      setHeldSlots(heldSlotsRef.current);
      recomputePromptAndSend();
    },
    [recomputePromptAndSend, applyVital, logPlayerCmd, isAvailableNow, recordFired],
  );

  const holdRelease = useCallback(
    (slot: number) => {
      if (!heldSlotsRef.current.includes(slot)) return;
      heldSlotsRef.current = heldSlotsRef.current.filter((x) => x !== slot);
      logPlayerCmd("event_release", { slot });
      setHeldSlots(heldSlotsRef.current);
      recomputePromptAndSend();
    },
    [recomputePromptAndSend, logPlayerCmd],
  );

  // Fire a DIRECTOR event straight from its alphabetic hotkey (DIRECTOR_HOTKEYS),
  // so a solo player can act (numbers/WASD) AND direct (letters) at once. Mirrors
  // the Director panel's fireEvent: assert the clause as a sustained shared-History
  // fact (role "human") + apply any vital. dirIndex is the event's director-order
  // position (same order as sceneDirEventsRef / the panel's SCENE buttons). No-op
  // if not connected to the coordinator (character keeps playing regardless).
  const fireDirectorEvent = useCallback(
    (dirIndex: number) => {
      if (!coordConnectedRef.current) return;
      const ev = sceneDirEventsRef.current[dirIndex];
      if (!ev) return;
      const full = sceneRef.current?.events.find((e) => e.name === ev.name);
      if (full && !isAvailableNow(full)) return; // gated: prerequisites not met yet
      recordFired(ev.name);
      const key = "scene:" + ev.name.toLowerCase().replace(/\s+/g, "_");
      coordWsRef.current?.send(
        JSON.stringify({
          op: "assert",
          role: "human",
          fact: { key, clause: ev.clause, weight: 2, life: { kind: "sustained" } },
        }),
      );
      if (ev.health !== undefined || ev.addItem) {
        coordWsRef.current?.send(
          JSON.stringify({
            op: "vital",
            role: "human",
            change: { health: ev.health, addItem: ev.addItem },
          }),
        );
      }
      // Spawn/kill count: pressing a director key bumps the shared entity count.
      if (ev.count) {
        coordWsRef.current?.send(
          JSON.stringify({ op: "count", role: "human", delta: ev.count }),
        );
      }
      logPlayerCmd("director_fire", {
        key: DIRECTOR_HOTKEYS[dirIndex],
        name: ev.name,
      });
    },
    [logPlayerCmd],
  );

  useEffect(() => {
    const onBlur = () => {
      moveLStackRef.current = [];
      moveLatStackRef.current = [];
      applyMovementStack();
      pushLookH("idle");
      pushLookV("idle");
      heldSlotsRef.current = [];
      setHeldSlots([]);
      recomputePromptAndSend();
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [applyMovementStack, pushLookH, pushLookV, recomputePromptAndSend]);

  // ---- Keyboard ----

  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    };

    // When a movement / look key is pressed but a button (or other
    // focusable, non-typing element) inside a scrollable ancestor still
    // holds focus, the browser may scroll that ancestor before our window
    // handler runs preventDefault. Move focus off such elements before
    // dispatching, so the only effect of the key is the controller action.
    const blurFocusedNonTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return;
      if (isTypingTarget(el)) return;
      el.blur?.();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isTypingTarget(e.target)) return;

      const mvL = KEY_TO_MOVE_L[e.key];
      if (mvL) {
        e.preventDefault();
        blurFocusedNonTyping();
        const stack = moveLStackRef.current;
        if (!stack.includes(mvL)) stack.push(mvL);
        applyMovementStack();
        return;
      }
      const mvLat = KEY_TO_MOVE_LAT[e.key];
      if (mvLat) {
        e.preventDefault();
        blurFocusedNonTyping();
        const stack = moveLatStackRef.current;
        if (!stack.includes(mvLat)) stack.push(mvLat);
        applyMovementStack();
        return;
      }
      // Arrow look feeds the same camera_pose yaw/pitch as mouse-look (see
      // ARROW_LOOK_SPEED / sendCameraPoseChunk) — a steady, fixed-rate look,
      // so it also drives orbit. An arrow key while mouse-look (pointer lock)
      // is engaged still preempts it (release the lock, same as Esc) so the
      // arrows read as a clean, deliberate handoff from free-look.
      const lh = KEY_TO_LOOK_H[e.key];
      if (lh) {
        e.preventDefault();
        blurFocusedNonTyping();
        if (mouseLookRef.current) document.exitPointerLock();
        pushLookH(lh);
        return;
      }
      const lv = KEY_TO_LOOK_V[e.key];
      if (lv) {
        e.preventDefault();
        blurFocusedNonTyping();
        if (mouseLookRef.current) document.exitPointerLock();
        pushLookV(lv);
        return;
      }

      // Esc / M release mouse-look (the cursor is hidden under pointer lock,
      // so the toggle button can't be clicked — a key is the way out).
      if (
        (e.key === "Escape" || e.key === "m" || e.key === "M") &&
        mouseLookRef.current
      ) {
        e.preventDefault();
        document.exitPointerLock();
        return;
      }

      // Space (and J) = Jump (up); C = Crouch (down) — hold controls, like
      // WASD. (Pause/resume is the on-screen button now; Space-to-pause made
      // no sense in a WASD game.) Crouch is on C, NOT Ctrl: macOS reserves
      // Ctrl+arrows for Spaces / Mission Control and grabs them at the OS level
      // before the page sees the keydown, so a Ctrl-held crouch would silently
      // swallow arrow-look (rotation) — an unfixable collision from JS.
      if (e.code === "Space" || e.key === "j" || e.key === "J") {
        e.preventDefault();
        blurFocusedNonTyping();
        onJumpDown();
        return;
      }
      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        blurFocusedNonTyping();
        setVert(-1);
        return;
      }

      // Q / E = roll (3rd rotation DOF, around the view axis).
      if (e.key === "q" || e.key === "Q") {
        e.preventDefault();
        blurFocusedNonTyping();
        setRoll(-1);
        return;
      }
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        blurFocusedNonTyping();
        setRoll(1);
        return;
      }

      // O = mute / un-mute orbit: toggle R between 0 (rotate in place) and the last non-zero radius.
      if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        blurFocusedNonTyping();
        setOrbitRadius((r) =>
          r > 0 ? 0 : lastOrbitRadiusRef.current || ORBIT_RADIUS_DEFAULT,
        );
        return;
      }

      const slot = keyToHoldSlot(e.key);
      if (slot !== undefined) {
        e.preventDefault();
        holdPress(slot);
        return;
      }

      // Alphabetic hotkeys fire DIRECTOR events (checked AFTER all player controls
      // above, so WASD/roll/etc. always win — player actions are never blocked).
      const dir = keyToDirectorIndex(e.key);
      if (dir !== undefined) {
        e.preventDefault();
        fireDirectorEvent(dir);
        return;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const mvL = KEY_TO_MOVE_L[e.key];
      if (mvL) {
        moveLStackRef.current = moveLStackRef.current.filter((m) => m !== mvL);
        applyMovementStack();
        return;
      }
      const mvLat = KEY_TO_MOVE_LAT[e.key];
      if (mvLat) {
        moveLatStackRef.current = moveLatStackRef.current.filter(
          (m) => m !== mvLat,
        );
        applyMovementStack();
        return;
      }
      if (KEY_TO_LOOK_H[e.key]) {
        pushLookH("idle");
        return;
      }
      if (KEY_TO_LOOK_V[e.key]) {
        pushLookV("idle");
        return;
      }
      if (e.code === "Space" || e.key === "j" || e.key === "J") {
        onJumpUp();
        return;
      }
      if (e.key === "c" || e.key === "C") {
        if (vertDirRef.current < 0) setVert(0);
        return;
      }
      if (e.key === "q" || e.key === "Q" || e.key === "e" || e.key === "E") {
        setRoll(0);
        return;
      }
      const slot = keyToHoldSlot(e.key);
      if (slot !== undefined) {
        holdRelease(slot);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    applyMovementStack,
    pushLookH,
    pushLookV,
    holdPress,
    holdRelease,
    setVert,
    setRoll,
    onJumpDown,
    onJumpUp,
  ]);

  const onMoveLPress = (mv: Exclude<MoveL, "idle">) => {
    const stack = moveLStackRef.current;
    if (!stack.includes(mv)) stack.push(mv);
    applyMovementStack();
  };
  const onMoveLRelease = (mv: Exclude<MoveL, "idle">) => {
    moveLStackRef.current = moveLStackRef.current.filter((m) => m !== mv);
    applyMovementStack();
  };
  const onMoveLatPress = (mv: Exclude<MoveLat, "idle">) => {
    const stack = moveLatStackRef.current;
    if (!stack.includes(mv)) stack.push(mv);
    applyMovementStack();
  };
  const onMoveLatRelease = (mv: Exclude<MoveLat, "idle">) => {
    moveLatStackRef.current = moveLatStackRef.current.filter((m) => m !== mv);
    applyMovementStack();
  };

  // ---- Image selection + send ----

  useEffect(() => {
    return () => {
      if (pendingImage && pendingImage.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(pendingImage.previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingImage?.previewUrl]);

  const clearPendingImage = () => {
    if (pendingImage && pendingImage.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(pendingImage.previewUrl);
    }
    setPendingImage(null);
  };

  const selectFile = (file: File) => {
    clearPendingImage();
    const previewUrl = URL.createObjectURL(file);
    setPendingImage({ file, previewUrl, label: file.name });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const sendPendingImage = async () => {
    if (!pendingImage || !isReady || isUploading) return;
    setIsUploading(true);
    try {
      const ref = await uploadFile(pendingImage.file);
      await lw2.setImage({ image: ref });
      setSentImagePreview(pendingImage.previewUrl);
      setHasImage(true);
      setPendingImage((p) =>
        p && p.previewUrl === pendingImage.previewUrl ? null : p,
      );
    } catch (err) {
      console.error(err);
      setErrorToast(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  // ---- Apply a scene: uploads image, sends prompt, starts generation ----

  // Shared flow behind both the Quick Start examples and the custom scene:
  // clear held inputs, reset a running generation, upload the starting image,
  // send the composed prompt, and auto-start.
  const applyScene = useCallback(
    async (opts: {
      id: string;
      scene: StructuredScene;
      objective?: Objective;
      image:
        | { kind: "url"; src: string; name: string }
        | { kind: "file"; file: File; previewUrl: string }
        | { kind: "keep" }; // reuse the already-sent image
      errorLabel: string;
    }) => {
      // Blur whatever was just clicked so subsequent arrow-key presses don't
      // scroll the sidebar's overflow container. Without this, focus stays on
      // the clicked button and the browser treats arrow-key presses inside the
      // scrollable ancestor as scroll input alongside our window-level look
      // handler.
      if (typeof document !== "undefined") {
        (document.activeElement as HTMLElement | null)?.blur?.();
      }

      isApplyingExampleRef.current = true;
      try {
        // Clear any held control state so stale refs don't linger across the switch
        moveLStackRef.current = [];
        moveLatStackRef.current = [];
        pushMoveL("idle");
        pushMoveLat("idle");
        pushLookH("idle");
        pushLookV("idle");
        heldSlotsRef.current = [];
        setHeldSlots([]);
        sceneRef.current = null;

        // If currently generating or paused, reset first so the new scene starts clean
        if (isGenerating || isPaused) {
          lw2.reset().catch(console.error);
          setIsGenerating(false);
          setIsPaused(false);
          setHasPrompt(false);
          setHasImage(false);
          if (opts.image.kind !== "keep") {
            setSentImagePreview(null);
            setImageInfo(null);
          }
          lastSentPromptRef.current = "";
          // Give the backend time to process the reset before we send new data
          await new Promise((r) => setTimeout(r, 600));
        }

        setLoadingExampleId(opts.id);

        try {
          // Upload the starting image ("keep" assumes the previously-sent
          // image is still in place).
          if (opts.image.kind === "url") {
            const res = await fetch(opts.image.src);
            if (!res.ok)
              throw new Error(`Failed to load image (${res.status})`);
            const blob = await res.blob();
            const file = new File([blob], opts.image.name, {
              type: blob.type || "image/jpeg",
            });
            const ref = await uploadFile(file);
            await lw2.setImage({ image: ref });
            setSentImagePreview(opts.image.src);
            setHasImage(true);
          } else if (opts.image.kind === "file") {
            const ref = await uploadFile(opts.image.file);
            await lw2.setImage({ image: ref });
            setSentImagePreview(opts.image.previewUrl);
            setHasImage(true);
            // Don't revoke the previewUrl — it was just promoted to
            // sentImagePreview, so the URL is still in use.
            setPendingImage(null);
          }

          // Send the scene's composed prompt
          sceneRef.current = opts.scene;
          setScene(opts.scene);
          setActiveExampleId(opts.id);
          initHud(opts.scene.hud); // set starting vitals + show/hide from JSON
          pushSceneEvents(opts.scene); // hand director events to the Director panel
          pushObjective(opts.objective ?? null); // HUD summary + Director intent
          const p = composePrompt(opts.scene, false, []).trim();
          lastSentPromptRef.current = p;
          await lw2.setPrompt({ prompt: p });
          setHasPrompt(true);

          // Auto-start after a short delay to let the backend process
          await new Promise((r) => setTimeout(r, 1500));
          await lw2.start();
          setIsGenerating(true);
        } catch (err) {
          console.error(err);
          setErrorToast(err instanceof Error ? err.message : opts.errorLabel);
        } finally {
          setLoadingExampleId(null);
        }
      } finally {
        isApplyingExampleRef.current = false;
      }
    },
    [
      isGenerating,
      isPaused,
      uploadFile,
      sendCommand,
      pushMoveL,
      pushMoveLat,
      pushLookH,
      pushLookV,
      initHud,
      pushSceneEvents,
      pushObjective,
    ],
  );

  // Remembers a preset chosen while disconnected so it fully applies (upload
  // image + prompt + start) automatically once we connect.
  const pendingExampleRef = useRef<StructuredExample | null>(null);

  const applyExample = useCallback(
    async (ex: StructuredExample) => {
      if (isUploading) return;
      // Resolve the example's scene through the override store: if the user
      // has edited this example before, those edits are applied from the
      // start. Otherwise the pristine constant is used.
      const effective = effectiveSceneFor(ex.id);
      if (!effective) return;

      // Load a preset WITHOUT a connection: set the local scene + preview image
      // + editor + director events so it can be browsed and edited offline. The
      // coordinator calls (upload/setImage/setPrompt/start) are deferred and
      // fire automatically on connect (effect below).
      if (!isReady) {
        sceneRef.current = effective;
        setScene(effective);
        setActiveExampleId(ex.id);
        setSentImagePreview(ex.image.src);
        initHud(effective.hud);
        pushSceneEvents(effective);
        pushObjective(ex.objective ?? null);
        pendingExampleRef.current = ex;
        return;
      }

      await applyScene({
        id: ex.id,
        scene: effective,
        objective: ex.objective,
        image: { kind: "url", src: ex.image.src, name: `${ex.id}.jpg` },
        errorLabel: "Failed to apply example",
      });
    },
    [
      isReady,
      isUploading,
      effectiveSceneFor,
      applyScene,
      initHud,
      pushSceneEvents,
      pushObjective,
    ],
  );

  // When a preset was chosen while disconnected, apply it fully on connect.
  useEffect(() => {
    if (isReady && pendingExampleRef.current) {
      const ex = pendingExampleRef.current;
      pendingExampleRef.current = null;
      void applyExample(ex);
    }
  }, [isReady, applyExample]);

  // ---- Lifecycle ----

  const canStart =
    isReady && hasPrompt && hasImage && !isGenerating && !isPaused;
  const canPauseResume = isReady && (isGenerating || isPaused);
  const canReset = isReady;

  const startBlockerReason = useMemo(() => {
    if (canStart) return null;
    if (!isReady) return "Not connected.";
    if (isGenerating) return "Already generating — Reset to start over.";
    const missing: string[] = [];
    if (!hasPrompt) missing.push("send a prompt");
    if (!hasImage) missing.push("send a starting image");
    if (missing.length === 0) return null;
    return `Need to ${missing.join(" and ")}.`;
  }, [canStart, isReady, isGenerating, hasPrompt, hasImage]);

  const sendLifecycle = (cmd: "start" | "pause" | "resume" | "reset") => {
    lw2[cmd]().catch((err) => console.error(err));
    if (cmd === "start") setIsGenerating(true);
    if (cmd === "pause") setIsPaused(true);
    if (cmd === "resume") setIsPaused(false);
    if (cmd === "reset") {
      setIsGenerating(false);
      setIsPaused(false);
      setHasPrompt(false);
      setHasImage(false);
      clearMovementInputs(); // don't leave a held key's joystick mirror stuck
    }
  };

  const pushRotationSpeed = (v: number) => {
    setRotationSpeed(v);
    if (isReady)
      lw2.setRotationSpeedDeg({ rotation_speed_deg: v }).catch(console.error);
  };

  const pushSeed = (v: number) => {
    setSeed(v);
    if (isReady) lw2.setSeed({ seed: v }).catch(console.error);
  };

  // DiT attention-window selector (auto / small / large).
  const pushAttnWindow = (w: AttnWindow) => {
    if (attnWindow === w) return;
    setAttnWindow(w);
    if (isReady) lw2.setAttnWindow({ attn_window: w }).catch(console.error);
  };

  // KV-cache / RoPE reset mode selector (off / auto / manual).
  const pushKvCacheResetMode = (mode: KvResetMode) => {
    if (kvCacheResetMode === mode) return;
    setKvCacheResetMode(mode);
    if (isReady)
      sendCommand("set_kv_cache_reset", { mode }).catch(console.error);
  };

  // One-shot forced KV-cache reset. The backend honors this in "auto" and
  // "manual" modes but rejects it with command_error when the mode is "off",
  // so the button is disabled in the UI when the mode is "off".
  const triggerKvCacheReset = () => {
    if (isReady && kvCacheResetMode !== "off") {
      sendCommand("trigger_kv_cache_reset", {}).catch(console.error);
    }
  };

  // ---- Scene editor helpers ----

  // Scene shown in the editor modal. Reads from the override store if
  // present; for built-in examples falls back to the pristine constant,
  // for the custom slot falls back to a blank scene so the user has
  // something concrete to start editing.
  const editingScene = useMemo<StructuredScene | null>(() => {
    if (!editingExampleId) return null;
    const override = overrides[editingExampleId];
    if (override) return override;
    if (editingExampleId === CUSTOM_SCENE_ID) return emptyScene();
    return STRUCTURED_EXAMPLES[editingExampleId]?.scene ?? null;
  }, [editingExampleId, overrides]);

  // Editor onChange handler. Writes to overrides[editingExampleId] (so
  // edits persist and re-clicks load them). If the user is editing the
  // currently active example, also update sceneRef + scene so the
  // running generation sees the edit immediately.
  //
  // If the edited content is byte-equal to the pristine constant, drop
  // the override instead of storing it — there's no semantic
  // difference, and persisting it would leave a stale "edited" badge
  // on a card whose effective prompt matches the default. For the
  // custom slot there's no pristine to revert to; drop the override
  // only when the user has cleared every field back to emptyScene().
  const handleSceneChange = useCallback(
    (next: StructuredScene) => {
      if (!editingExampleId) return;
      const pristine =
        editingExampleId === CUSTOM_SCENE_ID
          ? emptyScene()
          : STRUCTURED_EXAMPLES[editingExampleId]?.scene;
      const isDefault = pristine ? scenesEqual(next, pristine) : false;
      setOverrides((o) => {
        if (isDefault) {
          if (!(editingExampleId in o)) return o;
          const without = { ...o };
          delete without[editingExampleId];
          return without;
        }
        return { ...o, [editingExampleId]: next };
      });
      if (editingExampleId === activeExampleId) {
        sceneRef.current = next;
        setScene(next);
        if (heldSlotsRef.current.length > 0) {
          const valid = heldSlotsRef.current.filter(
            (s) => s < next.events.length,
          );
          if (valid.length !== heldSlotsRef.current.length) {
            heldSlotsRef.current = valid;
            setHeldSlots(valid);
          }
        }
        recomputePromptAndSend();
      }
    },
    [editingExampleId, activeExampleId, recomputePromptAndSend],
  );

  // "Reset to example" inside the editor — drop the override so the
  // example reverts to its pristine constant.
  const resetEditingExample = useCallback(() => {
    if (!editingExampleId) return;
    setOverrides((o) => {
      if (!(editingExampleId in o)) return o;
      const next = { ...o };
      delete next[editingExampleId];
      return next;
    });
    if (editingExampleId === activeExampleId) {
      const pristine = STRUCTURED_EXAMPLES[editingExampleId]?.scene;
      if (pristine) {
        const cloned = cloneScene(pristine);
        sceneRef.current = cloned;
        setScene(cloned);
        recomputePromptAndSend();
      }
    }
  }, [editingExampleId, activeExampleId, recomputePromptAndSend]);

  const openEditorFor = (id: string) => {
    setEditingExampleId(id);
  };

  const closeEditor = () => setEditingExampleId(null);

  // Drop a specific override (from the card-level reset button, or
  // from the Custom section's ↺). If that scene is currently running,
  // also rewind the active scene — to the pristine constant for built-
  // in examples, or unset entirely for the custom slot.
  const clearOverrideFor = useCallback(
    (id: string) => {
      if (!(id in overridesRef.current)) return;
      if (typeof window !== "undefined") {
        const label =
          id === CUSTOM_SCENE_ID
            ? "your custom scene"
            : `"${STRUCTURED_EXAMPLES[id]?.name ?? id}"`;
        const verb =
          id === CUSTOM_SCENE_ID ? "clear it" : "revert to the default prompt";
        const ok = window.confirm(
          `Discard your edits to ${label} and ${verb}?`,
        );
        if (!ok) return;
      }
      setOverrides((o) => {
        if (!(id in o)) return o;
        const next = { ...o };
        delete next[id];
        return next;
      });
      if (id === activeExampleId) {
        const pristine = STRUCTURED_EXAMPLES[id]?.scene;
        if (pristine) {
          const cloned = cloneScene(pristine);
          sceneRef.current = cloned;
          setScene(cloned);
          recomputePromptAndSend();
        } else {
          // Custom scene was running and is now gone; drop the active
          // scene state so the controller falls back to idle.
          sceneRef.current = null;
          setScene(null);
          setActiveExampleId(null);
        }
      }
    },
    [activeExampleId, recomputePromptAndSend],
  );

  // Apply the user's custom layered scene. Mirrors applyExample but
  // uses the user-picked pending image (or the already-sent custom
  // image) and the overrides[__custom__] scene.
  const applyCustomScene = useCallback(async () => {
    if (!isReady || isUploading) return;
    const customScene = overridesRef.current[CUSTOM_SCENE_ID];
    if (!customScene) {
      setErrorToast("Edit the custom prompt before applying.");
      return;
    }
    const composed = composePrompt(customScene, false, []).trim();
    if (!composed) {
      setErrorToast("Custom prompt is empty — add at least a base prose.");
      return;
    }
    if (!pendingImage && !sentImagePreview) {
      setErrorToast("Pick a starting image before applying.");
      return;
    }
    await applyScene({
      id: CUSTOM_SCENE_ID,
      scene: cloneScene(customScene),
      image: pendingImage
        ? {
            kind: "file",
            file: pendingImage.file,
            previewUrl: pendingImage.previewUrl,
          }
        : { kind: "keep" },
      errorLabel: "Failed to apply custom scene",
    });
  }, [isReady, isUploading, pendingImage, sentImagePreview, applyScene]);

  // ---- Render: sidebar (Quick Start + Custom) ----

  // An example counts as "edited" only when its stored override actually differs
  // from the pristine constant (a reverted override is just storage noise).
  const hasOverride = useCallback(
    (id: string) => {
      const o = overrides[id];
      const p = STRUCTURED_EXAMPLES[id]?.scene;
      return Boolean(o && p && !scenesEqual(o, p));
    },
    [overrides],
  );

  // When the inspector is open we swap the sidebar contents to the
  // inspector panel. That way the video on the right stays fully
  // visible — the user can see the prompt and the running video side
  // by side instead of having a modal cover everything.
  const sidebarContent =
    inspectorOpen && scene ? (
      <LivePromptInspector
        scene={scene}
        isMoving={moveL !== "idle" || moveLat !== "idle"}
        heldSlots={heldSlots}
        verticalPrompt={verticalPrompt}
        onClose={() => setInspectorOpen(false)}
      />
    ) : null;

  const sidebar = sidebarContent ?? (
    <ControllerSidebar
      activeExampleId={activeExampleId}
      loadingExampleId={loadingExampleId}
      isUploading={isUploading}
      hasOverride={hasOverride}
      applyExample={applyExample}
      clearOverrideFor={clearOverrideFor}
      openEditorFor={openEditorFor}
      overrides={overrides}
      isReady={isReady}
      pendingImage={pendingImage}
      sentImagePreview={sentImagePreview}
      imageInfo={imageInfo}
      fileInputRef={fileInputRef}
      selectFile={selectFile}
      clearPendingImage={clearPendingImage}
      applyCustomScene={applyCustomScene}
      hasPrompt={hasPrompt}
      hasImage={hasImage}
      canStart={canStart}
      startBlockerReason={startBlockerReason}
      sendLifecycle={sendLifecycle}
      errorToast={errorToast}
      advancedOpen={advancedOpen}
      setAdvancedOpen={setAdvancedOpen}
      inspectorOpen={inspectorOpen}
      setInspectorOpen={setInspectorOpen}
      rotationSpeed={rotationSpeed}
      pushRotationSpeed={pushRotationSpeed}
      mouseSens={mouseSens}
      setMouseSens={setMouseSens}
      seed={seed}
      pushSeed={pushSeed}
      cameraPoseActive={cameraPoseActive}
      attnWindow={attnWindow}
      pushAttnWindow={pushAttnWindow}
      kvCacheResetMode={kvCacheResetMode}
      pushKvCacheResetMode={pushKvCacheResetMode}
      triggerKvCacheReset={triggerKvCacheReset}
      editingExampleId={editingExampleId}
      editingScene={editingScene}
      handleSceneChange={handleSceneChange}
      resetEditingExample={resetEditingExample}
      closeEditor={closeEditor}
      customSceneId={CUSTOM_SCENE_ID}
      mouseSensMin={MOUSE_SENS_MIN}
      mouseSensMax={MOUSE_SENS_MAX}
    />
  );


  // ---- Render: bottom controls (hold chips, movement, look) ----

  // DEV: keep the HUD synced to the active scene's `hud` while idle, so it shows
  // (with the scene's health/inventory) even before connecting and after a reload
  // restore — not just on a fresh preset click, which is the only thing that
  // currently calls initHud. Skipped while generating so live health from events
  // isn't overwritten. Remove this effect (and restore `visible={isReady && hudShow}`)
  // to go back to connect-gated HUD.
  useEffect(() => {
    if (!isGenerating) initHud(scene?.hud);
  }, [scene, isGenerating, initHud]);

  // Player HUD slot — returned separately so the app can mount it INSIDE the
  // video's relative container (overlay on the viewport), not the controls panel.
  // Visibility is hard-on in PlayerHud (see PlayerHud.tsx for the rationale / how
  // to gate it on isReady && hudShow again).
  const hud = (
    <PlayerHud
      health={hudHealth}
      maxHealth={hudMaxHealth}
      inventory={hudInventory}
      objective={hudObjective}
      healthLabel={hudHealthLabel}
      result={gameResult}
    />
  );

  const controls = (
    <ControllerControls
      hudObjective={hudObjective}
      tspSize={tspSize}
      isGenerating={isGenerating}
      chunkNum={chunkNum}
      chunkIndex={chunkIndex}
      isReady={isReady}
      activeAction={activeAction}
      isPaused={isPaused}
      canPauseResume={canPauseResume}
      sendLifecycle={sendLifecycle}
      eventChips={{
        scene,
        heldSlots,
        onPress: holdPress,
        onRelease: holdRelease,
        isAvailable: isAvailableNow,
      }}
      movePad={{
        rollDir,
        moveL,
        moveLat,
        jumpLit,
        vertDir,
        setRoll,
        onMoveLPress,
        onMoveLRelease,
        onMoveLatPress,
        onMoveLatRelease,
        onJumpDown,
        onJumpUp,
        setVert,
      }}
      editingLevel={editingLevel}
      chargePatterns={chargePatterns}
      cycleChargeCell={cycleChargeCell}
      resetChargeLevel={resetChargeLevel}
      setEditingLevel={setEditingLevel}
      editingCrouch={editingCrouch}
      crouchPatterns={crouchPatterns}
      cycleCrouchCell={cycleCrouchCell}
      resetCrouchPatterns={resetCrouchPatterns}
      setEditingCrouch={setEditingCrouch}
      joyAreaRef={joyAreaRef}
      onJoyPointer={onJoyPointer}
      joy={joy}
      lookH={lookH}
      lookV={lookV}
      pushLookH={pushLookH}
      pushLookV={pushLookV}
      mouseLook={mouseLook}
      toggleMouseLook={toggleMouseLook}
      mouseViz={mouseViz}
      jumpMode={jumpMode}
      changeJumpMode={changeJumpMode}
      chargeLevel={chargeLevel}
      crouchMode={crouchMode}
      changeCrouchMode={changeCrouchMode}
      orbitRadius={orbitRadius}
      setOrbitRadius={setOrbitRadius}
      orbitRadiusStep={ORBIT_RADIUS_STEP}
    />
  );

  return { sidebar, controls, hud };
}
