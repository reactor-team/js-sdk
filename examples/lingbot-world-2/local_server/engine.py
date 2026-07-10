"""Model engine: wraps the local lingbot-world-v2 pipeline and exposes generated
frames to the WebRTC server. Runs in ~/lingbot-venv (torch + aiortc together).

Stage 2 (this): load the fp8 pipeline once; on `start` generate a clip for the
requested example/prompt and stream its frames (looping) to the UI. Proves the
model -> WebRTC -> browser pipe end-to-end.
Stage 3 (next): swap `generate()` for the interactive per-chunk AR step so live
WASD/prompt actually steer it. For now WASD re-triggers a fresh generation.

Slow by design: ~2.5 min one-time model load, then ~26 s per 33-frame clip
(offload-bound, ~1 fps). See the lingbot-world-v2 memory.
"""
import os
import sys
import threading

import numpy as np
import torch
from PIL import Image

# lingbot-world-v2 repo (WSL path) — the pipeline + checkpoint live here.
LINGBOT = "/mnt/c/workspace/world/lingbot-world-v2"
sys.path.insert(0, LINGBOT)

import wan  # noqa: E402
from wan.configs import MAX_AREA_CONFIGS, WAN_CONFIGS  # noqa: E402

SIZE = "320*576"
FRAME_NUM = 33
LOCAL_ATTN, SINK = 12, 6


class ModelEngine:
    def __init__(self):
        self.pipe = None
        self.cfg = None
        self.ready = False
        self._frames: list[np.ndarray] = []  # HxWx3 uint8
        self._idx = 0
        self._lock = threading.Lock()
        self._busy = False
        # current session conditioning (set via DataChannel commands)
        self.prompt = "A cinematic flythrough."
        self.image_path = os.path.join(LINGBOT, "examples/03/image.jpg")
        self.action_path = os.path.join(LINGBOT, "examples/03")

    def load(self):
        """Heavy: load pipeline once (fp8). Call in a background thread."""
        cfg = WAN_CONFIGS["i2v-A14B"]
        self.cfg = cfg
        os.chdir(LINGBOT)  # ckpt_dir="." resolves against the repo (has transformers/)
        self.pipe = wan.WanI2VCausal(
            config=cfg, checkpoint_dir=".", device_id=0, rank=0,
            local_attn_size=LOCAL_ATTN, sink_size=SINK,
            infer_mode="causal_fast", fp8=True)
        self.ready = True
        print("[engine] pipeline ready", flush=True)

    # ---- DataChannel command handlers ---------------------------------------
    def set_prompt(self, prompt: str):
        if prompt:
            self.prompt = prompt

    def set_image(self, path: str):
        if path and os.path.exists(path):
            self.image_path = path
            # example dir alongside the image supplies the action .npy poses
            self.action_path = os.path.dirname(path)

    def start(self):
        if self.ready and not self._busy:
            threading.Thread(target=self._generate, daemon=True).start()

    # ---- generation ---------------------------------------------------------
    def _generate(self):
        self._busy = True
        try:
            img = Image.open(self.image_path).convert("RGB")
            print(f"[engine] generating: {self.prompt[:60]!r} <- {self.action_path}", flush=True)
            video = self.pipe.generate(
                self.prompt, img, action_path=self.action_path, chunk_size=4,
                max_area=MAX_AREA_CONFIGS[SIZE], frame_num=FRAME_NUM,
                shift=10.0, seed=42, offload_model=True, max_attention_size=None)
            # video: [T, C, H, W] in [-1, 1] -> list of HxWx3 uint8
            v = ((video.float().clamp(-1, 1) * 0.5 + 0.5) * 255).round().byte()
            frames = [f.permute(1, 2, 0).cpu().numpy() for f in v]
            with self._lock:
                self._frames = frames
                self._idx = 0
            print(f"[engine] {len(frames)} frames ready", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"[engine] generate FAILED: {type(e).__name__}: {e}", flush=True)
        finally:
            self._busy = False

    def next_frame(self) -> np.ndarray | None:
        """Latest generated frame (loops); None until the first clip exists."""
        with self._lock:
            if not self._frames:
                return None
            f = self._frames[self._idx % len(self._frames)]
            self._idx += 1
            return f
