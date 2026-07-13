import type { X2StateUpdateMessage } from "./x2/sdk";
import type { X2UiState } from "./types";

// Projects model `state_update` snapshots into X2UiState. Returns the
// previous object when nothing changed so React can bail out of re-rendering
// the whole tree on the model's frequent identical echoes.
//
// referenceAccepted is the one field the snapshot doesn't carry (it comes
// from the discrete reference_image_accepted ack), so it passes through
// unchanged — except when the snapshot reports no reference, which drops the
// stale dimensions.
export function reduce(state: X2UiState, msg: X2StateUpdateMessage): X2UiState {
  const next: X2UiState = {
    generating: msg.generating,
    // prompt / width / height are typed `unknown` on the wire (free-form);
    // the model only ever sends a string / number or null.
    activePrompt: (msg.prompt as string | null) ?? null,
    outputWidth: (msg.width as number | null) ?? null,
    outputHeight: (msg.height as number | null) ?? null,
    hasReference: msg.has_reference_image,
    keepBacklog: msg.keep_backlog,
    pointerX: msg.pointer_x,
    pointerY: msg.pointer_y,
    pointerActive: msg.pointer_active,
    referenceAccepted: msg.has_reference_image ? state.referenceAccepted : null,
  };
  const changed = (Object.keys(next) as (keyof X2UiState)[]).some(
    (k) => next[k] !== state[k],
  );
  return changed ? next : state;
}
