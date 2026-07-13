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

function broadcast(): void {
  const msg = JSON.stringify({ type: "facts", prompt: history.project() });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

function broadcastVitals(): void {
  const msg = JSON.stringify({ type: "vitals", ...vitals });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
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

interface Op {
  op: "assert" | "retract" | "clear" | "tick" | "vital" | "mode" | "log" | "scene_events" | "objective";
  fact?: Fact;
  key?: string;
  change?: VitalChange;
  role?: "player" | "human" | "ai"; // who sent it (for mode gating)
  mode?: "both" | "human" | "ai"; // for op:"mode"
  cmd?: string; // for op:"log" — a player-side command (event/prompt/…)
  detail?: unknown; // for op:"log" — command payload
  events?: SceneEvent[]; // for op:"scene_events"
  objective?: unknown; // for op:"objective"
}

function broadcastSceneEvents(): void {
  const msg = JSON.stringify({ type: "scene_events", events: sceneEvents });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

function broadcastObjective(): void {
  const msg = JSON.stringify({ type: "objective", objective });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

function broadcastMode(): void {
  const msg = JSON.stringify({ type: "mode", mode: directorMode });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

wss.on("connection", (ws) => {
  // Hand the newcomer the current state so a late-joining Director (or a
  // Player that reloaded) sees the live world immediately.
  ws.send(JSON.stringify({ type: "facts", prompt: history.project() }));
  ws.send(JSON.stringify({ type: "vitals", ...vitals }));
  ws.send(JSON.stringify({ type: "mode", mode: directorMode }));
  ws.send(JSON.stringify({ type: "scene_events", events: sceneEvents }));
  ws.send(JSON.stringify({ type: "objective", objective }));

  ws.on("message", (data) => {
    let m: Op;
    try {
      m = JSON.parse(String(data)) as Op;
    } catch {
      return; // ignore malformed frames
    }
    // Director-mode gate: drop the switched-off director's ops.
    if (
      (m.op === "assert" || m.op === "retract" || m.op === "vital") &&
      !opAllowed(m.role)
    ) {
      logCommand({ role: m.role, op: m.op, gated: true }); // record the drop too
      return;
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
    switch (m.op) {
      case "log":
        break; // record-only; nothing to apply
      case "scene_events":
        sceneEvents = m.events ?? [];
        broadcastSceneEvents();
        break;
      case "objective":
        objective = m.objective ?? null;
        broadcastObjective();
        break;

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
        broadcast();
        break;
      case "tick":
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
