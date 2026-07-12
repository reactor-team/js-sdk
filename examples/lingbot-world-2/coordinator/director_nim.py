"""AI Director — NVIDIA inference backend (no local GPU).

Uses the NVIDIA inference hub (OpenAI-compatible) instead of a local model, so
it does NOT compete with the 14B generator for VRAM. Mirrors the proven pattern
in gfnagent/dataset/inference_api.py: OpenAI client -> inference-api.nvidia.com,
frames sent as base64 image_url blocks. Default model is the small NVIDIA VLM
nemotron-nano-12b-v2-vl.

Needs an nvapi key in NVIDIA_API_KEY. Runs the shared director loop.
"""
import argparse
import asyncio
import base64
import io
import os

from openai import OpenAI

from director_common import USER_TEXT, load_scene, run_director

# NVIDIA inference hub (OpenAI-compatible). The openai client appends
# /chat/completions, so strip it from the gateway URL like inference_api does.
NVIDIA_URL = "https://inference-api.nvidia.com/v1"
DEFAULT_MODEL = "nvidia/nvidia/nemotron-nano-12b-v2-vl"  # small NVIDIA VLM


def make_decide(client, model, max_px):
    def decide(frame, system):
        img = frame
        if max(img.size) > max_px:  # downscale to stay under the request-size limit
            s = max_px / max(img.size)
            img = img.resize((int(img.width * s), int(img.height * s)))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        messages = [
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": USER_TEXT},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                    },
                ],
            },
        ]
        resp = client.chat.completions.create(
            model=model, messages=messages, temperature=0.0, max_tokens=384
        )
        if not resp.choices:
            return ""
        return (resp.choices[0].message.content or "").strip()

    return decide


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="ws://localhost:8090", help="coordinator WebSocket")
    ap.add_argument("--frame", default="frame.png", help="latest-frame image file to watch")
    ap.add_argument("--scene", default="", help="scene JSON (for base identity + event list)")
    ap.add_argument("--interval", type=float, default=3.0, help="seconds between frame checks")
    ap.add_argument("--once", action="store_true", help="run one proposal and exit (test)")
    ap.add_argument("--model", default=DEFAULT_MODEL, help="NVIDIA inference model id")
    ap.add_argument("--base-url", default=NVIDIA_URL, help="OpenAI-compatible base URL")
    ap.add_argument("--max-px", type=int, default=768, help="max frame dimension sent")
    args = ap.parse_args()

    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        raise SystemExit("Set NVIDIA_API_KEY (nvapi-... key) in the environment.")

    client = OpenAI(api_key=api_key, base_url=args.base_url, max_retries=2, timeout=120)
    decide = make_decide(client, args.model, args.max_px)
    scene = load_scene(args.scene)
    print(f"[director] NVIDIA inference: {args.model}", flush=True)
    asyncio.run(
        run_director(decide, args.url, args.frame, scene, args.interval, args.once)
    )


if __name__ == "__main__":
    main()
