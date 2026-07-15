// PlayerController — the client's input + rules layer between the keyboard and the
// world model. NOT a state store: the one authoritative state (facts + vitals) lives
// in the coordinator's History (in-browser by default; a server only for cross-machine
// directing). This controller:
//
//   input : moving?, posture, held keys                       — the source of ops
//   rules : slot -> EventRule (momentary|sticky|transition|gated)  — input -> op mapping
//   emit  : writes to the coordinator's ONE History via ops (assert/retract/vital/tick)
//   cache : a read-through of the coordinator's projected facts / vitals / observations
//           — held for zero-latency prompt building + rule gating, NOT a second copy of truth
//
// narrate() composes the prompt: the scene layer (composePrompt) + the cached projection.
// Nothing persists here — a sticky effect or an equipped tool is a coordinator fact that
// this controller emitted and reads back via setFacts(). Persistence is repetition, but
// the coordinator does the repeating.
//
// ── WIRING STATUS (read before extending) ──────────────────────────────────────
// LIVE path today: the only caller (LingbotWorldController) constructs this with NO
// `rules` and drives it via setMoving() / setHeld() / narrate(). That path is fully
// behavior-preserving — narrate() == the old composePrompt plus the read-through facts.
//
// INERT until press/release EDGES are wired: press(), release(), the gated/transition/
// sticky rule kinds, and everything they reach — equip()/activeTool, damage()/heal(),
// observe(). Nothing calls press()/release() yet (the caller mirrors held keys in bulk via
// setHeld(), which never crosses a rule), and no scene passes a `rules` map, so these are
// designed-but-dormant. They are the intended extension point (per-scene EventRule → ops),
// not dead code to delete — but treat them as UNTESTED: before relying on any of them, wire
// real press/release edges + a `rules` map at the call site and exercise the op emission.
// ───────────────────────────────────────────────────────────────────────────────

import {
  composePrompt,
  type StructuredScene,
} from "@/lib/lingbot-world-prompts";
import { type Fact } from "@/lib/history";

// Ops emitted to the coordinator (Contract 3). The ONE History lives there; this
// controller writes to it via these and never keeps a copy.
export type CoordOp =
  | { op: "assert"; fact: Fact }
  | { op: "retract"; key: string }
  | { op: "vital"; change: { health?: number; addItem?: string; removeItem?: string } }
  | { op: "tick" };

// Per-event semantics. The scene JSON only carries the prose; how an event behaves in
// TIME is authored here, keyed by event slot (index into scene.events). Omitted slots
// default to { kind: "momentary" }.
export type EventRule =
  // Narrated only while the key is held (punch, sprint) — the default.
  | { kind: "momentary" }
  // On press, emit a sticky coordinator fact that persists `chunks` ticks after release.
  | { kind: "sticky"; chunks: number }
  // Fires once per press and emits an op (equip a tool, take a hit) — not held.
  | { kind: "transition"; apply: (s: PlayerController) => void }
  // Legal only when `when` holds; otherwise the press is dropped and `otherwise`
  // (if given) is narrated for one tick — "clicks an empty pistol".
  | { kind: "gated"; when: (s: PlayerController) => boolean; otherwise?: string };

export interface PlayerControllerConfig {
  scene: StructuredScene;
  rules?: Record<number, EventRule>; // slot -> rule
  emit?: (op: CoordOp) => void; // sink to the coordinator; default no-op (standalone/testing)
}

export class PlayerController {
  readonly scene: StructuredScene;
  private rules: Record<number, EventRule>;
  private emit: (op: CoordOp) => void;

  // ── input (ephemeral) — the source of ops ──
  isMoving = false;
  posture: "stand" | "crouch" | "jump" = "stand";
  private held = new Set<number>(); // event keys physically down (momentary/gated)

  // ── read-through of the coordinator's state (cached; NOT owned here) ──
  facts = ""; // coordinator project() string, appended to the prompt
  observations: Record<string, boolean> = {}; // probe reads, for gated rules
  inventory: string[] = []; // cached for the HUD
  health = 100;
  maxHealth = 100;
  activeTool: string | null = null; // cached mirror for the HUD / gated reads

  // ── reconcile scratch: substitute clauses to append THIS tick only ──
  private pending: string[] = [];

  constructor(cfg: PlayerControllerConfig) {
    this.scene = cfg.scene;
    this.rules = cfg.rules ?? {};
    this.emit = cfg.emit ?? (() => {});
  }

  // ── read-through setters — the client calls these from coordinator broadcasts.
  // They cache the coordinator's truth locally; they do NOT make this the owner. ──
  setFacts(projected: string) {
    this.facts = projected;
  }
  setObservations(obs: Record<string, boolean>) {
    this.observations = obs;
  }
  setVitals(health: number, maxHealth: number, inventory: string[]) {
    this.health = health;
    this.maxHealth = maxHealth;
    this.inventory = [...inventory];
  }

  // Detail clause for an event slot (string, or the .static of a static/dynamic pair).
  private detailOf(slot: number): string {
    const d = this.scene.events?.[slot]?.detail;
    return typeof d === "string" ? d : d?.static ?? "";
  }

  get isDead(): boolean {
    return this.health <= 0;
  }

  // ── equip: emit a sustained "tool" fact to the coordinator; cache the name for the
  // HUD. Call from a "transition" rule so a keypress swaps the tool; null to stow. ──
  equip(tool: string | null) {
    this.activeTool = tool;
    if (tool) {
      this.emit({
        op: "assert",
        fact: {
          key: "tool",
          clause: `He has a ${tool} in hand, held ready.`,
          weight: 50,
          life: { kind: "sustained" },
        },
      });
    } else {
      this.emit({ op: "retract", key: "tool" });
    }
  }

  // ── vitals: the coordinator owns health — emit a vital op (signed delta). ──
  damage(n: number) {
    this.emit({ op: "vital", change: { health: -n } });
  }
  heal(n: number) {
    this.emit({ op: "vital", change: { health: n } });
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
  // Mirror the held slots from the controller's authoritative ref (insertion order
  // preserved = press order). Used when the controller owns the raw key state and
  // this class is the prompt producer.
  setHeld(slots: number[]) {
    this.held = new Set(slots);
  }

  // NOTE: press()/release() are the INERT edge path (see WIRING STATUS up top). No caller
  // feeds these yet — the live path mirrors held keys in bulk via setHeld(). The gated/
  // transition/sticky branches below are the extension point, currently untested.
  press(slot: number) {
    const rule = this.ruleFor(slot);
    switch (rule.kind) {
      case "gated":
        if (rule.when(this)) this.held.add(slot);
        else if (rule.otherwise) this.pending.push(rule.otherwise);
        return;
      case "transition":
        rule.apply(this); // one-shot; may call equip()/damage() -> emits ops
        return;
      case "sticky":
        // Persist as a coordinator fact with a `steps` life — it narrates every tick
        // (via the read-through) until the coordinator ages it out; no key held.
        this.emit({
          op: "assert",
          fact: {
            key: `sticky:${slot}`,
            clause: this.detailOf(slot),
            weight: 60 + slot,
            life: { kind: "steps", n: rule.chunks },
          },
        });
        return;
      default:
        this.held.add(slot);
    }
  }

  release(slot: number) {
    // Momentary/gated drop on release; sticky effects live in the coordinator until aged.
    this.held.delete(slot);
  }

  // Fold the VLM observer back in: expected vs. observed, then correct. subjectVisible
  // false emits a one-tick re-anchor fact to the coordinator.
  observe(facts: { subjectVisible?: boolean; hazards?: string[] }) {
    if (facts.subjectVisible === false)
      this.emit({
        op: "assert",
        fact: { key: "reanchor", clause: RE_ANCHOR, weight: 90, life: { kind: "instant" } },
      });
  }

  // ── advance one chunk: the coordinator ages its facts (sticky expire, instant drop). ──
  tick() {
    this.emit({ op: "tick" });
  }

  // ── the single output: scene layer (composePrompt) + the coordinator's projected
  // facts (read-through) + any one-tick substitute clauses. The persistent prose —
  // tool, sticky effects, director facts — arrives via setFacts(), not from here. ──
  narrate(verticalOverride?: string): string {
    const slots = [...this.held]; // insertion order = press order (most-recent last)
    const vertical =
      verticalOverride ??
      (this.posture === "jump"
        ? this.scene.jumpPrompt ?? ""
        : this.posture === "crouch"
          ? this.scene.crouchPrompt ?? ""
          : "");

    const core = composePrompt(this.scene, this.isMoving, slots, vertical);
    const extra = this.pending.splice(0).join(" "); // consume once

    return [core, this.facts, extra]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
  }
}

const RE_ANCHOR =
  "The character is re-centred in frame, back to camera, clearly in view.";
