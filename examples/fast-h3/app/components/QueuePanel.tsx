"use client";

import { useEffect, useState } from "react";
import {
  useFastH3,
  useFastH3QueueUpdate,
  useFastH3StateUpdate,
  type FastH3QueueUpdateMessage,
  type FastH3StateUpdateMessage,
} from "@reactor-models/fast-h3";
import { parseTag } from "../lib/tag";

// Both queues, live from `queue_update`: the generation queue (scenes
// waiting to build) and the playout queue (built, ready to play). Each row
// can be popped; a build already running for a popped clip is discarded
// when it completes. The capacities come from `state_update` — the
// deployment publishes them live, never assume the defaults.
export function QueuePanel() {
  const { status, pop } = useFastH3();
  const [queues, setQueues] = useState<FastH3QueueUpdateMessage | null>(null);
  const [snapshot, setSnapshot] = useState<FastH3StateUpdateMessage | null>(
    null,
  );
  useFastH3QueueUpdate((msg) => setQueues(msg));
  useFastH3StateUpdate((msg) => setSnapshot(msg));

  useEffect(() => {
    if (status !== "ready") {
      setQueues(null);
      setSnapshot(null);
    }
  }, [status]);

  if (status !== "ready" || !queues || !snapshot) return null;
  const empty = queues.generation.length === 0 && queues.playout.length === 0;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Queue{" "}
        <span className="font-mono normal-case">
          {snapshot.generation_queued}/{snapshot.generation_capacity} building ·{" "}
          {snapshot.playout_queued}/{snapshot.playout_capacity} ready
        </span>
      </h2>
      {empty && (
        <p className="mt-1.5 text-xs text-zinc-600">
          Nothing queued — compose an episode above.
        </p>
      )}
      <ul className="mt-1.5 space-y-1">
        {[...queues.playout, ...queues.generation].map((clip) => {
          const tag = parseTag(clip.metadata);
          return (
            <li key={clip.clip_id} className="flex items-center gap-2 text-xs">
              <span
                className={`shrink-0 rounded px-1 font-mono text-[10px] ${
                  clip.ready
                    ? "bg-active/20 text-active"
                    : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {clip.ready ? "ready" : "building"}
              </span>
              <span className="min-w-0 flex-1 truncate text-zinc-300">
                {tag
                  ? `${tag.title} · scene ${tag.scene}/${tag.scenes}`
                  : clip.prompt.slice(0, 48)}
                {clip.continue_from_clip_id && (
                  <span className="text-zinc-600"> ⟿ chained</span>
                )}
              </span>
              <button
                onClick={() => void pop({ clip_id: clip.clip_id })}
                className="shrink-0 text-zinc-600 hover:text-red-400"
                title="Remove from the queue"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
