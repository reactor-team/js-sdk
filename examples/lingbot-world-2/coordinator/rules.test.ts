// Unit tests for the deterministic decide (./rules) — the json-rules-engine rules
// derived from a scene's `requires` gates. Pure: no coordinator/WebSocket/VLM.
//
//   npx tsx --test rules.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildEngine, decide, deriveRules } from "./rules";

// A tiny noir-like scene: one ungated opener, one gated follow-up, one health-gated death.
const SCENE = [
  { name: "Gunman on the Fire Escape" },
  { name: "Police Car Turns Up", requires: { fired: ["Gunman on the Fire Escape"] } },
  { name: "Player Falls and Dies", requires: { maxHealth: 0 } },
];

// firedEvents are LOWERCASED (History keys are), matching the coordinator's gameFacts().
const base = { firedEvents: [] as string[], health: 100, chunks: 10, inventory: [] as string[] };

test("deriveRules emits one rule per event with a don't-re-fire guard", () => {
  const rules = deriveRules(SCENE, 4);
  assert.equal(rules.length, 3);
});

test("ungated event waits for warmup, then fires", async () => {
  const e = buildEngine(SCENE, 4);
  assert.deepEqual(await decide(e, { ...base, chunks: 2 }), [], "silent before warmup");
  assert.ok((await decide(e, { ...base, chunks: 10 })).includes("Gunman on the Fire Escape"));
});

test("gated event stays locked until its predecessor has fired", async () => {
  const e = buildEngine(SCENE, 4);
  assert.ok(
    !(await decide(e, base)).includes("Police Car Turns Up"),
    "locked before Gunman",
  );
  assert.ok(
    (await decide(e, { ...base, firedEvents: ["gunman on the fire escape"] })).includes("Police Car Turns Up"),
    "unlocks after Gunman fires (by anyone)",
  );
});

test("an already-fired event does not re-fire", async () => {
  const e = buildEngine(SCENE, 4);
  const fired = await decide(e, { ...base, firedEvents: ["gunman on the fire escape"] });
  assert.ok(!fired.includes("Gunman on the Fire Escape"), "Gunman not re-offered");
});

test("health gate: death fires only at health <= 0", async () => {
  const e = buildEngine(SCENE, 4);
  assert.ok(!(await decide(e, { ...base, health: 50 })).includes("Player Falls and Dies"));
  assert.ok((await decide(e, { ...base, health: 0 })).includes("Player Falls and Dies"));
});
