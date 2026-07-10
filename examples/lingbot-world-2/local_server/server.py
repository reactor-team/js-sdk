"""Local backend for the LingBot World 2 Reactor UI — speaks Reactor's WebRTC
coordinator protocol so the unchanged js-sdk app (with
NEXT_PUBLIC_COORDINATOR_URL=http://localhost:8080) connects to a LOCAL model
instead of the cloud.

Stage 1 (this file, standalone): the protocol shim — the 4 HTTP endpoints
(/tokens, /ice_servers, /sessions, /connections) + an aiortc peer connection
that streams a TEST-PATTERN video and echoes DataChannel commands. Run this
first and point the UI at it: if the UI reaches "ready" and shows the test
pattern, the protocol match is correct and we swap in the real model engine
(engine.py) behind `FrameSource`.

Run:  python server.py --port 8080
Deps: pip install aiohttp aiortc av numpy
"""
import argparse
import asyncio
import fractions
import json
import logging
import time

import numpy as np
from aiohttp import web
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack
from av import VideoFrame

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(message)s")
log = logging.getLogger("local-lw2")

WIDTH, HEIGHT, FPS = 832, 480, 16
_pcs: set[RTCPeerConnection] = set()


class FrameSource:
    """Yields RGB uint8 frames (H,W,3). Stage 1 = animated test pattern.
    With --model: frames from the shared ModelEngine (lingbot-world-v2)."""

    def __init__(self, engine=None):
        self._t0 = time.time()
        self.engine = engine

    def command(self, name: str, payload: dict):
        log.info("command %s %s", name, json.dumps(payload)[:200])
        if not self.engine:
            return
        if name in ("set_prompt", "prompt"):
            self.engine.set_prompt(payload.get("prompt") or payload.get("text", ""))
        elif name in ("set_image", "image"):
            self.engine.set_image(payload.get("path") or payload.get("image", ""))
        elif name == "start":
            self.engine.start()

    def next_frame(self) -> np.ndarray:
        if self.engine is not None:
            f = self.engine.next_frame()
            if f is not None:
                return f
            shade = 30 if not self.engine.ready else 60  # placeholder while loading/generating
            return np.full((HEIGHT, WIDTH, 3), shade, np.uint8)
        t = time.time() - self._t0
        x = np.linspace(0, 1, WIDTH, dtype=np.float32)[None, :]
        y = np.linspace(0, 1, HEIGHT, dtype=np.float32)[:, None]
        r = (0.5 + 0.5 * np.sin(6.28 * (x + t * 0.2))) * 255
        g = (0.5 + 0.5 * np.sin(6.28 * (y + t * 0.15))) * 255
        b = np.full((HEIGHT, WIDTH), (0.5 + 0.5 * np.sin(t)) * 255, np.float32)
        return np.stack([r + 0 * y, g + 0 * x, b], -1).astype(np.uint8)


class ModelVideoTrack(VideoStreamTrack):
    """Wraps a FrameSource as a WebRTC 'main_video' sendonly track."""

    kind = "video"

    def __init__(self, source: FrameSource):
        super().__init__()
        self.source = source

    async def recv(self):
        pts, time_base = await self.next_timestamp()
        await asyncio.sleep(max(0, 1 / FPS - 0.001))
        frame = VideoFrame.from_ndarray(self.source.next_frame(), format="rgb24")
        frame.pts = pts
        frame.time_base = time_base
        return frame


def _cors(resp: web.Response) -> web.Response:
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "*"
    return resp


async def options(_req):  # CORS preflight for every route
    return _cors(web.Response())


async def tokens(_req):
    # The app's /api/reactor/token route POSTs here; return any JWT (local trust).
    return _cors(web.json_response({"jwt": "local-dev-jwt", "expires_at": int(time.time()) + 3600}))


async def ice_servers(_req):
    return _cors(web.json_response({"ice_servers": []}))  # localhost: no STUN/TURN


async def sessions(_req):
    # Advertise the model + its command/track capabilities (mirrors the cloud shape).
    body = {
        "session_id": f"local-{int(time.time() * 1000)}",
        "state": "ready",
        "cluster": "local",
        "model": {"name": "lingbot-world-v2-14b-causal-fast", "version": "local"},
        "server_info": {"server_version": "local-0.1"},
        "selected_transport": {"protocol": "webrtc", "version": "1"},
        "capabilities": {
            "protocol_version": "1",
            "tracks": [{"name": "main_video", "kind": "video", "direction": "sendonly"}],
            "commands": [
                {"name": n, "description": n, "schema": {}}
                for n in ("set_image", "set_prompt", "set_move_longitudinal",
                          "set_move_lateral", "set_camera_pose", "start", "reset")
            ],
            "emission_fps": FPS,
        },
    }
    return _cors(web.json_response(body))


async def connections(req):
    """SDP offer -> answer. Adds the video track + wires the DataChannel."""
    data = await req.json()
    offer = data.get("offer", data)  # tolerate {offer:{sdp,type}} or {sdp,type}
    pc = RTCPeerConnection()
    _pcs.add(pc)
    src = FrameSource(_engine)

    @pc.on("datachannel")
    def on_datachannel(channel):
        log.info("datachannel open: %s", channel.label)

        def emit(obj):
            try:
                channel.send(json.dumps(obj))
            except Exception:  # noqa: BLE001
                pass

        # tell the UI conditions are ready so it leaves the setup gate
        emit({"type": "state", "has_prompt": True, "has_image": True,
              "started": True, "running": True, "paused": False, "camera_pose_active": False})

        @channel.on("message")
        def on_message(msg):
            try:
                m = json.loads(msg)
            except Exception:  # noqa: BLE001
                return
            name = m.get("type") or m.get("command") or ""
            src.command(name, m)
            if name in ("set_image", "image"):
                emit({"type": "image_accepted", "width": WIDTH, "height": HEIGHT})
            elif name in ("set_prompt", "prompt"):
                emit({"type": "prompt_accepted"})
            elif name == "start":
                emit({"type": "generation_started", "chunk_num": 0})

    @pc.on("connectionstatechange")
    async def on_state():
        log.info("pc state: %s", pc.connectionState)
        if pc.connectionState in ("failed", "closed"):
            await pc.close()
            _pcs.discard(pc)

    pc.addTrack(ModelVideoTrack(src))
    await pc.setRemoteDescription(RTCSessionDescription(sdp=offer["sdp"], type=offer["type"]))
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    return _cors(web.json_response({
        "answer": {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type},
        "sdp": pc.localDescription.sdp, "type": pc.localDescription.type,
        "connection_id": f"conn-{int(time.time() * 1000)}",
    }))


async def healthz(_req):
    return _cors(web.json_response({"status": "ok", "pcs": len(_pcs)}))


def build_app() -> web.Application:
    app = web.Application()
    # tolerate both /x and /v1/x (the SDK may version paths); register both.
    for base in ("", "/v1"):
        app.router.add_post(f"{base}/tokens", tokens)
        app.router.add_get(f"{base}/ice_servers", ice_servers)
        app.router.add_post(f"{base}/sessions", sessions)
        app.router.add_post(f"{base}/session", sessions)
        app.router.add_post(f"{base}/connections", connections)
        app.router.add_route("OPTIONS", f"{base}/{{tail:.*}}", options)
    app.router.add_get("/healthz", healthz)
    return app


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--model", action="store_true",
                    help="load the real lingbot-world-v2 pipeline (needs ~/lingbot-venv torch); "
                         "omit for the test-pattern protocol shim")
    args = ap.parse_args()
    if args.model:
        import threading

        from engine import ModelEngine
        _engine = ModelEngine()
        log.info("loading model pipeline in background (~2.5 min)…")
        threading.Thread(target=_engine.load, daemon=True).start()
    log.info("local LW2 backend on http://%s:%d — point NEXT_PUBLIC_COORDINATOR_URL here", args.host, args.port)
    web.run_app(build_app(), host=args.host, port=args.port, access_log=None)
