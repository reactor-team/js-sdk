// Deterministic decide via json-rules-engine — the pure, testable half of the
// coordinator's rules-engine director. Turns a scene's director events into rules
// (from their authored `requires` gate) and builds a ready-to-run Engine.
//
// No coordinator/WebSocket deps, so it unit-tests standalone (see rules.test.ts).

import { Engine } from "json-rules-engine";

export type Requires = {
  fired?: string[];
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
      for (const n of req.notFired ?? [])
        conds.push({ fact: "firedEvents", operator: "doesNotContain", value: String(n).toLowerCase() });
      if (req.minChunks != null) conds.push({ fact: "chunks", operator: "greaterThanInclusive", value: req.minChunks });
      if (req.maxHealth != null) conds.push({ fact: "health", operator: "lessThanInclusive", value: req.maxHealth });
      if (req.minHealth != null) conds.push({ fact: "health", operator: "greaterThanInclusive", value: req.minHealth });
      if (req.hasItem) conds.push({ fact: "inventory", operator: "contains", value: req.hasItem });
    } else {
      conds.push({ fact: "chunks", operator: "greaterThanInclusive", value: warmup });
    }
    return { conditions: { all: conds }, event: { type: "fire", params: { name: e.name } } };
  });
}

/** Build an Engine over `events` with the array `contains`/`doesNotContain` operators. */
export function buildEngine(events: RuleEvent[], warmup = 4): Engine {
  const engine = new Engine([], { allowUndefinedFacts: true });
  engine.addOperator("contains", (a: unknown, b: unknown) => Array.isArray(a) && a.includes(b));
  engine.addOperator("doesNotContain", (a: unknown, b: unknown) => Array.isArray(a) && !a.includes(b));
  for (const r of deriveRules(events, warmup)) engine.addRule(r as Parameters<typeof engine.addRule>[0]);
  return engine;
}

/** Convenience: the event NAMES that fire for a given fact snapshot (priority order). */
export async function decide(engine: Engine, facts: GameFacts): Promise<string[]> {
  const { events } = await engine.run(facts);
  return events.map((e) => (e.params as { name?: string })?.name).filter((n): n is string => !!n);
}
