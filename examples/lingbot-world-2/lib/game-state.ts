// GameState — the history that sits between player input and the world model.
//
// The world model is stateless: composePrompt() flattens the scene for the
// CURRENT instant only, so an event exists only while its key is held. This
// class supplies the memory the model doesn't have — the three layers:
//
//   situation : the raw present (moving?, keys down, posture)      — ephemeral
//   history   : what has become true and stays true                — flags,
//               (portal open, road on fire, cash collected)          timers,
//                                                                     inventory,
//                                                                     resources
//   rules     : what is ALLOWED to become true (can't fire an       — EventRule
//               empty gun; pickups edit history once)
//
// Persistence is repetition: a sticky effect keeps narrating every tick until
// its timer runs out, so the model is re-told "the road is on fire" until
// history says stop. narrate() is the one output — the prose sent to set_prompt.

import {
  composePrompt,
  type StructuredScene,
} from "@/lib/lingbot-world-prompts";

// Per-event semantics. The scene JSON only carries the prose; how an event
// behaves in TIME is authored here, keyed by event slot (index into
// scene.events). Omitted slots default to { kind: "momentary" }.
export type EventRule =
  // Narrated only while the key is held (punch, sprint) — the default.
  | { kind: "momentary" }
  // On press, stays active for `chunks` ticks even after release, then drops.
  // Used for effects that must persist: an opened portal, a spreading fire.
  | { kind: "sticky"; chunks: number }
  // Fires once per press and edits history instead of (or besides) being
  // narrated: pick up cash, holster a weapon, take a hit.
  | { kind: "transition"; apply: (s: GameState) => void }
  // Legal only when `when` holds; otherwise the press is dropped and `otherwise`
  // (if given) is narrated instead — "clicks an empty pistol".
  | { kind: "gated"; when: (s: GameState) => boolean; otherwise?: string };

export interface GameStateConfig {
  scene: StructuredScene;
  rules?: Record<number, EventRule>; // slot -> rule
  inventory?: string[];
  resources?: Record<string, number>; // ammo, cash, boost, ...
  mode?: string;
  health?: number; // starting health (default = maxHealth)
  maxHealth?: number; // full health (default 100)
}

export class GameState {
  readonly scene: StructuredScene;
  private rules: Record<number, EventRule>;

  // ── situation (ephemeral) ──
  isMoving = false;
  posture: "stand" | "crouch" | "jump" = "stand";
  private held = new Set<number>(); // event keys physically down

  // ── history (persists across ticks) ──
  private timers = new Map<number, number>(); // slot -> chunks left on a sticky
  flags: Record<string, boolean> = {};
  inventory: string[];
  resources: Record<string, number>;
  mode: string;

  // ── vitals ──
  health: number;
  readonly maxHealth: number;

  // ── reconcile scratch: substitute clauses to append THIS tick only ──
  private pending: string[] = [];

  constructor(cfg: GameStateConfig) {
    this.scene = cfg.scene;
    this.rules = cfg.rules ?? {};
    this.inventory = [...(cfg.inventory ?? [])];
    this.resources = { ...(cfg.resources ?? {}) };
    this.mode = cfg.mode ?? "explore";
    this.maxHealth = cfg.maxHealth ?? 100;
    this.health = cfg.health ?? this.maxHealth;
  }

  // ── vitals: damage/heal, clamped; hitting 0 flips mode to "dead" ───────────
  get isDead(): boolean {
    return this.health <= 0;
  }
  damage(n: number) {
    this.health = Math.max(0, this.health - n);
    if (this.isDead) this.mode = "dead";
  }
  heal(n: number) {
    if (this.isDead) return; // no healing back from death without a respawn
    this.health = Math.min(this.maxHealth, this.health + n);
  }

  private ruleFor(slot: number): EventRule {
    return this.rules[slot] ?? { kind: "momentary" };
  }

  // ── input ────────────────────────────────────────────────────────────────
  setMoving(v: boolean) {
    this.isMoving = v;
  }
  setPosture(p: "stand" | "crouch" | "jump") {
    this.posture = p;
  }

  press(slot: number) {
    const rule = this.ruleFor(slot);
    switch (rule.kind) {
      case "gated":
        if (rule.when(this)) this.held.add(slot);
        else if (rule.otherwise) this.pending.push(rule.otherwise);
        return;
      case "transition":
        rule.apply(this); // one-shot history edit; not held
        return;
      case "sticky":
        this.held.add(slot);
        this.timers.set(slot, rule.chunks); // survives release
        return;
      default:
        this.held.add(slot);
    }
  }

  release(slot: number) {
    // Sticky slots stay active until their timer expires; everything else drops.
    if (!this.timers.has(slot)) this.held.delete(slot);
  }

  // Fold the VLM observer back in: expected vs. observed, then correct. e.g.
  // observe({ subjectVisible: false }) can re-assert the base identity harder.
  observe(facts: { subjectVisible?: boolean; hazards?: string[] }) {
    if (facts.subjectVisible === false) this.pending.push(RE_ANCHOR);
  }

  // ── advance one chunk: age sticky effects, drop the expired ────────────────
  tick() {
    for (const [slot, left] of this.timers) {
      if (left <= 1) {
        this.timers.delete(slot);
        this.held.delete(slot);
      } else {
        this.timers.set(slot, left - 1);
      }
    }
  }

  // ── the single output: the prose sent to the world model this chunk ────────
  narrate(): string {
    const slots = [...this.held].sort((a, b) => a - b);
    const vertical =
      this.posture === "jump"
        ? this.scene.jumpPrompt ?? ""
        : this.posture === "crouch"
          ? this.scene.crouchPrompt ?? ""
          : "";

    // Core scene = base + camera + movement + held/sticky event details, via
    // the existing pure composer (stacking + version-compat handled there).
    const core = composePrompt(this.scene, this.isMoving, slots, vertical);

    // History/rules clauses the composer can't know about: standing inventory
    // facts + any substitute/reconcile clauses queued this tick.
    const carried = this.inventory.length
      ? `He is carrying ${this.inventory.join(", ")}.`
      : "";
    const extra = this.pending.splice(0).join(" "); // consume once

    // Vitals narrated as a standing condition (re-said every chunk while it
    // holds — persistence is repetition): collapsed at 0, wounded under a third.
    const vitals = this.isDead
      ? "The character collapses to the ground, badly wounded and motionless."
      : this.health < this.maxHealth / 3
        ? "The character is badly wounded, moving weakly and clutching their injuries."
        : "";

    return [core, carried, extra, vitals]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
  }
}

const RE_ANCHOR =
  "The character is re-centred in frame, back to camera, clearly in view.";
