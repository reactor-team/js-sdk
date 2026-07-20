"""A/B speed benchmark for the director's VLM calls — measures the effect of
NON-REASONING mode and SMALLER frames. Sends a few real calls and prints a timing
table so you can see the win before committing.

BILLED: makes ~6 NVIDIA calls. Needs NVIDIA_API_KEY. Deps: openai, Pillow.

Usage:
    NVIDIA_API_KEY=nvapi-... python bench_speed.py --image ../public/lingbot-cases/noir-alley-patrol.jpg
    python bench_speed.py --image frame.png --repeat 2
"""
from __future__ import annotations

import argparse
import os
import time
from collections.abc import Callable
from typing import Any

from PIL import Image

from client import NVIDIA_URL, MODELS, make_client, resolve_model, vlm_call, text_call

DECIDE_SYS = ("You are the DIRECTOR of a real-time world. Choose at most one authored "
              "event to fire, as JSON only: {\"events\": []}. Current facts: none. Health: 100.")
DECIDE_USER = "Based on the current world state, choose which event (if any) to fire, as JSON only."
PROBE_SYS = "You are a visual state checker. Answer each question true/false as a JSON object."
PROBE_USER = ("Answer these about the image as JSON: is_night, subject_visible, "
              "duplicate_subject, fire_visible, character_fighting.")


def _time(fn: Callable[[], tuple[Any, Any]], n: int) -> tuple[float | None, Any]:
    best = None
    for _ in range(n):
        t = time.perf_counter()
        _txt, resp = fn()
        dt = time.perf_counter() - t
        best = dt if best is None else min(best, dt)
    ct = getattr(getattr(resp, "usage", None), "completion_tokens", None)
    return best, ct


def main() -> None:
    ap = argparse.ArgumentParser(description="Measure non-reasoning + frame-size speedup.")
    ap.add_argument("--image", required=True, help="a frame/scene image to probe")
    ap.add_argument("--model", default=MODELS["cosmos"], help="model id or shortcut (default cosmos)")
    ap.add_argument("--base-url", default=NVIDIA_URL)
    ap.add_argument("--repeat", type=int, default=2, help="calls per config; reports the FASTEST")
    args = ap.parse_args()
    args.model = resolve_model(args.model)
    key = os.environ.get("NVIDIA_API_KEY")
    if not key:
        raise SystemExit("Set NVIDIA_API_KEY (nvapi-... key).")
    if not os.path.isfile(args.image):
        raise SystemExit(f"Image not found: {args.image}")

    c = make_client(key, args.base_url)
    img = Image.open(args.image).convert("RGB")
    print(f"model={args.model}  image={args.image} ({img.width}x{img.height})  fastest of {args.repeat}\n")

    rows = []
    # decide (text-only): reasoning off vs on
    for think in (False, True):
        dt, ct = _time(lambda t=think: text_call(c, args.model, DECIDE_SYS, DECIDE_USER, 384, think=t), args.repeat)
        rows.append((f"decide (text)  think={think}", dt, ct))
    # probe (vision): reasoning off/on x frame size
    for px in (512, 768):
        for think in (False, True):
            dt, ct = _time(lambda t=think, p=px: vlm_call(c, args.model, img, PROBE_SYS, PROBE_USER, 384, p, think=t), args.repeat)
            rows.append((f"probe max_px={px} think={think}", dt, ct))

    print(f"{'config':30} {'seconds':>9}  {'compl.tokens':>12}")
    print("-" * 55)
    for name, dt, ct in rows:
        print(f"{name:30} {dt:9.2f}  {str(ct):>12}")
    # headline deltas
    d_off = next(r[1] for r in rows if r[0].startswith("decide") and "False" in r[0])
    d_on = next(r[1] for r in rows if r[0].startswith("decide") and "True" in r[0])
    p_off = next(r[1] for r in rows if "max_px=512 think=False" in r[0])
    p_on = next(r[1] for r in rows if "max_px=768 think=True" in r[0])
    print("\nnon-reasoning decide:", f"{d_on:.2f}s -> {d_off:.2f}s  ({d_on/d_off:.1f}x faster)" if d_off else "n/a")
    print("lean probe (512+no-think) vs 768+think:", f"{p_on:.2f}s -> {p_off:.2f}s  ({p_on/p_off:.1f}x faster)" if p_off else "n/a")


if __name__ == "__main__":
    main()
