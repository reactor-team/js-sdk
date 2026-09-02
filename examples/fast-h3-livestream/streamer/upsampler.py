"""Episode writing: turn a viewer's idea into scenes the model renders well.

One LLM call per idea, against any OpenAI-compatible endpoint (bring your
own key; `OPENAI_BASE_URL` points it at a proxy, a local server, or any
compatible provider). The episode shape is the operator's, not the LLM's:
the call asks for **exactly `scenes_per_episode` scenes**, and every scene
runs the fixed `scene_seconds` from the environment.

Why the system prompt is written the way it is — these rules come from how
fast-h3 actually behaves, so keep them intact when editing:

  * **The model reads only the scene's own text.** Each scene prompt must
    re-describe the entire setting, subjects, light, and style from
    scratch; anything the text omits vanishes or mutates between scenes.
  * **Every scene after the first must open on a hard cut, and the cut
    must be described.** The streamer chains an episode's scenes on the
    model: each scene's clip opens on the previous clip's final frame. A
    chain written as one continuous take degrades visibly — each clip
    re-generates from a generated frame, small errors compound scene over
    scene, and the picture smears and repeats itself within a few scenes.
    A hard cut to a fully described NEW shot (different camera angle,
    distance, or location) re-establishes the whole image, so the chain
    stays sharp for the entire episode. This rule is load-bearing; never
    soften it.
  * **800 characters is the model's hard cap per prompt**; the LLM is told
    700 to leave headroom, and `sanitize` hard-truncates anyway — at a
    sentence boundary when one fits — because LLMs do not count characters
    reliably.
  * **fast-h3 renders synchronized audio, spoken language included**, so
    the prompt asks for explicit quoted dialogue (who speaks, the exact
    words, the voice's tone) whenever the idea implies speech, and a brief
    soundscape clause per scene.

Without an OpenAI key the writer is offline: a viewer idea becomes a single
scene of its raw text (styled, truncated) — the show keeps moving either
way.
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# fast-h3's enqueue cap, enforced server-side; sanitize truncates to it.
MAX_PROMPT_CHARS = 800
# What the LLM is asked to stay under, leaving headroom for its counting.
_TARGET_PROMPT_CHARS = 700
# LLM attempts per idea before the raw-text fallback.
_MAX_ATTEMPTS = 3

_SYSTEM_PROMPT = """\
You are the head writer of a live AI video show. Viewers send short, rough
ideas; you turn each one into one episode of exactly {scene_count} scenes
for a model that generates short video clips with synchronized audio.

SHOW STYLE — every scene is rendered in this identity; weave it into every
scene prompt, never contradict it:
{style}

HOW THE VIDEO MODEL WORKS (hard constraints):
- Each scene becomes ONE clip, and the model reads ONLY that scene's text —
  it never sees the other scene prompts. Every scene prompt must be fully
  self-contained and re-describe the entire setting, subjects, lighting,
  palette, mood, and style — even when nothing changed from the previous
  scene. Anything you omit will vanish or mutate between scenes.
- The episode's scenes are rendered as ONE continuous video: each scene
  begins on the exact final frame of the scene before it. Because of that,
  EVERY SCENE AFTER THE FIRST MUST OPEN ON A HARD CUT — a new shot with a
  clearly different camera angle, distance, or location — and its prompt
  must describe that new shot in full, as if the camera were set up fresh.
  Open the prompt with the cut itself, e.g. "Hard cut to a wide shot of
  ...", "Cut to: inside the lighthouse, a close-up of ...".
- NEVER write a scene that extends the previous scene's shot. No "the
  camera continues", "still on her face", "the shot lingers", "we keep
  following" — holding one take across scenes makes the picture smear,
  repeat, and degrade scene over scene, while a clean cut keeps every
  scene sharp. Cuts are also film language: use them for rhythm.
- Even across cuts the episode stays one story: re-describe the same
  setting and subjects verbatim enough that they read as the same place
  and cast, and change only what the story moves.
- Each scene prompt must be under {target_chars} characters. This is a hard
  limit; prefer cutting adjectives over cutting subjects or setting.
- The model renders picture AND sound, including clear spoken language.
  When the idea involves someone speaking, write the dialogue out
  explicitly and unambiguously — name who speaks and give the exact words
  in quotes — and describe the voice's tone.
- End each scene prompt with one short clause of soundscape (ambience,
  music mood, or effects) alongside any dialogue.
- Describe only what the camera sees and the microphone hears: no text
  overlays, no UI, no scene numbers, no camera jargon the model cannot show.

STRUCTURE:
- Exactly {scene_count} scene(s), reading as one episode with a setup, a
  development, and a payoff. Keep the viewer's idea recognizable — enhance
  it, do not replace it.

Reply with ONLY this JSON, nothing else:
{{"title": "short display title for the episode",
  "scenes": [{{"prompt": "self-contained scene description..."}}]}}
The "scenes" array is REQUIRED and must hold exactly {scene_count} entries.
"""


@dataclass(frozen=True)
class Episode:
    """One idea expanded into scenes, enqueued and played in order."""

    episode_id: str
    title: str
    author: str
    scenes: list[str]  # scene prompts, ready for the model verbatim


class Upsampler:
    """Expand viewer ideas into episodes; degrade to raw text without a key."""

    def __init__(
        self,
        api_key: str | None,
        model: str,
        style: str,
        scenes_per_episode: int,
        base_url: str | None = None,
    ) -> None:
        self._client = None
        if api_key:
            from openai import AsyncOpenAI

            self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self._model = model
        self._style = style
        self._scene_count = scenes_per_episode

    @property
    def enabled(self) -> bool:
        """Whether an LLM is available (an OpenAI key was configured)."""
        return self._client is not None

    async def write(self, idea: str, author: str) -> Episode:
        """One idea in, one episode out. Never raises.

        With no key configured — or after every LLM attempt fails — the
        idea becomes a single scene of its raw text plus the show style, so
        the show keeps moving.
        """
        episode_id = uuid.uuid4().hex[:12]
        if self._client is not None:
            for attempt in range(1, _MAX_ATTEMPTS + 1):
                try:
                    title, scenes = await self._attempt(
                        idea, request_tag=f"{episode_id}.{attempt}"
                    )
                    return Episode(episode_id, title, author, scenes)
                except Exception as error:
                    logger.warning(
                        "[upsampler] unusable reply, attempt %d/%d for %.60r: %s",
                        attempt, _MAX_ATTEMPTS, idea, error,
                    )
            logger.warning("[upsampler] all attempts unusable; using the raw idea")
        # The viewer's idea gets the character budget first; the style fills
        # whatever remains.
        text = sanitize(idea)
        style_room = MAX_PROMPT_CHARS - len(text) - 2
        prompt = f"{text}. {self._style[:style_room]}" if style_room > 20 else text
        return Episode(episode_id, idea[:60], author, [sanitize(prompt)])

    async def _attempt(self, idea: str, request_tag: str) -> tuple[str, list[str]]:
        """One LLM call, parsed and validated; raises on an unusable reply.

        The request tag makes every attempt a distinct request — gateways
        cache identical ones, so a bare retry of a failed prompt would get
        the same failed reply back in milliseconds.
        """
        assert self._client is not None
        system = _SYSTEM_PROMPT.format(
            style=self._style,
            scene_count=self._scene_count,
            target_chars=_TARGET_PROMPT_CHARS,
        )
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": f"Viewer idea: {idea}\n\n[request {request_tag}]"},
            ],
            temperature=0.8,
            max_tokens=1800,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content or ""
        data = json.loads(content or "{}")
        title = str(data.get("title") or idea[:60]).strip()
        raw_scenes = data.get("scenes")
        if isinstance(raw_scenes, dict):
            raw_scenes = [raw_scenes]
        scenes = [
            sanitize(str(raw.get("prompt", "")))
            for raw in (raw_scenes or [])[: self._scene_count]
            if isinstance(raw, dict) and str(raw.get("prompt", "")).strip()
        ]
        if not scenes:
            raise ValueError(f"no usable scenes in the reply (head={content[:200]!r})")
        return title, scenes


def sanitize(prompt: str) -> str:
    """Collapse whitespace and fit under the model's prompt cap, ending clean.

    LLMs overshoot the character target they are given, and a blind cut at
    the cap ends the prompt mid-word. Over-long prompts are cut at the last
    sentence boundary that fits; the mid-word cut remains only as the last
    resort for a prompt written as one giant sentence.
    """
    collapsed = " ".join(prompt.split())
    if len(collapsed) <= MAX_PROMPT_CHARS:
        return collapsed.strip()
    head = collapsed[:MAX_PROMPT_CHARS]
    boundary = max(head.rfind(". "), head.rfind("! "), head.rfind("? "))
    if boundary > MAX_PROMPT_CHARS // 2:
        return head[: boundary + 1].strip()
    return head.strip()
