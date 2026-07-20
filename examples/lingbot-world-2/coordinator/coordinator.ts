// Coordinator — the shared-History server for separate-browser Player/Director.
//
// A small WebSocket server that owns the ONE authoritative History and syncs it
// between browsers that don't share JS memory. It touches no video: ops in,
// projected clauses out. Video stays on the Reactor/local DataChannel.
//
// Reuses lib/history.ts as-is (the whole reason we didn't port to Python).
// Run with:  npx tsx coordinator.ts    (from this folder; needs `ws` installed)
//
// Protocol
//   client -> server : { op: "assert", fact }        add/refresh a fact
//                      { op: "retract", key }         drop a fact
//                      { op: "clear" }                drop all (scene switch/reset)
//                      { op: "tick" }                 age one chunk (Player forwards
//                                                     chunk_complete so aging tracks
//                                                     the real generation rate)
//   server -> client : { type: "facts", prompt }      current History.project()
//
// The Player subscribes to `facts` and appends `prompt` to its local
// composePrompt() before set_prompt. The Director just sends ops.

import { appendFileSync } from "node:fs";
import { WebSocketServer, WebSocket } from "ws";
import { Engine } from "json-rules-engine";
import { buildEngine } from "./rules";
import { History, type Fact } from "../lib/history";

const PORT = Number(process.env.COORDINATOR_PORT ?? 8090);

// Every command from every client (player + human/ai directors) is appended
// here as one JSON line: {ts, role, op, ...}. Override path with COMMAND_LOG.
const LOG_PATH = process.env.COMMAND_LOG ?? "commands.jsonl";
function logCommand(entry: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
  try {
    appendFileSync(LOG_PATH, line);
  } catch {
    /* logging must never break the coordinator */
  }
}

// The single source of truth. No identity prefix — the Player's scene `base`
// already supplies world identity; History carries only the persistent extras.
// debug on by default here (COORDINATOR_DEBUG=0 to silence) — the coordinator
// is the natural single place to watch every state change.
const history = new History({ debug: process.env.COORDINATOR_DEBUG !== "0" });

const wss = new WebSocketServer({ port: PORT });

// Shared player vitals — changed by either role (Player event or Director op),
// authoritative here so every client agrees.
const MAX_HEALTH = 100;
const vitals = { health: MAX_HEALTH, maxHealth: MAX_HEALTH, inventory: [] as string[] };

// Shared entity/spawn count — the first slice of the coordinator state. Director
// events that spawn (enemies appear) carry a `count` delta and bump this;
// death events carry a negative delta. Clamped at 0, reset on scene switch.
let entityCount = 0;

// Objective win tracking: survive `objective.durationChunks` alive → fire
// `objective.reward`. `chunks` counts tick ops; `won` fires the reward once.
let chunks = 0;
let won = false;

// Live activity feed: each accepted state-changing director/player op is
// broadcast so the UI can show WHO did WHAT (e.g. the AI director's fires),
// not just the resulting projected prompt. `seq` gives each entry a stable id.
let activitySeq = 0;
function broadcastActivity(m: Op): void {
  sendAll(
    JSON.stringify({
      type: "activity",
      id: ++activitySeq,
      role: m.role ?? "?",
      op: m.op,
      key: m.fact?.key ?? m.key,
      clause: m.fact?.clause,
      change: m.change,
      name: m.name, // action that caused a vital (player/AI), for a readable feed row
      slug: m.slug, // for op:"game" — which game was switched to
      cmd: m.cmd, // for op:"log" — "look" (heartbeat) | "error" | "action"
      detail: m.detail, // for op:"log" — the error text / payload to show
    }),
  );
}

function checkWin(): void {
  const obj = objective as { durationChunks?: number; reward?: string } | null;
  if (won || !obj?.reward || !obj.durationChunks) return;
  if (chunks < obj.durationChunks || vitals.health <= 0) return;
  const ev = sceneEvents.find((e) => e.name === obj.reward);
  if (!ev) return;
  won = true;
  const key = "scene:" + ev.name.toLowerCase().replace(/\s+/g, "_");
  history.assert({ key, clause: ev.clause, weight: 2, life: { kind: "sustained" } });
  console.log(`[coordinator] WIN — fired reward "${ev.name}" (survived ${chunks} chunks)`);
  sendAll(JSON.stringify({ type: "won", reward: ev.name })); // client shows the win banner
  broadcast();
}

function sendAll(msg: string): void {
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

function broadcast(): void {
  sendAll(JSON.stringify({ type: "facts", prompt: history.project() }));
  broadcastState();
}

// scene events WITHOUT the (long) prose `clause`. The `state` message is broadcast on
// every tick/vital change, so repeating every event's full prompt text there is pure
// waste — clients that need the clause get it from the one-time `scene_events` message,
// and the coordinator keeps the full sceneEvents server-side for the rules assert path.
function leanSceneEvents(): Omit<SceneEvent, "clause">[] {
  return sceneEvents.map((e) => ({
    name: e.name,
    requires: e.requires,
    available: e.available,
    health: e.health,
    addItem: e.addItem,
    count: e.count,
  }));
}

// Full structured coordinator state, for the optional state visualization.
function broadcastState(): void {
  sendAll(
    JSON.stringify({
      type: "state",
      mode: directorMode,
      vitals,
      count: entityCount,
      objective,
      facts: history.snapshot(),
      sceneEvents: leanSceneEvents(),
    }),
  );
}

function broadcastCount(): void {
  sendAll(JSON.stringify({ type: "count", count: entityCount }));
  broadcastState();
}

function broadcastVitals(): void {
  sendAll(JSON.stringify({ type: "vitals", ...vitals }));
  broadcastState();
}

// Which director's ops are accepted: "both" | "human" | "ai". Player ops
// (role "player" / untagged gameplay) always apply — this only gates directors.
let directorMode: "both" | "human" | "ai" = "human";

function opAllowed(role: string | undefined): boolean {
  if (role !== "human" && role !== "ai") return true; // player / system: always
  return directorMode === "both" || directorMode === role;
}

const clamp = (n: number) => Math.max(0, Math.min(MAX_HEALTH, n));

function applyVital(change: VitalChange): void {
  if (change.reset) {
    vitals.health = MAX_HEALTH;
    vitals.inventory = [];
    return;
  }
  if (change.setHealth !== undefined) vitals.health = clamp(change.setHealth);
  if (change.health !== undefined) vitals.health = clamp(vitals.health + change.health);
  if (change.addItem && !vitals.inventory.includes(change.addItem))
    vitals.inventory.push(change.addItem);
  if (change.removeItem)
    vitals.inventory = vitals.inventory.filter((x) => x !== change.removeItem);
}

interface VitalChange {
  health?: number;
  setHealth?: number;
  addItem?: string;
  removeItem?: string;
  reset?: boolean;
}

// A director-owned scene event (scene change / death), forwarded by the Player
// from the active scene so the Director panel/AI can fire it.
interface SceneEvent {
  name: string;
  clause: string;
  health?: number;
  addItem?: string;
  count?: number;
  available?: boolean; // player-computed gate flag (forwarded to the AI director)
  requires?: unknown; // raw declarative gate, evaluated by the AI director itself
  win?: boolean; // a terminal WIN event: asserting it flips `won` + fires the win banner
  chance?: number; // per-tick fire probability once the gate holds (rules engine timing jitter)
}
let sceneEvents: SceneEvent[] = [];

/** If the just-fired scene event (`scene:<slug>` key) is a `win` terminal, flip `won`
 *  and fire the win banner — the win-event equivalent of checkWin's survive path. */
function markWinIfTerminal(key: string): void {
  if (won) return;
  const name = firedNameFromKey(key);
  if (!name) return;
  const se = sceneEvents.find((s) => s.name.toLowerCase() === name);
  if (se?.win) {
    won = true;
    console.log(`[coordinator] WIN — ${se.name} (win event)`);
    sendAll(JSON.stringify({ type: "won", reward: se.name }));
    broadcast();
  }
}
let objective: unknown = null; // the active scene's objective (summary + director)
let activeGame = ""; // active scene slug (UI selection) — the AI director follows this
let gameOwner: WebSocket | null = null; // the Player socket that loaded the active game
const directorSockets = new Set<WebSocket>(); // sockets that registered as the AI director

// ── json-rules-engine compatibility ─────────────────────────────────────────
// The coordinator state is exposed AS-IS as engine facts (see `gameFacts()`), so a
// `json-rules-engine` rule set can drive the director with NO adapter and NO second
// copy of truth. Most state (health, chunks, inventory, entityCount, objective) is
// already a plain value a rule reads directly. Two fields exist to keep that shape
// first-class and always-current:
//   • firedEvents  — fired scene events by DISPLAY NAME, DERIVED from the ONE History's
//     `scene:<slug>` facts each call (NO cached copy, no sync to keep); rules use
//     `{ fact: "firedEvents", operator: "contains", … }`.
//   • observations — the probe's latest yes/no reads, posted by the AI director via
//     op:"observe" (the only fact the coordinator doesn't otherwise hold).
// Field names below == the `fact` names rules reference, so authored `requires` gates
// (fired/notFired/minChunks/maxHealth/minHealth/hasItem) map 1:1 to rule conditions.
let observations: Record<string, boolean> = {}; // rules fact: latest probe reads

/** Fired display name for a History key (`scene:gunman_falls` -> "gunman falls"), or null. */
function firedNameFromKey(key: string): string | null {
  return key.startsWith("scene:") ? key.slice("scene:".length).replace(/_/g, " ") : null;
}

/** Fired scene-event display names, DERIVED from the one History (no cached copy). */
function firedEventNames(): string[] {
  return history
    .snapshot()
    .map((f) => firedNameFromKey(f.key))
    .filter((n): n is string => n !== null);
}

/** The live coordinator state as a flat `json-rules-engine` facts object. Reads the
 *  current state each call (no copy); field names match the rules' `fact` names. */
function gameFacts(): Record<string, unknown> {
  return {
    firedEvents: firedEventNames(),
    health: vitals.health,
    maxHealth: vitals.maxHealth,
    inventory: vitals.inventory,
    entityCount,
    chunks,
    objective,
    observations,
    random: Math.random(), // fresh each run → lets a rule fire with probability (see `chance`)
  };
}

// ── Optional rules-engine director (json-rules-engine) ───────────────────────
// The coordinator itself acts as the AI director, firing events from deterministic
// rules over gameFacts() instead of the VLM. Rules are DERIVED from each scene
// event's authored `requires` gate (fired / notFired / minChunks / maxHealth /
// minHealth / hasItem) + a "don't re-fire" guard, so NO scene-JSON change is needed.
// Paced by COORDINATOR_RULE_COOLDOWN. ON by default (COORDINATOR_RULES=0 to disable);
// still only fires when director mode is ai/both — dormant in the default human mode.
const RULES_ENABLED = process.env.COORDINATOR_RULES !== "0";
const RULE_COOLDOWN = Number(process.env.COORDINATOR_RULE_COOLDOWN ?? 6); // min chunks between fires
const RULE_WARMUP = 4; // ungated events wait this many chunks so the scene settles first
let rulesEngine: Engine | null = null;
let lastRuleFireChunk = -1e9;
// True while an AI director that does its OWN (VLM) deciding is connected. The rules
// engine then stays dormant so the two never double-fire; a director run with
// --rules-decide announces decides:false in its hello, which keeps rules active.
let vlmDeciderPresent = false;

/** (Re)build the engine for the active scene's events, or clear it. Rule construction
 *  lives in `./rules` (pure + unit-tested); this just owns the enabled/empty gating. */
function rebuildRulesEngine(): void {
  lastRuleFireChunk = -1e9;
  if (!RULES_ENABLED || sceneEvents.length === 0) {
    rulesEngine = null;
    return;
  }
  rulesEngine = buildEngine(sceneEvents, RULE_WARMUP);
  console.log(`[rules] engine built: ${sceneEvents.length} rule(s)`);
}

/** Evaluate the rules against the live state and assert ONE fired event (paced). Among the
 *  fired events it takes the highest-priority tier, then picks at RANDOM within that tier —
 *  so a mutex / flavor pool (all equal priority) gives every option an equal chance, while
 *  a higher-priority story beat still preempts. */
async function runRules(): Promise<void> {
  if (!rulesEngine || directorMode === "human") return; // rules ARE the AI director here
  if (vlmDeciderPresent) return; // a VLM director is deciding — don't double-fire
  if (chunks - lastRuleFireChunk < RULE_COOLDOWN) return; // pace fires
  let events: { params?: Record<string, unknown> }[];
  try {
    ({ events } = await rulesEngine.run(gameFacts()));
  } catch (err) {
    console.log(`[rules] run error: ${(err as Error).message}`);
    return;
  }
  // Resolve to (sceneEvent, priority); drop any event without a matching scene event.
  const eligible = events
    .map((ev) => {
      const name = ev.params?.name as string | undefined;
      const se = name ? sceneEvents.find((s) => s.name === name) : undefined;
      return se ? { name, se, p: Number(ev.params?.priority ?? 1) } : null;
    })
    .filter((x): x is { name: string; se: SceneEvent; p: number } => x !== null);
  if (eligible.length === 0) return;

  const maxP = Math.max(...eligible.map((x) => x.p));
  const tier = eligible.filter((x) => x.p === maxP);
  const { name, se } = tier[Math.floor(Math.random() * tier.length)]; // equal chance within the tier

  const key = "scene:" + name.toLowerCase().replace(/\s+/g, "_");
  history.assert({ key, clause: se.clause, weight: 2, life: { kind: "sustained" } });
  lastRuleFireChunk = chunks; // firedEvents derives from History, so the assert above is enough
  if (se.health != null || se.addItem) applyVital({ health: se.health ?? undefined, addItem: se.addItem });
  console.log(`[rules] fire ${name} (chunk ${chunks}; ${tier.length} tied @p${maxP})`);
  broadcast();
  broadcastActivity({ op: "assert", role: "ai", fact: { key, clause: se.clause } } as Op);
  markWinIfTerminal(key); // a win-flagged event ends the game
}

interface Op {
  op: "assert" | "retract" | "clear" | "tick" | "vital" | "mode" | "log" | "scene_events" | "objective" | "count" | "game" | "hello" | "observe";
  fact?: Fact;
  key?: string;
  change?: VitalChange;
  role?: "player" | "human" | "ai"; // who sent it (for mode gating)
  mode?: "both" | "human" | "ai"; // for op:"mode"
  cmd?: string; // for op:"log" — a player-side command (event/prompt/…)
  detail?: unknown; // for op:"log" — command payload
  events?: SceneEvent[]; // for op:"scene_events"
  objective?: unknown; // for op:"objective"
  delta?: number; // for op:"count" — signed spawn/kill delta
  set?: number; // for op:"count" — absolute set (overrides delta)
  slug?: string; // for op:"game" — active scene slug
  name?: string; // for op:"vital" — the action that caused it (shown in the activity feed)
  model?: string; // for op:"hello" — the AI director's VLM model id
  modelOk?: boolean; // for op:"hello" — whether the model server was reachable at startup
  decides?: boolean; // for op:"hello" — does this director run its OWN VLM decide? (false = rules-decide)
  obs?: Record<string, boolean>; // for op:"observe" — the probe's latest yes/no reads (rules fact)
}

function broadcastSceneEvents(): void {
  sendAll(JSON.stringify({ type: "scene_events", events: sceneEvents }));
  broadcastState();
}

function broadcastObjective(): void {
  sendAll(JSON.stringify({ type: "objective", objective }));
  broadcastState();
}

function broadcastMode(): void {
  sendAll(JSON.stringify({ type: "mode", mode: directorMode }));
  broadcastState();
}

function broadcastGame(): void {
  sendAll(JSON.stringify({ type: "game", slug: activeGame }));
}

// Unload the active game -> blank/no-game state. Clears every scene-scoped store so
// the next game (or an idle coordinator) starts clean. Called on the "game" op with an
// empty slug and when the Player that owned the game disconnects.
function unloadGame(reason: string): void {
  if (!activeGame && sceneEvents.length === 0 && objective == null) return; // already blank
  activeGame = "";
  gameOwner = null;
  sceneEvents = [];
  objective = null;
  history.clear(); // firedEvents fact is derived from History, so it clears with it
  observations = {};
  rulesEngine = null; // no game -> no rules
  lastRuleFireChunk = -1e9;
  entityCount = 0;
  chunks = 0;
  won = false;
  vitals.health = vitals.maxHealth;
  vitals.inventory = [];
  console.log(`[coordinator] game unloaded (${reason})`);
  broadcastGame();
  broadcastSceneEvents();
  broadcastObjective();
  broadcastVitals();
  broadcastCount();
  broadcast();
}

wss.on("connection", (ws) => {
  console.log(`[coordinator] client connected  (${wss.clients.size} total)`);
  ws.on("close", () => {
    const wasDirector = directorSockets.delete(ws);
    if (wasDirector) vlmDeciderPresent = false; // director gone → rules resume deciding
    console.log(
      `[coordinator] ${wasDirector ? "AI DIRECTOR" : "client"} disconnected  (${wss.clients.size} total)`,
    );
    if (wasDirector) {
      sendAll(JSON.stringify({ type: "activity", id: ++activitySeq, role: "ai", op: "bye" }));
    }
    // The Player (game owner) leaving unloads the game -> blank state, so a stale scene
    // doesn't keep driving the AI director with no one rendering it.
    if (ws === gameOwner) {
      unloadGame("player disconnected");
    }
  });
  // Hand the newcomer the current state so a late-joining Director (or a
  // Player that reloaded) sees the live world immediately.
  ws.send(JSON.stringify({ type: "facts", prompt: history.project() }));
  ws.send(JSON.stringify({ type: "vitals", ...vitals }));
  ws.send(JSON.stringify({ type: "mode", mode: directorMode }));
  ws.send(JSON.stringify({ type: "scene_events", events: sceneEvents }));
  ws.send(JSON.stringify({ type: "objective", objective }));
  if (activeGame) ws.send(JSON.stringify({ type: "game", slug: activeGame }));
  // Tell a late-joining panel that an AI director is already connected, so its
  // activity feed shows "ai · director connected" even if it opened after register.
  if (directorSockets.size > 0) {
    ws.send(JSON.stringify({ type: "activity", id: ++activitySeq, role: "ai", op: "hello" }));
  }
  ws.send(
    JSON.stringify({
      type: "state",
      mode: directorMode,
      vitals,
      objective,
      facts: history.snapshot(),
      sceneEvents,
    }),
  );

  ws.on("message", (data) => {
    let m: Op;
    try {
      m = JSON.parse(String(data)) as Op;
    } catch {
      return; // ignore malformed frames
    }
    // Director-mode gate: drop the switched-off director's ops.
    if (
      (m.op === "assert" || m.op === "retract" || m.op === "vital" || m.op === "count") &&
      !opAllowed(m.role)
    ) {
      logCommand({ role: m.role, op: m.op, gated: true }); // record the drop too
      if (m.role === "ai" || m.role === "human")
        console.log(
          `[coordinator] DROP ${m.role} ${m.op} ${m.fact?.key ?? m.key ?? ""} ` +
            `(mode=${directorMode} blocks ${m.role})`,
        );
      return;
    }
    // Console-log every director (ai/human) op so you can see WHEN the AI is
    // calling in and what it fires — the player's own ops stay file-only (noisy).
    if (m.role === "ai" || m.role === "human") {
      const detail =
        (m.fact?.key ? ` ${m.fact.key}` : m.key ? ` ${m.key}` : "") +
        (m.name ? ` [${m.name}]` : "") +
        (m.change ? ` ${JSON.stringify(m.change)}` : "") +
        (m.fact?.clause ? `  "${m.fact.clause.slice(0, 60)}"` : "");
      console.log(`[coordinator] ${m.role} ${m.op}${detail}`);
    }
    // Log every accepted command (player + directors) to the file.
    logCommand({
      role: m.role ?? "?",
      op: m.op,
      key: m.fact?.key ?? m.key,
      clause: m.fact?.clause,
      change: m.change,
      mode: m.mode,
      cmd: m.cmd,
      detail: m.detail,
    });
    // Feed the UI activity log with meaningful actions (skip noisy setup/ticks
    // and no-op vitals like health:0 that carry no real change).
    const c = m.change ?? {};
    const meaningfulVital =
      c.setHealth !== undefined ||
      (typeof c.health === "number" && c.health !== 0) ||
      !!c.addItem || !!c.removeItem || !!c.reset;
    const isLogActivity =
      m.op === "log" && (m.cmd === "action" || m.cmd === "look" || m.cmd === "error");
    const isActivity =
      m.op === "assert" || m.op === "retract" || m.op === "count" ||
      m.op === "clear" || (m.op === "vital" && meaningfulVital) || isLogActivity;
    // In human director mode the AI is paused — drop its idle heartbeats / status /
    // errors so the feed isn't spammed by a still-connected but idle director (robust
    // even against an old director build). Player logs are unaffected.
    const mutedAiLog = isLogActivity && m.role === "ai" && directorMode === "human";
    if (isActivity && !mutedAiLog) broadcastActivity(m);
    switch (m.op) {
      case "hello":
        if (m.role === "ai") {
          directorSockets.add(ws);
          // decides !== false → the director runs its own VLM decide, so rules stay dormant.
          // --rules-decide directors send decides:false; older directors omit it (treated as
          // deciding, for backward compat — rules won't fight a legacy VLM director).
          vlmDeciderPresent = m.decides !== false;
          const modelInfo = m.model
            ? `  model=${m.model} [${m.modelOk === false ? "UNREACHABLE" : "reachable"}]`
            : "";
          console.log(
            `[coordinator] AI DIRECTOR registered${modelInfo} decides=${vlmDeciderPresent}  ` +
              `(${directorSockets.size} director(s); rules ${vlmDeciderPresent ? "dormant" : "active"})`,
          );
          sendAll(JSON.stringify({ type: "activity", id: ++activitySeq, role: "ai", op: "hello" }));
        }
        break;
      case "log":
        break; // record-only; nothing to apply
      case "scene_events":
        sceneEvents = m.events ?? [];
        rebuildRulesEngine(); // rebuild derived rules for the new event set (opt-in)
        broadcastSceneEvents();
        break;
      case "game": {
        // An empty slug UNLOADS the game (back to no game); a new slug switches.
        const newGame = m.slug ?? "";
        if (newGame !== activeGame) {
          if (newGame === "") {
            unloadGame("game op (empty slug)");
          } else {
            activeGame = newGame;
            gameOwner = ws; // the client that loaded the game owns it (the Player)
            console.log(`[coordinator] active game -> ${activeGame}`);
            broadcastActivity({ ...m, slug: newGame }); // show it in the activity feed
            broadcastGame(); // the AI director reloads accordingly
          }
        }
        break;
      }
      case "objective": {
        // A changed objective = a game switch. Wipe stale world state so the new
        // game starts clean (old director facts / inventory / spawn count gone).
        const prevSummary = (objective as { summary?: string } | null)?.summary ?? "";
        const nextSummary = (m.objective as { summary?: string } | null)?.summary ?? "";
        objective = m.objective ?? null;
        chunks = 0;
        won = false; // new objective — restart the win clock
        if (prevSummary !== nextSummary) {
          history.clear();
          entityCount = 0;
          vitals.health = vitals.maxHealth;
          vitals.inventory = [];
          console.log(`[coordinator] GAME CHANGE -> reset state (objective: ${nextSummary || "none"})`);
          broadcastVitals();
          broadcastCount();
          broadcast();
        }
        broadcastObjective();
        break;
      }

      case "mode":
        if (m.mode) {
          directorMode = m.mode;
          console.log(`[coordinator] director mode -> ${directorMode}`);
          broadcastMode();
        }
        break;
      case "assert":
        if (m.fact) {
          history.assert(m.fact); // firedEvents fact is derived from History (gameFacts)
          broadcast();
          markWinIfTerminal(m.fact.key); // a win-flagged event ends the game
        }
        break;
      case "retract":
        if (m.key) {
          history.retract(m.key);
          broadcast();
        }
        break;
      case "clear":
        history.clear(); // firedEvents fact clears with it (derived from History)
        observations = {};
        entityCount = 0; // scene switch / reset wipes the spawn count too
        chunks = 0;
        won = false; // reset the objective win on scene switch / reset
        lastRuleFireChunk = -1e9; // let rules fire from scratch after a reset
        broadcast();
        break;
      case "observe":
        // The AI director posts the probe's latest yes/no reads so json-rules-engine
        // rules (and any observation-gated logic) can see what's on screen. Facts-only:
        // no History mutation, not mode-gated (perception, not a director action).
        // MERGE, don't replace: a probe that answered "unknown" omits that id, so we
        // keep its previous value rather than update state on something it couldn't see.
        observations = { ...observations, ...(m.obs ?? {}) };
        break;
      case "count":
        // Director spawn/kill bumps the shared count. `set` is absolute; else
        // `delta` is signed. Clamped at 0.
        entityCount =
          m.set !== undefined
            ? Math.max(0, m.set)
            : Math.max(0, entityCount + (m.delta ?? 0));
        broadcastCount();
        break;
      case "tick":
        chunks += 1;
        checkWin(); // survive durationChunks alive → fire the objective reward
        void runRules(); // opt-in rules-engine director evaluates on each chunk (no-op if off)
        // Only re-broadcast when something actually expired this chunk.
        if (history.advance()) broadcast();
        break;
      case "vital":
        if (m.change) {
          applyVital(m.change);
          broadcastVitals();
        }
        break;
    }
  });
});

console.log(`[coordinator] History WebSocket listening on ws://localhost:${PORT}`);
