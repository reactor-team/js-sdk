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
      sceneEvents,
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
let directorMode: "both" | "human" | "ai" = "both";

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
}
let sceneEvents: SceneEvent[] = [];
let objective: unknown = null; // the active scene's objective (summary + director)
let activeGame = ""; // active scene slug (UI selection) — the AI director follows this
let gameOwner: WebSocket | null = null; // the Player socket that loaded the active game
const directorSockets = new Set<WebSocket>(); // sockets that registered as the AI director

interface Op {
  op: "assert" | "retract" | "clear" | "tick" | "vital" | "mode" | "log" | "scene_events" | "objective" | "count" | "game" | "hello";
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
  history.clear();
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
    if (
      m.op === "assert" || m.op === "retract" ||
      m.op === "count" || m.op === "clear" ||
      (m.op === "vital" && meaningfulVital) ||
      (m.op === "log" && m.cmd === "action") // a player action with no vital
    ) {
      broadcastActivity(m);
    }
    switch (m.op) {
      case "hello":
        if (m.role === "ai") {
          directorSockets.add(ws);
          const modelInfo = m.model
            ? `  model=${m.model} [${m.modelOk === false ? "UNREACHABLE" : "reachable"}]`
            : "";
          console.log(
            `[coordinator] AI DIRECTOR registered${modelInfo}  (${directorSockets.size} director(s) connected)`,
          );
          sendAll(JSON.stringify({ type: "activity", id: ++activitySeq, role: "ai", op: "hello" }));
        }
        break;
      case "log":
        break; // record-only; nothing to apply
      case "scene_events":
        sceneEvents = m.events ?? [];
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
          history.assert(m.fact);
          broadcast();
        }
        break;
      case "retract":
        if (m.key) {
          history.retract(m.key);
          broadcast();
        }
        break;
      case "clear":
        history.clear();
        entityCount = 0; // scene switch / reset wipes the spawn count too
        chunks = 0;
        won = false; // reset the objective win on scene switch / reset
        broadcast();
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
