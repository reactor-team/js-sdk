import type { Ltx2Message, Ltx2StateUpdateMessage } from "@reactor-models/ltx2";
import type { Ltx2UiState } from "./types";

// Projects model `state_update` snapshots into Ltx2UiState. Returns the
// previous object when nothing changed so React can bail out of re-rendering
// the whole tree on the model's frequent identical echoes — this model emits a
// snapshot after every window, so the bail-out matters.
//
// Only `state_update` feeds this reducer. The discrete acks
// (`script_accepted`, `avatar_image_accepted`, …) are one-shot notifications;
// every one of them is followed by a snapshot carrying the same information,
// so reconstructing state from them would just be a second, racier path to
// the same place.
export function reduce(
  state: Ltx2UiState,
  msg: Ltx2StateUpdateMessage,
): Ltx2UiState {
  const next: Ltx2UiState = {
    script: msg.script ?? null,
    prompt: msg.prompt,
    hasAvatarImage: msg.has_avatar_image,
    wpm: msg.wpm,
    durationSeconds: msg.duration_seconds,
    effectiveSeconds: msg.effective_seconds,
    seed: msg.seed,
    ready: msg.ready,
    generating: msg.generating,
    validCommands: msg.valid_commands,
    queuedChanges: msg.queued_changes,
    wpmMin: msg.wpm_min,
    wpmMax: msg.wpm_max,
    paused: msg.paused,
    finished: msg.finished,
    windowIndex: msg.window_index,
    totalWindows: msg.total_windows,
    secondsSent: msg.seconds_sent,
  };
  // `valid_commands` and `queued_changes` arrive as fresh arrays in every
  // snapshot, so identity comparison would report a change on each one and
  // defeat the bail-out entirely. Compare those two by content.
  const changed = (Object.keys(next) as (keyof Ltx2UiState)[]).some((k) => {
    const a = next[k];
    const b = state[k];
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length !== b.length || a.some((v, i) => v !== b[i]);
    }
    return a !== b;
  });
  return changed ? next : state;
}

// ---------------------------------------------------------------------------
// One-shot message waiters.
//
// A command method resolves when the command is on the wire, NOT when the model
// has acted on it. For most commands that distinction is invisible, but for
// `set_avatar_image` it is a real bug: the model has to fetch and decode the
// upload, and a `start` racing in before that finishes generates the take with
// the PREVIOUS face. So the avatar-image path waits for the model to confirm.
//
// Register the waiter BEFORE sending the command it belongs to, or a fast ack
// can arrive before the listener exists and the wait times out on a command
// that actually succeeded.
//
// The waiter set is module state, so it outlives any one session — see
// clearMessageWaiters, which the app shell calls on disconnect.
// ---------------------------------------------------------------------------

interface MessageWaiter {
  predicate: (message: Ltx2Message) => boolean;
  resolve: (message: Ltx2Message | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

const waiters = new Set<MessageWaiter>();

/**
 * Resolve with the next inbound message matching `predicate`, or `null` after
 * `timeoutMs`. Pair with {@link dispatchMessageToWaiters}, which the app shell
 * calls for every message it receives.
 */
export function waitForMessage(
  predicate: (message: Ltx2Message) => boolean,
  timeoutMs: number,
): Promise<Ltx2Message | null> {
  return new Promise((resolve) => {
    const waiter: MessageWaiter = {
      predicate,
      resolve,
      timer: setTimeout(() => {
        waiters.delete(waiter);
        resolve(null);
      }, timeoutMs),
    };
    waiters.add(waiter);
  });
}

/**
 * Feed every inbound model message here so pending waiters can resolve.
 *
 * A message resolves EVERY waiter it matches; there are no correlation ids
 * tying an ack back to the command that earned it. That is sound here only
 * because the UI permits a single upload at a time — one crop modal, and Start
 * is held until its ack lands. Allow two in flight and this needs correlating.
 */
export function dispatchMessageToWaiters(message: Ltx2Message): void {
  for (const waiter of [...waiters]) {
    if (waiter.predicate(message)) {
      waiters.delete(waiter);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  }
}

/**
 * Drop every pending waiter. Call this when the session ends.
 *
 * Waiters are module-scoped, so one registered moments before a disconnect
 * would otherwise still be sitting there when the next session opens — and the
 * first `avatar_image_accepted` of that session would resolve it, confirming
 * an upload that belongs to a session which no longer exists.
 *
 * Resolving with `null` rather than leaving them hanging puts the caller on
 * the path it already handles: `null` is what a timeout yields, and it is read
 * everywhere as "the model did not confirm".
 */
export function clearMessageWaiters(): void {
  for (const waiter of [...waiters]) {
    waiters.delete(waiter);
    clearTimeout(waiter.timer);
    waiter.resolve(null);
  }
}
