"""Standalone VLM smoke test: send ONE image to NVIDIA inference and print the reply.

Mirrors director_nim.py's pattern (OpenAI client -> inference-api.nvidia.com,
image sent as a base64 image_url block) but has no coordinator/WebSocket deps --
it just posts a single image + prompt and prints the model's text answer. For the
scene/director path (which authored events a frame would fire) use test_director.py,
which is the richer harness (injectable state + assertions).

Needs an nvapi key in NVIDIA_API_KEY. Deps: openai, Pillow.

Usage:
    NVIDIA_API_KEY=nvapi-... python test_vlm_image.py --image ../public/lingbot-cases/templerun.jpg
    python test_vlm_image.py --image frame.png --prompt "What is happening in this scene?"
"""
import argparse
import os
import sys
import time

from PIL import Image

from client import NVIDIA_URL, MODELS, make_client, resolve_model, vlm_call

DEFAULT_MODEL = MODELS["cosmos"]  # cosmos3-nano-reasoner — fastest + accurate (nemotron misreads)
DEFAULT_PROMPT = "Describe this image in detail. What is shown, and what is happening?"


def main():
    ap = argparse.ArgumentParser(description="Send one image to an NVIDIA-inference VLM and print the reply.")
    ap.add_argument("--image", required=True, help="path to the image file to send")
    ap.add_argument("--prompt", default=DEFAULT_PROMPT, help="text prompt sent with the image")
    ap.add_argument("--system", default="You are a helpful vision assistant.", help="system prompt")
    ap.add_argument("--model", default=DEFAULT_MODEL,
                    help="model id OR a shortcut: cosmos|nemotron|gemini|minimax|qwen (default cosmos)")
    ap.add_argument("--base-url", default=NVIDIA_URL, help="OpenAI-compatible base URL")
    ap.add_argument("--max-px", type=int, default=768, help="max image dimension sent (downscaled to fit)")
    ap.add_argument("--max-tokens", type=int, default=512, help="max tokens in the reply")
    ap.add_argument("--temperature", type=float, default=0.0, help="sampling temperature")
    args = ap.parse_args()
    args.model = resolve_model(args.model)  # expand a shortcut (cosmos) to the full slug

    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        raise SystemExit("Set NVIDIA_API_KEY (nvapi-... key) in the environment.")
    if not os.path.isfile(args.image):
        raise SystemExit(f"Image not found: {args.image}")

    img = Image.open(args.image).convert("RGB")

    client = make_client(api_key, args.base_url)
    print(f"[vlm-test] model={args.model}  image={args.image} ({img.width}x{img.height})", flush=True)
    _t0 = time.perf_counter()
    reply, resp = vlm_call(client, args.model, img, args.system, args.prompt,
                           args.max_tokens, args.max_px, args.temperature)
    _elapsed = time.perf_counter() - _t0
    if not resp.choices:
        print("[vlm-test] empty response (no choices)", file=sys.stderr)
        raise SystemExit(1)
    print("\n===== VLM RESULT =====")
    print(reply)
    print("======================")

    usage = getattr(resp, "usage", None)
    _tok_line = ""
    if usage is not None:
        _tok_line = f"  tokens: prompt={usage.prompt_tokens} completion={usage.completion_tokens}"
        _tps = usage.completion_tokens / _elapsed if _elapsed > 0 else 0.0
        _tok_line += f" ({_tps:.1f} tok/s)"
    print(f"[vlm-test] reply time: {_elapsed:.2f}s{_tok_line}", flush=True)


if __name__ == "__main__":
    main()
