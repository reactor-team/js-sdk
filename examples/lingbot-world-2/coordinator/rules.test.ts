// Unit tests for the deterministic decide (./rules) — the json-rules-engine rules
// derived from a scene's `requires` gates. Pure: no coordinator/WebSocket/VLM.
//
//   npx tsx --test rules.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildEngine, decide, deriveRules, type RuleEvent } from "./rules";

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

// ── the remaining gate kinds the derived rules translate ──────────────────────

test("notFired gate: a mutex opener locks out once a sibling has fired", async () => {
  const scene = [
    { name: "Calm", requires: { notFired: ["Shark"] } },
    { name: "Shark", requires: { notFired: ["Calm"] } },
  ];
  const e = buildEngine(scene, 0);
  const open = await decide(e, base);
  assert.ok(open.includes("Calm") && open.includes("Shark"), "both eligible before either fires");
  const after = await decide(e, { ...base, firedEvents: ["shark"] });
  assert.ok(!after.includes("Calm"), "Calm locked out once Shark fired");
  assert.ok(!after.includes("Shark"), "Shark does not re-fire");
});

test("firedAny gate: unlocks when ANY listed predecessor has fired (OR)", async () => {
  const scene = [{ name: "Thrown", requires: { firedAny: ["Shark Lunges", "Rogue Wave"] } }];
  const e = buildEngine(scene, 0);
  assert.ok(!(await decide(e, base)).includes("Thrown"), "locked with neither fired");
  assert.ok((await decide(e, { ...base, firedEvents: ["rogue wave"] })).includes("Thrown"), "rogue wave alone unlocks");
  assert.ok((await decide(e, { ...base, firedEvents: ["shark lunges"] })).includes("Thrown"), "shark lunges alone unlocks");
});

test("minChunks gate: holds until the chunk floor", async () => {
  const e = buildEngine([{ name: "Fuel Runs Low", requires: { minChunks: 40 } }], 0);
  assert.ok(!(await decide(e, { ...base, chunks: 39 })).includes("Fuel Runs Low"), "locked at chunk 39");
  assert.ok((await decide(e, { ...base, chunks: 40 })).includes("Fuel Runs Low"), "fires at chunk 40");
});

test("minHealth gate: a survival ending needs health above the floor", async () => {
  const e = buildEngine([{ name: "Sunset", requires: { minChunks: 160, minHealth: 1 } }], 0);
  assert.ok(!(await decide(e, { ...base, chunks: 160, health: 0 })).includes("Sunset"), "no sunset when dead");
  assert.ok((await decide(e, { ...base, chunks: 160, health: 1 })).includes("Sunset"), "sunset alive at 160 chunks");
});

test("chance gate: fires only when the random draw is under the probability", async () => {
  const e = buildEngine([{ name: "Turtle", chance: 0.1 }], 0); // ungated + 10%/tick
  assert.ok((await decide(e, { ...base, random: 0.05 })).includes("Turtle"), "fires when random < chance");
  assert.ok(!(await decide(e, { ...base, random: 0.5 })).includes("Turtle"), "silent when random > chance");
});

// ── rules-decide core: an explicit rule that fires off the probe's observations ─
// This is the path the default (rules-decide) director drives: the coordinator's
// rules read `observations` (posted via op:observe). An OMITTED key (the probe said
// "unknown") must NOT fire — the state machine never acts on what wasn't seen.
test("observation rule fires on a true probe read, not on false or unknown", async () => {
  const rule = {
    conditions: {
      all: [
        { fact: "observations", path: "$.shark_appears", operator: "equal", value: true },
        { fact: "firedEvents", operator: "doesNotContain", value: "shark spotted" },
      ],
    },
    event: { type: "fire", params: { name: "Shark Spotted" } },
  };
  const e = buildEngine([], 0, [rule]); // explicit-rules path
  const seen = await decide(e, { ...base, observations: { shark_appears: true } });
  assert.ok(seen.includes("Shark Spotted"), "fires when the probe saw the shark");
  const not = await decide(e, { ...base, observations: { shark_appears: false } });
  assert.ok(!not.includes("Shark Spotted"), "silent when the probe said false");
  const unknown = await decide(e, { ...base, observations: {} });
  assert.ok(!unknown.includes("Shark Spotted"), "silent when unknown (omitted) — no state update");
});

// ── end-to-end on the REAL jet-ski scene (the working rules-decide scene) ──────
const JETSKI = JSON.parse(
  readFileSync(new URL("../lib/lingbot-cases/jet-ski-cruise.json", import.meta.url), "utf8"),
);
const JET_EVENTS = (JETSKI.scene.events as { actor?: string }[])
  .filter((e) => e.actor === "director")
  .map((e) => e as RuleEvent);

test("real jet-ski scene: sequel/ending beats stay locked until their gate opens", async () => {
  const e = buildEngine(JET_EVENTS, 0);
  const fresh = await decide(e, { ...base, chunks: 0, random: 0 }); // random 0 → chance never blocks
  assert.ok(!fresh.includes("Shark Lunges"), "shark lunge locked until shark appears");
  assert.ok(!fresh.includes("Volcanic Island Erupts"), "volcano locked until island");
  assert.ok(!fresh.includes("Rides into the Sunset"), "sunset needs 160 chunks");
  const lunge = await decide(e, { ...base, firedEvents: ["shark appears"], chunks: 5, random: 0 });
  assert.ok(lunge.includes("Shark Lunges"), "shark lunge unlocks after shark appears fired");
});
