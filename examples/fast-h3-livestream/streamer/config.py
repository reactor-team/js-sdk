"""Configuration for the show streamer.

Everything comes from the environment (a `.env` file next to this module is
loaded when present). `Config.load` is the only reader; the rest of the
streamer takes a `Config` and never touches `os.environ`.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# Matches the default.json rotation, so upsampled episodes and default
# scenes read as one show. Override with SHOW_STYLE.
DEFAULT_STYLE = (
    "Flat 2D cel-animated cartoon, thick black outlines, rounded characters "
    "with big expressive eyes, saturated colors, clean staged compositions, "
    "playful orchestral score."
)


def default_scenes() -> list[str]:
    """The default scene prompts (`default.json` next to this module).

    These keep the show on air while no viewer ideas are waiting. Each entry
    is one complete, self-contained scene prompt.
    """
    path = Path(__file__).parent / "default.json"
    scenes = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(scenes, list) or not all(isinstance(s, str) for s in scenes):
        raise SystemExit("default.json must be a JSON array of scene prompts")
    return [s.strip() for s in scenes if s.strip()]


@dataclass(frozen=True)
class Config:
    """One immutable snapshot of everything the streamer is configured with."""

    # Reactor
    reactor_api_key: str
    reactor_model: str

    # LiveKit (the room the show is broadcast into)
    livekit_url: str
    livekit_api_key: str
    livekit_api_secret: str
    livekit_room: str

    # Episode writing (BYOK; optional — without a key, a viewer idea becomes
    # a single scene of its raw text instead of an upsampled episode)
    openai_api_key: str | None
    openai_base_url: str | None
    openai_model: str
    show_style: str

    # Episode shape: fixed by the operator, never decided by the LLM.
    scenes_per_episode: int
    scene_seconds: float

    # How many scenes the streamer keeps queued from default.json while no
    # viewer ideas are waiting.
    queue_target: int

    @staticmethod
    def load() -> "Config":
        """Read `.env` + environment and validate."""
        load_dotenv(Path(__file__).parent / ".env")

        config = Config(
            reactor_api_key=os.environ.get("REACTOR_API_KEY", ""),
            reactor_model=os.environ.get("REACTOR_MODEL", "reactor/fast-h3"),
            livekit_url=os.environ.get("LIVEKIT_URL", ""),
            livekit_api_key=os.environ.get("LIVEKIT_API_KEY", ""),
            livekit_api_secret=os.environ.get("LIVEKIT_API_SECRET", ""),
            livekit_room=os.environ.get("LIVEKIT_ROOM", "fast-h3-livestream"),
            openai_api_key=os.environ.get("OPENAI_API_KEY") or None,
            openai_base_url=os.environ.get("OPENAI_BASE_URL") or None,
            openai_model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
            show_style=os.environ.get("SHOW_STYLE", "").strip() or DEFAULT_STYLE,
            scenes_per_episode=max(1, int(os.environ.get("SCENES_PER_EPISODE", "3"))),
            scene_seconds=float(os.environ.get("SCENE_SECONDS", "10")),
            queue_target=max(1, int(os.environ.get("QUEUE_TARGET", "4"))),
        )
        if not config.reactor_api_key:
            raise SystemExit("REACTOR_API_KEY is required (rk_... from the dashboard).")
        if not config.livekit_url:
            raise SystemExit("LIVEKIT_URL is required (wss://... from your LiveKit project).")
        if not config.livekit_api_key or not config.livekit_api_secret:
            raise SystemExit("LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required.")
        return config
