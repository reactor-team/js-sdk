"use client";

import { useEffect, useState } from "react";
import {
  useFastH3,
  useFastH3StateUpdate,
  type FastH3StateUpdateMessage,
} from "@reactor-models/fast-h3";
import {
  DEFAULT_SCENES,
  EPISODE_IDEAS,
  EXAMPLE_EPISODE,
  MAX_SCENES,
} from "../lib/prompts";
import { makeTag } from "../lib/tag";

// The episode composer — this example's signature flow.
//
// An episode is 1-6 scenes queued as ONE continuous video: each scene is
// enqueued with `continue_from_clip_id` naming the previous scene's clip,
// so its clip opens on that clip's final frame and autoplay hands the pair
// over with no cut to black.
//
// Scene text comes from either path:
//   - "Write scenes with AI": POST /api/upsample (your own OpenAI-compatible
//     key, server-side). The route's system prompt enforces the rules below.
//   - By hand, when no key is configured (or whenever you prefer): the
//     composer scaffolds one editor per scene and carries the rules as
//     guidance.
//
// The two rules that keep a chained episode sharp — soften either and the
// picture degrades scene over scene:
//   1. every scene is fully self-contained (the model reads only that
//      scene's text);
//   2. every scene after the first OPENS ON A HARD CUT to a new, fully
//      described shot. Never extend the previous take.
//
// Connection is deliberately lazy: nothing connects until you queue —
// compose and edit fully offline, then "Queue episode" connects on demand.
const MAX_PROMPT_CHARS = 800;

export function EpisodeComposer() {
  const { status, connect, enqueue, setAutoplay, getState } = useFastH3();
  const [snapshot, setSnapshot] = useState<FastH3StateUpdateMessage | null>(
    null,
  );
  useFastH3StateUpdate((msg) => setSnapshot(msg));
  useEffect(() => {
    if (status !== "ready") setSnapshot(null);
  }, [status]);

  const [writerEnabled, setWriterEnabled] = useState(false);
  const [idea, setIdea] = useState("");
  const [sceneCount, setSceneCount] = useState(DEFAULT_SCENES);
  const [title, setTitle] = useState("");
  const [scenes, setScenes] = useState<string[]>([]);
  const [busy, setBusy] = useState<"writing" | "queueing" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Whether /api/upsample has a key behind it decides which compose path
    // the UI leads with.
    fetch("/api/upsample", { cache: "no-store" })
      .then((r) => r.json())
      .then((body: { enabled?: boolean }) =>
        setWriterEnabled(Boolean(body.enabled)),
      )
      .catch(() => setWriterEnabled(false));
  }, []);

  async function writeWithAi() {
    setBusy("writing");
    setError(null);
    try {
      const response = await fetch("/api/upsample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, sceneCount }),
      });
      const body = (await response.json()) as {
        title?: string;
        scenes?: string[];
        error?: string;
      };
      if (!response.ok || !body.scenes) {
        throw new Error(
          body.error ?? `The writer returned ${response.status}.`,
        );
      }
      setTitle(body.title ?? idea.slice(0, 60));
      setScenes(body.scenes);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function writeByHand() {
    setError(null);
    setTitle(idea.slice(0, 60) || "Untitled episode");
    setScenes(Array.from({ length: sceneCount }, () => ""));
  }

  function loadExample() {
    setError(null);
    setIdea("");
    setTitle(EXAMPLE_EPISODE.title);
    setSceneCount(EXAMPLE_EPISODE.scenes.length);
    setScenes([...EXAMPLE_EPISODE.scenes]);
  }

  async function queueEpisode() {
    setBusy("queueing");
    setError(null);
    try {
      // Lazy connect: the episode was composed offline; the session starts
      // only now that there is something to build.
      if (status !== "ready") await connect();

      // Capacity gate, against a FRESH snapshot: the generation queue
      // refuses `enqueue` when full, and a partly queued episode is worse
      // than a clear refusal up front.
      const state = await getState();
      if (state) {
        const free = state.generation_capacity - state.generation_queued;
        if (free < scenes.length) {
          throw new Error(
            `The generation queue has ${free} free slot(s) but the episode ` +
              `needs ${scenes.length}. Wait for builds to finish, pop queued ` +
              `clips, or queue a shorter episode.`,
          );
        }
        // Autoplay makes the playout queue self-starting, and it is what
        // performs the seamless chained handover between an episode's scenes.
        if (!state.autoplay) await setAutoplay({ enabled: true });
      }

      const episode = crypto.randomUUID().slice(0, 12);
      let previousClipId: string | undefined;
      for (const [index, prompt] of scenes.entries()) {
        const reply = await enqueue({
          prompt,
          metadata: makeTag({
            episode,
            title,
            scene: index + 1,
            scenes: scenes.length,
          }),
          // Scene 1 opens from text; every later scene opens on the
          // previous scene's final frame. The scene prompts open on hard
          // cuts, which is what keeps the chain from degrading.
          ...(previousClipId ? { continue_from_clip_id: previousClipId } : {}),
        });
        if (!reply) {
          // Refused — command_error above carries the model's reason.
          throw new Error(
            `Scene ${index + 1} was refused; the episode stops here. ` +
              `Scenes already queued will still play.`,
          );
        }
        previousClipId = reply.clip.clip_id;
      }
      setIdea("");
      setTitle("");
      setScenes([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const composed = scenes.length > 0;
  const allScenesWritten =
    composed && scenes.every((scene) => scene.trim().length > 0);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Compose an episode
      </h2>

      {!composed && (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EPISODE_IDEAS.map((preset) => (
              <button
                key={preset.title}
                onClick={() => setIdea(preset.idea)}
                className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              >
                {preset.title}
              </button>
            ))}
          </div>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="One rough idea — e.g. a lighthouse keeper befriends a whale…"
            rows={2}
            className="mt-2 w-full resize-none rounded-md border border-zinc-800 bg-zinc-950 p-2 text-sm outline-none focus:border-zinc-600"
          />
          <div className="mt-2 flex items-center gap-2">
            <label className="text-xs text-zinc-500">Scenes</label>
            <select
              value={sceneCount}
              onChange={(e) => setSceneCount(Number(e.target.value))}
              className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs"
            >
              {Array.from({ length: MAX_SCENES }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {writerEnabled && (
              <button
                onClick={() => void writeWithAi()}
                disabled={!idea.trim() || busy !== null}
                className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-brand-fg disabled:opacity-40"
              >
                {busy === "writing" ? "Writing…" : "Write scenes with AI"}
              </button>
            )}
            <button
              onClick={writeByHand}
              disabled={busy !== null}
              className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 disabled:opacity-40"
            >
              Write by hand
            </button>
          </div>
          <button
            onClick={loadExample}
            className="mt-2 text-[11px] text-zinc-600 underline hover:text-zinc-400"
          >
            or load the example episode
          </button>
          {!writerEnabled && (
            <p className="mt-2 text-[11px] leading-4 text-zinc-600">
              No <span className="font-mono">OPENAI_API_KEY</span> configured,
              so scenes are written by hand. Set one in{" "}
              <span className="font-mono">.env.local</span> to enable the AI
              writer.
            </p>
          )}
        </>
      )}

      {composed && (
        <>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Episode title"
            className="mt-2 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-zinc-600"
          />
          <p className="mt-2 text-[11px] leading-4 text-zinc-500">
            Scenes play as <b>one continuous video</b>: each clip opens on the
            previous clip's last frame. Keep every scene self-contained, and
            open every scene after the first on a <b>hard cut</b> to a new,
            fully described shot ("Hard cut to a wide shot of …") — extending
            one take across scenes degrades the picture.
          </p>
          {scenes.map((scene, index) => (
            <div key={index} className="mt-2">
              <div className="flex items-baseline justify-between">
                <label className="text-[11px] text-zinc-500">
                  Scene {index + 1}
                  {index > 0 && " — opens on a hard cut"}
                </label>
                <span
                  className={`font-mono text-[10px] ${
                    scene.length > MAX_PROMPT_CHARS
                      ? "text-red-400"
                      : "text-zinc-600"
                  }`}
                >
                  {scene.length}/{MAX_PROMPT_CHARS}
                </span>
              </div>
              <textarea
                value={scene}
                onChange={(e) =>
                  setScenes(
                    scenes.map((s, i) => (i === index ? e.target.value : s)),
                  )
                }
                rows={4}
                placeholder={
                  index === 0
                    ? "Establish everything: style, place, subjects, light, and the sound…"
                    : "Hard cut to a new shot — re-describe the whole scene from the fresh angle…"
                }
                className="mt-0.5 w-full resize-y rounded-md border border-zinc-800 bg-zinc-950 p-2 text-xs leading-5 outline-none focus:border-zinc-600"
              />
            </div>
          ))}
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => void queueEpisode()}
              disabled={!allScenesWritten || busy !== null}
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-fg disabled:opacity-40"
            >
              {busy === "queueing"
                ? "Queueing…"
                : `Queue episode (${scenes.length} scene${scenes.length === 1 ? "" : "s"})`}
            </button>
            <button
              onClick={() => {
                setScenes([]);
                setTitle("");
              }}
              disabled={busy !== null}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 disabled:opacity-40"
            >
              Discard
            </button>
          </div>
          {snapshot && (
            <p className="mt-1.5 text-[11px] text-zinc-600">
              Queue: {snapshot.generation_queued}/{snapshot.generation_capacity}{" "}
              building · {snapshot.playout_queued}/{snapshot.playout_capacity}{" "}
              ready
            </p>
          )}
        </>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
