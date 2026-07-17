// Deterministic decide via json-rules-engine — the pure, testable half of the
// coordinator's rules-engine director. Turns a scene's director events into rules
// (from their authored `requires` gate) and builds a ready-to-run Engine.
//
// No coordinator/WebSocket deps, so it unit-tests standalone (see rules.test.ts).

import { Engine } from "json-rules-engine";

export type Requires = {
  fired?: string[]; // ALL of these must have fired (AND)
  firedAny?: string[]; // ANY one of these must have fired (OR)
  notFired?: string[];
  minChunks?: number;
  maxHealth?: number;
  minHealth?: number;
  hasItem?: string;
};

/** The event shape rules need (a subset of the coordinator's SceneEvent). */
export interface RuleEvent {
  name: string;
  requires?: Requires | unknown;
  priority?: number;
  chance?: number; // 0..1 per-tick fire probability once the gate holds (randomized timing)
}

/** Facts the rules read — the flat shape produced by the coordinator's gameFacts(). */
export interface GameFacts {
  firedEvents: string[];
  health: number;
  chunks: number;
  inventory: string[];
  observations?: Record<string, boolean>;
  [k: string]: unknown;
}

/**
 * One rule per director event, its `requires` gate translated to conditions plus a
 * "don't re-fire" guard. Names are lowercased to match the `firedEvents` fact (History
 * keys are lowercased). Ungated events wait `warmup` chunks so the scene settles first.
 */
export function deriveRules(events: RuleEvent[], warmup = 4): object[] {
  return events.map((e) => {
    const conds: Record<string, unknown>[] = [
      { fact: "firedEvents", operator: "doesNotContain", value: e.name.toLowerCase() },
    ];
    const req = e.requires as Requires | undefined;
    if (req) {
      for (const n of req.fired ?? [])
        conds.push({ fact: "firedEvents", operator: "contains", value: String(n).toLowerCase() });
      if (req.firedAny?.length)
        conds.push({
          any: req.firedAny.map((n) => ({
            fact: "firedEvents",
            operator: "contains",
            value: String(n).toLowerCase(),
          })),
        });
      for (const n of req.notFired ?? [])
        conds.push({ fact: "firedEvents", operator: "doesNotContain", value: String(n).toLowerCase() });
      if (req.minChunks != null) conds.push({ fact: "chunks", operator: "greaterThanInclusive", value: req.minChunks });
      if (req.maxHealth != null) conds.push({ fact: "health", operator: "lessThanInclusive", value: req.maxHealth });
      if (req.minHealth != null) conds.push({ fact: "health", operator: "greaterThanInclusive", value: req.minHealth });
      if (req.hasItem) conds.push({ fact: "inventory", operator: "contains", value: req.hasItem });
    } else {
      conds.push({ fact: "chunks", operator: "greaterThanInclusive", value: warmup });
    }
    // Per-tick probability: once the gate above holds, fire only when a fresh `random`
    // (0..1) draw is under `chance` — so the event lands at a VARIED time, not the instant
    // its gate opens. e.g. minChunks:24 + chance:0.2 → arrives somewhere after chunk 24.
    if (e.chance != null)
      conds.push({ fact: "random", operator: "lessThanInclusive", value: e.chance });
    // priority in params so the coordinator can group ties (equal-priority events) and
    // pick among them at random — equal chance for a mutex / flavor pool. Derived rules
    // are all priority 1 (flat), so among several eligible it's a fair random draw.
    return {
      conditions: { all: conds },
      event: { type: "fire", params: { name: e.name, priority: e.priority ?? 1 } },
    };
  });
}

/**
 * Build an Engine with the array `contains`/`doesNotContain` operators. If the scene
 * ships explicit `rules[]` they are used AS-IS (author's full ruleset — priorities,
 * observation `path` conditions, etc.); otherwise rules are derived from each event's
 * `requires` gate. Explicit rules reference events by name in `event.params.name`.
 */
export function buildEngine(events: RuleEvent[], warmup = 4, explicitRules?: object[]): Engine {
  const engine = new Engine([], { allowUndefinedFacts: true });
  engine.addOperator("contains", (a: unknown, b: unknown) => Array.isArray(a) && a.includes(b));
  engine.addOperator("doesNotContain", (a: unknown, b: unknown) => Array.isArray(a) && !a.includes(b));
  const rules = explicitRules && explicitRules.length ? explicitRules : deriveRules(events, warmup);
  for (const r of rules) engine.addRule(r as Parameters<typeof engine.addRule>[0]);
  return engine;
}

/** Convenience: the event NAMES that fire for a given fact snapshot (priority order). */
export async function decide(engine: Engine, facts: GameFacts): Promise<string[]> {
  const { events } = await engine.run(facts);
  return events.map((e) => (e.params as { name?: string })?.name).filter((n): n is string => !!n);
}
