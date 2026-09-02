"""The show streamer. See ../README.md for the full picture.

Wiring, in dependency order:

  room chat (LiveKit data channel) ──▶ Director ──▶ Upsampler (BYOK LLM)
        default.json (rotation) ────────↗
              │ enqueue: episodes, chained scene-to-scene, tagged in metadata
              ▼
        ReactorLink ◀──▶ fast-h3 (clip queue, autoplay on)
              │ 24 fps video + 48 kHz mono audio
              ▼
            Pacer ──▶ LiveKitPublisher ──▶ the show's room (viewers)

Everything is one asyncio process. The pacer and the publisher are created
after the first `state_update` (that is where the deployment's canvas size
comes from) and then live until shutdown, across any number of Reactor
reconnects — the room-side broadcast never restarts. The streamer waits for
nothing else: default scenes keep it on air from the first render.

Usage:
    cp .env.example .env      # keys, room, episode shape
    python main.py
"""

from __future__ import annotations

import asyncio
import logging
import warnings

from config import Config, default_scenes
from director import Director
from pacer import Pacer
from publisher import AudioFormat, LiveKitPublisher, VideoFormat
from reactor_link import MODEL_FPS, MODEL_SAMPLE_RATE, ReactorLink
from upsampler import Upsampler

logger = logging.getLogger("streamer")


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )
    # WebRTC internals are chatty at INFO and alarming at their defaults.
    logging.getLogger("aiortc.codecs.vpx").setLevel(logging.ERROR)
    logging.getLogger("aiortc.codecs.h264").setLevel(logging.ERROR)
    logging.getLogger("aioice.ice").setLevel(logging.WARNING)
    warnings.filterwarnings("ignore", category=DeprecationWarning)


async def main() -> None:
    setup_logging()
    config = Config.load()

    link = ReactorLink(config)
    publisher = LiveKitPublisher(
        room_name=config.livekit_room,
        livekit_url=config.livekit_url,
        api_key=config.livekit_api_key,
        api_secret=config.livekit_api_secret,
    )
    upsampler = Upsampler(
        api_key=config.openai_api_key,
        model=config.openai_model,
        style=config.show_style,
        scenes_per_episode=config.scenes_per_episode,
        base_url=config.openai_base_url,
    )
    if not upsampler.enabled:
        logger.warning(
            "no OPENAI_API_KEY set — chat ideas become single raw-text scenes "
            "instead of %d-scene episodes", config.scenes_per_episode,
        )
    director = Director(
        link,
        publisher,
        upsampler,
        default_scenes=default_scenes(),
        scene_seconds=config.scene_seconds,
        queue_target=config.queue_target,
    )

    tasks = [
        asyncio.create_task(link.run(), name="reactor-link"),
        asyncio.create_task(director.run_ideas(), name="ideas"),
        asyncio.create_task(director.run_defaults(), name="defaults"),
    ]

    try:
        # The room's video geometry comes from the deployment (state_update),
        # so the pacer starts only once the first session is up. From then on
        # it and the publisher survive every reconnect.
        await link.wait_first_state()
        width, height = link.canvas
        pacer = Pacer(
            publisher,
            VideoFormat(width=width, height=height, fps=MODEL_FPS),
            AudioFormat(sample_rate=MODEL_SAMPLE_RATE, channels=1),
        )
        link.attach_pacer(pacer)
        tasks.append(asyncio.create_task(pacer.run(), name="pacer"))
        logger.info(
            "streaming %dx%d@%dfps to room %r — %d scene(s) per episode, "
            "%.1fs per scene, upsampler %s",
            width, height, MODEL_FPS, config.livekit_room,
            config.scenes_per_episode, config.scene_seconds,
            "on" if upsampler.enabled else "off (raw ideas)",
        )

        # Run until a task dies (none should) or the process is interrupted.
        done, _pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            if task.exception() is not None:
                logger.error("task %s died: %s", task.get_name(), task.exception())
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await publisher.stop()
        logger.info("shut down cleanly")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
