// Curated "world events" the user can throw at the live scene.
//
// DYNAMIC_EVENTS below is the FALLBACK set — scenes can carry their own
// event list (`Scene.events`, e.g. the featured Paraglider), and the
// panel prefers that when present. These four weather events plus jump
// serve scenes without one: the curated scenes and anything the user
// starts from a custom prompt.
//
// Each entry is a sudden happening ("fog rolls in", "the subject
// leaps") the user applies by HOLDING a key or button. While held, the
// DynamicEvents panel hot-swaps the model's prompt mid-stream via
// `set_prompt` with a composed event prompt; on release it re-sends
// the pristine base prompt so the scene settles back. LingBot picks up
// each swap on the next chunk — no restart, no flash, the reference
// image stays put.
//
// COMPOSITION — why "And suddenly," and not plain concatenation:
// This mirrors the lab's current eval runtime. There,
// every applied event prompt is a single narrative: the base scene
// restated, then "And suddenly, <event>". Events authored as bare
// addenda get LLM-rewritten into that shape before they hit the model
// (`rewrite_applied` in the exported timelines); pre-authored finals
// (`prompt_final: true`) already carry it. We have no rewriter in the
// browser, so `composeEventPrompt` approximates the rewrite
// deterministically: keep the base verbatim, join with "And suddenly,".
// The connective is the load-bearing part — it tells the model this is
// an onset layered onto the established scene, not a new scene.
//
// HOLD SEMANTICS — why release snaps back instantly:
// The lab timelines pair every event with a `direct_switch` back to
// the base prompt the moment the key is released (then a settling
// rewrite of the same base). Events are transient by construction —
// the base prompt is the resting state, and an event only persists
// while its key is physically held. Our `set_prompt` with the captured
// base verbatim is the direct-switch equivalent.
//
// Authoring rules (so events compose cleanly with any starting scene):
//
//   1. One clause per event, written to follow "And suddenly," —
//      lowercase start, present tense. Anything longer competes with
//      the starting prompt and produces garbled output.
//
//   2. Describe an ONSET, not a state. "a thick fog rolls in" gives
//      the model a change to perform; "the scene is foggy" fights the
//      base prompt's established description.
//
//   3. Stay off the subject and camera — except for `jump`, which uses
//      the lab's built-in subject-motion addendum verbatim. The base
//      prompt has already framed both, so an environmental event slots
//      onto any scene without contradicting it.
//
// The environmental set is deliberately small (weather / time-of-day
// only). We trialed a wider pool, but only these four held up cleanly
// across every starting scene — fewer, reliable events beat a long menu.

export interface DynamicEvent {
  id: string;
  /** Short label shown on the button. */
  label: string;
  /** Single emoji used as the button icon. Decorative — no a11y role. */
  icon?: string;
  /**
   * Keyboard key that holds this event active (`KeyboardEvent.key`).
   * Digits / letters per the lab's slot layout, `" "` (space) for jump.
   * Absent on extra slot candidates — those are button-only.
   */
  key?: string;
  /** Label for the key, shown on the button's kbd chip. */
  keyLabel?: string;
  /**
   * The event as written by its author. Composed onto the base prompt
   * at press time when there is no `finalPrompt`; always used as the
   * button tooltip.
   */
  addendum: string;
  /**
   * A finished full-scene rewrite, applied VERBATIM while held. This is
   * the lab's `prompt_final: true` path — its rewriter already restated
   * the base scene plus the event as one narrative, so composing would
   * double the base. Highest-fidelity option when you have one.
   */
  finalPrompt?: string;
}

export const DYNAMIC_EVENTS: ReadonlyArray<DynamicEvent> = [
  {
    id: "fog",
    label: "Fog rolls in",
    icon: "🌫️",
    key: "1",
    keyLabel: "1",
    addendum:
      "a thick fog rolls in across the scene, softening every silhouette into a pale haze and shrinking the visible world to a few metres around the subject.",
  },
  {
    id: "sunset",
    label: "Golden sunset",
    icon: "🌇",
    key: "2",
    keyLabel: "2",
    addendum:
      "the sky deepens to gold and amber as the sun sinks low, casting long warm shadows across the scene and bathing every surface in honeyed light.",
  },
  {
    id: "night",
    label: "Night falls",
    icon: "🌙",
    key: "3",
    keyLabel: "3",
    addendum:
      "night falls over the scene as the sky deepens to indigo, a scattering of stars emerging and cool moonlight rimming every silhouette in silver.",
  },
  {
    id: "storm",
    label: "Storm strikes",
    icon: "⚡",
    key: "4",
    keyLabel: "4",
    addendum:
      "a dramatic thunderstorm cracks overhead, sheets of rain hammering the scene as forked lightning briefly washes everything in stark blue-white light.",
  },
  {
    // The lab runtime's built-in space-slot action, addendum verbatim.
    // The one event that IS about the subject — it reads as a game-like
    // "jump" on any scene with a controllable subject.
    id: "jump",
    label: "Jump",
    icon: "🦘",
    key: " ",
    keyLabel: "Space",
    addendum: "the current controllable subject springs upward into the air.",
  },
];

/**
 * The prompt sent while `event` is held.
 *
 * - `finalPrompt` present → verbatim. The lab's finished rewrites
 *   already contain the restated scene; composing would double it.
 * - Addendum authored as a connective clause (lowercase latin start,
 *   like the curated events above) → `base + " And suddenly, " + it`,
 *   the deterministic stand-in for the lab's LLM rewrite.
 * - Anything else (the lab's raw addenda — full sentences or Chinese
 *   text) → plain `base + " " + it`, the lab's own pre-rewrite
 *   concatenation format.
 */
export function composeEventPrompt(base: string, event: DynamicEvent): string {
  if (event.finalPrompt) return event.finalPrompt;
  const first = event.addendum.charAt(0);
  if (first >= "a" && first <= "z") {
    return `${base} And suddenly, ${event.addendum}`;
  }
  return `${base} ${event.addendum}`;
}

/** Look up an event in `events` by its hold key (`KeyboardEvent.key`). */
export function findEventByKey(
  events: ReadonlyArray<DynamicEvent>,
  key: string,
): DynamicEvent | null {
  return events.find((e) => e.key === key) ?? null;
}
