"""The director: viewer ideas in, scenes on the model's queue, chat answered.

One chat message becomes one **episode**: the upsampler expands it into the
configured number of scenes (or a single raw-text scene without an OpenAI
key), and the director enqueues them contiguously — chained with
`continue_from_clip_id` when the deployment supports it, so the episode airs
as one uninterrupted video. While no ideas are waiting, a rotation of
default scenes (`default.json`) keeps the show on air.

The rules that keep it coherent:

  * The director is the queue's only writer. The idea worker and the
    default rotation serialize enqueues through one lock, so an episode's
    scenes never interleave with anything else.
  * An episode is only enqueued when all of its scenes fit the generation
    queue. Waiting default scenes are popped to make room; when there is
    still no room (a capacity issue on the deployment), the idea is dropped
    and the viewer is told in chat — never a silent failure.
  * Viewer episodes insert ahead of waiting default scenes (`enqueue`'s
    `position`), so the model builds them next; among themselves, ideas
    stay first-come-first-served.
  * Every scene carries the episode's identity in the clip's `metadata` —
    an opaque string the model echoes back untouched on every message that
    references the clip. That echo is how the director narrates playback
    and recognizes its own default scenes, with no local joins to lose.
  * A chained enqueue refused twice (a reconnect loses the source clip
    server-side) degrades to a standalone scene rather than stalling — the
    scene prompts are self-contained cuts, so only the seamless handover is
    lost, never the episode.
"""

from __future__ import annotations

import asyncio
import json
import logging

from publisher import LiveKitPublisher
from reactor_link import ReactorLink
from upsampler import Episode, Upsampler, sanitize

logger = logging.getLogger(__name__)

# Ideas waiting to be written and enqueued; beyond this, new ones are
# refused in chat rather than silently queued for minutes.
_PENDING_LIMIT = 8

# Enqueue retry cadence while the model refuses (reconnect mid-command, ...).
_RETRY_DELAY_S = 3.0

# How often the default rotation re-checks whether the queue wants topping up.
_IDLE_POLL_S = 3.0


class Director:
    """Consume chat ideas; keep the model's queue fed with scenes."""

    def __init__(
        self,
        link: ReactorLink,
        publisher: LiveKitPublisher,
        upsampler: Upsampler,
        default_scenes: list[str],
        scene_seconds: float,
        queue_target: int,
    ) -> None:
        self._link = link
        self._publisher = publisher
        self._upsampler = upsampler
        self._default_scenes = default_scenes
        self._scene_seconds = scene_seconds
        self._queue_target = queue_target
        self._default_index = 0
        self._pending: asyncio.Queue[tuple[str, str]] = asyncio.Queue(_PENDING_LIMIT)
        self._enqueue_lock = asyncio.Lock()
        link.add_listener(self._on_model_message)
        publisher.on_chat(self.submit_idea)

    # -------------------------------------------------------- chat intake

    def submit_idea(self, author: str, text: str) -> None:
        """Accept one chat message as an episode idea (chat handler)."""
        try:
            self._pending.put_nowait((author, text))
        except asyncio.QueueFull:
            logger.warning("[director] idea backlog full; refusing %s's idea", author)
            self._publisher.send_chat(
                f"@{author} the idea backlog is full right now — "
                "try again in a couple of minutes."
            )
            return
        logger.info("[director] accepted idea from %s: %s", author, text)

    # -------------------------------------------------------- idea worker

    async def run_ideas(self) -> None:
        """Write and enqueue pending ideas, one episode at a time."""
        while True:
            author, text = await self._pending.get()
            try:
                episode = await self._upsampler.write(text, author)
                await self._enqueue_episode(episode)
            except asyncio.CancelledError:
                raise
            except Exception as error:
                logger.error("[director] failed to stage %s's idea: %s", author, error)
                self._publisher.send_chat(
                    f"@{author} something went wrong staging that idea — try again."
                )

    # ---------------------------------------------------- default rotation

    async def run_defaults(self) -> None:
        """Keep the queue topped up with default scenes while chat is quiet."""
        if not self._default_scenes:
            logger.warning("[director] default.json is empty; the show idles without ideas")
            return
        while True:
            await asyncio.sleep(_IDLE_POLL_S)
            # The configured target self-clamps under the deployment's live
            # playout capacity: default scenes must never fill the playout
            # queue to the brim, because a full playout queue pauses builds —
            # the headroom is where the next episode's scenes land.
            target = min(self._queue_target, max(1, self._link.playout_capacity - 1))
            if (
                not self._pending.empty()
                or not self._link.connected
                or self._link.generation_queued + self._link.playout_queued >= target
            ):
                continue
            prompt = self._default_scenes[self._default_index % len(self._default_scenes)]
            self._default_index += 1
            metadata = json.dumps(
                {"title": prompt[:60], "author": "show", "scene": 1, "scenes": 1,
                 "default": True},
                ensure_ascii=False,
            )
            async with self._enqueue_lock:
                await self._link.send_command(
                    "enqueue",
                    {
                        "prompt": sanitize(prompt),
                        "metadata": metadata,
                        "seconds": self._clamped_seconds(),
                    },
                )

    # ---------------------------------------------------------- enqueueing

    def _clamped_seconds(self) -> float:
        """The configured scene length, clamped to the deployment's live bounds."""
        return max(self._link.min_seconds, min(self._link.max_seconds, self._scene_seconds))

    def _insert_position(self) -> int | None:
        """Where an episode enters the generation queue: ahead of defaults.

        The index of the first waiting default scene — episodes land behind
        every episode scene already waiting (first-come-first-served) and
        ahead of the default rotation, which just slides back. None when no
        default waits: plain append is already the right spot.
        """
        for index, clip in enumerate(self._link.generation_clips):
            if _is_default(clip):
                return index
        return None

    async def _make_room(self, needed: int) -> int:
        """Pop waiting default scenes until `needed` slots are free.

        Only clips tagged `default: true` are ever popped — a viewer's
        episode is never sacrificed for another. Returns the free slots
        after eviction.
        """
        free = self._link.generation_capacity - self._link.generation_queued
        for clip in reversed(self._link.generation_clips):
            if free >= needed:
                break
            if not _is_default(clip):
                continue
            reply = await self._link.send_command("pop", {"clip_id": clip["clip_id"]})
            if isinstance(reply, dict) and "clip" in reply:
                free += 1
                logger.info(
                    "[director] popped waiting default scene %s for an episode",
                    clip["clip_id"][:8],
                )
        return free

    async def _enqueue_episode(self, episode: Episode) -> None:
        """Put one episode on the model's queue, or drop it and say why."""
        scene_count = len(episode.scenes)
        async with self._enqueue_lock:
            free = await self._make_room(scene_count)
            if free < scene_count:
                # A genuine capacity limit: the deployment's generation
                # queue is full of episode scenes. Tell the viewer instead
                # of stalling every later idea behind a wait.
                logger.warning(
                    "[director] no room for %s (%d scenes, %d free); dropping",
                    episode.episode_id, scene_count, free,
                )
                self._publisher.send_chat(
                    f"@{episode.author} the show's queue is at capacity — "
                    f"'{episode.title}' was dropped. Try again in a few minutes."
                )
                return

            position = self._insert_position()
            chain = self._link.supports_continuation
            previous_clip_id: str | None = None
            for index, prompt in enumerate(episode.scenes, start=1):
                metadata = json.dumps(
                    {
                        "episode_id": episode.episode_id,
                        "title": episode.title[:120],
                        "scene": index,
                        "scenes": scene_count,
                        "author": episode.author[:32],
                        "default": False,
                    },
                    ensure_ascii=False,
                )
                payload = {
                    "prompt": prompt,
                    "metadata": metadata,
                    "seconds": self._clamped_seconds(),
                }
                if position is not None:
                    # Consecutive positions keep the episode contiguous and
                    # in scene order, ahead of the defaults it displaced.
                    payload["position"] = position + index - 1
                if chain and previous_clip_id is not None:
                    # The scene opens on the previous scene's last frame and
                    # autoplay hands the pair over with no cut to black. The
                    # prompt itself opens on a hard cut (the upsampler's
                    # rules), which is what keeps the chain sharp.
                    payload["continue_from_clip_id"] = previous_clip_id
                clip_id = await self._enqueue_scene(episode, index, payload)
                if clip_id is None:
                    self._publisher.send_chat(
                        f"@{episode.author} the queue refused scene {index} of "
                        f"'{episode.title}' — the rest of the episode was dropped."
                    )
                    return
                previous_clip_id = clip_id

        self._publisher.send_chat(
            f"@{episode.author} '{episode.title}' is queued "
            f"({scene_count} scene{'s' if scene_count != 1 else ''}) — "
            "it plays as soon as it renders."
        )

    async def _enqueue_scene(
        self, episode: Episode, index: int, payload: dict
    ) -> str | None:
        """Enqueue one scene with bounded retries; returns its clip id.

        A bodyless reply means the model refused the command (the link
        logged the broadcast `command_error`) or the session dropped
        mid-command. A refused *chained* enqueue drops the continuation
        after two strikes and retries standalone; a third refusal gives up
        so one bad scene cannot wedge the idea worker.
        """
        refusals = 0
        while refusals < 3:
            reply = await self._link.send_command("enqueue", payload)
            if isinstance(reply, dict) and "clip" in reply:
                clip = reply["clip"]
                logger.info(
                    "[director] queued %s scene %d/%d as %s (%.1fs)%s",
                    episode.episode_id, index, len(episode.scenes),
                    clip["clip_id"][:8], clip["seconds"],
                    f" ← {payload['continue_from_clip_id'][:8]}"
                    if payload.get("continue_from_clip_id") else "",
                )
                return clip["clip_id"]
            refusals += 1
            if refusals == 2 and "continue_from_clip_id" in payload:
                del payload["continue_from_clip_id"]
                logger.warning(
                    "[director] %s scene %d: dropping the continuation after "
                    "2 refusals; retrying as a standalone cut",
                    episode.episode_id, index,
                )
            await asyncio.sleep(_RETRY_DELAY_S)
        return None

    # ----------------------------------------------------- announcements

    def _on_model_message(self, kind: str, data: dict) -> None:
        """Narrate playback into the log and the room chat (metadata echo)."""
        clip = data.get("clip") if isinstance(data, dict) else None
        if not isinstance(clip, dict):
            return
        tag = _parse_tag(clip)
        if tag is None:
            return
        label = f"'{tag['title']}' scene {tag['scene']}/{tag['scenes']}"
        if kind == "clip_started":
            logger.info("[now playing] %s (by %s)", label, tag["author"])
            if not tag.get("default") and tag.get("scene") == 1:
                self._publisher.send_chat(
                    f"Now playing: '{tag['title']}' — requested by {tag['author']}"
                )
        elif kind == "clip_failed":
            logger.error(
                "[director] render failed for %s: %s — the queue moves on",
                label, data.get("reason"),
            )
            if not tag.get("default"):
                self._publisher.send_chat(
                    f"@{tag['author']} scene {tag['scene']} of '{tag['title']}' "
                    "failed to render — the show moves on."
                )


def _parse_tag(clip: dict) -> dict | None:
    """Read this streamer's metadata tag back off a clip's echo."""
    try:
        tag = json.loads(clip.get("metadata") or "")
    except (TypeError, ValueError):
        return None
    if not isinstance(tag, dict) or "title" not in tag:
        return None
    return tag


def _is_default(clip: dict) -> bool:
    """Whether a queued clip is a default-rotation scene (metadata echo)."""
    tag = _parse_tag(clip)
    return bool(tag and tag.get("default"))
