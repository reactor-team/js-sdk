// History — the memory a stateless generative model doesn't have.
//
// A world model conditions only on its CURRENT signal; it has no past, no
// persistence, no consequence. History is that missing memory, reduced to its
// domain-agnostic core. It knows nothing about games, inventories, or cameras —
// only about facts that persist, age, and get re-asserted into a signal.
//
// Three concerns, cleanly separated:
//
//   intake      turns transient input into asserted facts, under constraints.
//   history     holds facts, ages them, reconciles them against observation.
//   projection  flattens the live facts into the conditioning signal.
//
// The one invariant behind all of it: PERSISTENCE IS REPETITION. The model
// forgets between steps, so a fact stays true only by being re-projected every
// step until its lifetime ends. History is what keeps saying it.

// How long a fact lives once asserted.
export type Lifetime =
  | { kind: "instant" } //           present for exactly one step
  | { kind: "steps"; n: number } //  present for n steps, then expires
  | { kind: "sustained" }; //        present until explicitly retracted

// A single unit of state. Identity is `key`: re-asserting the same key
// refreshes the same fact rather than duplicating it.
export interface Fact {
  key: string;
  clause: string; //  how this fact narrates into the signal
  weight: number; // ordering / precedence when projecting (low → early)
  life: Lifetime;
}

// A constraint on intake: given the current history, may this fact be asserted,
// and if not, is there a substitute to assert instead?
export type Constraint = (
  fact: Fact,
  history: History,
) => Fact | null; // returns the fact to assert, a substitute, or null to drop

interface Live {
  fact: Fact;
  age: number; // steps this fact has been alive
}

export class History {
  private live = new Map<string, Live>();
  private constraints: Constraint[];
  private prefix: string; // an always-on identity clause (weight 0), optional
  private debug: boolean; // print every state change

  constructor(
    opts: { identity?: string; constraints?: Constraint[]; debug?: boolean } = {},
  ) {
    this.prefix = opts.identity ?? "";
    this.constraints = opts.constraints ?? [];
    this.debug = opts.debug ?? false;
  }

  // Print a state change plus the resulting live set. Wired to console in the
  // browser and stdout in the coordinator — one line per mutation, e.g.
  //   [history] + env:weather  ⟶  [env:weather, fx:fire(3)]
  private log(change: string): void {
    if (!this.debug) return;
    const live = [...this.live.entries()]
      .sort((a, b) => a[1].fact.weight - b[1].fact.weight)
      .map(([k, l]) => {
        const life = l.fact.life;
        const rem =
          life.kind === "steps" ? `(${life.n - l.age})` : life.kind === "sustained" ? "" : "(1)";
        return `${k}${rem}`;
      });
    console.log(`[history] ${change}  ⟶  [${live.join(", ")}]`);
  }

  // ── intake ────────────────────────────────────────────────────────────────
  // Offer a fact to history. Constraints may rewrite, substitute, or reject
  // it. An accepted fact with a matching key refreshes the existing one.
  assert(fact: Fact): void {
    let f: Fact | null = fact;
    for (const c of this.constraints) {
      if (!f) break;
      f = c(f, this);
    }
    if (f) {
      const refresh = this.live.has(f.key);
      this.live.set(f.key, { fact: f, age: 0 });
      this.log(`${refresh ? "~" : "+"} ${f.key}`);
    } else {
      this.log(`✗ ${fact.key} (rejected by constraint)`);
    }
  }

  retract(key: string): void {
    if (this.live.delete(key)) this.log(`- ${key}`);
  }

  // Drop every fact — on session reset or scene switch, so persistent world
  // state (a Director snowstorm) doesn't leak into the next world.
  clear(): void {
    if (this.live.size) {
      this.live.clear();
      this.log("clear");
    }
  }

  has(key: string): boolean {
    return this.live.has(key);
  }

  // ── history: age one step, expire what has run out ─────────────────────────
  // Called once per generated step. `instant` facts always drop; `steps` facts
  // drop when their count is exhausted; `sustained` facts never drop here.
  // Returns true if any fact expired this step (i.e. project() would change),
  // so callers can re-emit the signal only when something actually dropped.
  advance(): boolean {
    let changed = false;
    for (const [key, l] of this.live) {
      const age = l.age + 1;
      const life = l.fact.life;
      const expired =
        life.kind === "instant" ||
        (life.kind === "steps" && age >= life.n);
      if (expired) {
        this.live.delete(key);
        changed = true;
        this.log(`⌛ ${key} (expired)`);
      } else this.live.set(key, { fact: l.fact, age });
    }
    return changed;
  }

  // ── reconcile: fold observation back in ────────────────────────────────────
  // The model may render something history didn't authorize, or drop
  // something it did. Given the set of fact-keys actually observed, drop the
  // sustained facts the world let go of, and re-assert (age-reset) the ones it
  // should still be showing but isn't — the expected-vs-observed correction.
  reconcile(observedKeys: Set<string>): void {
    for (const [key, l] of this.live) {
      if (l.fact.life.kind !== "sustained") continue;
      if (!observedKeys.has(key)) this.live.set(key, { fact: l.fact, age: 0 });
    }
  }

  // ── projection: the single output — the conditioning signal this step ──────
  project(): string {
    const clauses = [...this.live.values()]
      .map((l) => l.fact)
      .sort((a, b) => a.weight - b.weight)
      .map((f) => f.clause);
    return [this.prefix, ...clauses]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
  }
}
