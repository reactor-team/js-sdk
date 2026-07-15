"""Standalone VLM smoke test: send ONE image to NVIDIA inference and print the reply.

Mirrors director_nim.py's pattern (OpenAI client -> inference-api.nvidia.com,
image sent as a base64 image_url block) but has no coordinator/WebSocket deps --
it just posts a single image + prompt and prints the model's text answer.

Needs an nvapi key in NVIDIA_API_KEY. Deps: openai, Pillow.

Usage:
    NVIDIA_API_KEY=nvapi-... python test_vlm_image.py --image ../public/lingbot-cases/templerun.jpg
    python test_vlm_image.py --image frame.png --prompt "What is happening in this scene?"
    # Director mode: build the constrained director prompt for a scene and show which
    # authored events the VLM would fire from this single frame:
    python test_vlm_image.py --image frame.png --scene ../lib/lingbot-cases/templerun.json
"""
import argparse
import os
import sys
import time

from PIL import Image

from client import NVIDIA_URL, make_client, vlm_call

# Director-mode helpers are optional (need director_common -> websockets). Import at
# top; guard so the plain image test still works without those deps installed.
try:
    from director_common import load_scene, build_system, parse_json, USER_TEXT as DIRECTOR_USER_TEXT
    _HAS_DIRECTOR = True
except Exception:
    _HAS_DIRECTOR = False

DEFAULT_MODEL = "nvidia/nvidia/nemotron-nano-12b-v2-vl"  # small NVIDIA VLM
DEFAULT_PROMPT = "Describe this image in detail. What is shown, and what is happening?"


def main():
    ap = argparse.ArgumentParser(description="Send one image to an NVIDIA-inference VLM and print the reply.")
    ap.add_argument("--image", required=True, help="path to the image file to send")
    ap.add_argument("--prompt", default=DEFAULT_PROMPT, help="text prompt sent with the image")
    ap.add_argument("--system", default="You are a helpful vision assistant.", help="system prompt")
    ap.add_argument("--model", default=DEFAULT_MODEL, help="NVIDIA inference model id")
    ap.add_argument("--base-url", default=NVIDIA_URL, help="OpenAI-compatible base URL")
    ap.add_argument("--max-px", type=int, default=768, help="max image dimension sent (downscaled to fit)")
    ap.add_argument("--max-tokens", type=int, default=512, help="max tokens in the reply")
    ap.add_argument("--temperature", type=float, default=0.0, help="sampling temperature")
    ap.add_argument("--scene", default="", help="scene JSON: use the DIRECTOR prompt and show which "
                                                "authored director events the VLM would fire from this frame")
    ap.add_argument("--health", type=int, default=100, help="director-mode: current health in the prompt")
    args = ap.parse_args()

    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        raise SystemExit("Set NVIDIA_API_KEY (nvapi-... key) in the environment.")
    if not os.path.isfile(args.image):
        raise SystemExit(f"Image not found: {args.image}")

    # Director mode: swap in the constrained director system prompt + user text.
    director_scene = None
    system_text, user_text = args.system, args.prompt
    if args.scene:
        if not _HAS_DIRECTOR:
            raise SystemExit("--scene needs director_common importable (install: openai pillow websockets).")
        if not os.path.isfile(args.scene):
            raise SystemExit(f"Scene not found: {args.scene}")
        director_scene = load_scene(args.scene)
        state = {"facts": "(none)", "health": args.health, "fired": [], "step": 1}
        system_text = build_system(director_scene, state)
        user_text = DIRECTOR_USER_TEXT

    img = Image.open(args.image).convert("RGB")

    client = make_client(api_key, args.base_url)
    print(f"[vlm-test] model={args.model}  image={args.image} ({img.width}x{img.height})", flush=True)
    _t0 = time.perf_counter()
    reply, resp = vlm_call(client, args.model, img, system_text, user_text,
                           args.max_tokens, args.max_px, args.temperature)
    _elapsed = time.perf_counter() - _t0
    if not resp.choices:
        print("[vlm-test] empty response (no choices)", file=sys.stderr)
        raise SystemExit(1)
    print("\n===== VLM RESULT =====")
    print(reply)
    print("======================")

    # Director mode: parse the JSON and show which AUTHORED events would actually fire.
    if director_scene is not None:
        parsed = parse_json(reply)
        by_name = {e["name"].lower(): e for e in (director_scene.get("dir_events") or [])}
        fired = []
        if parsed:
            for name in parsed.get("events", []) or []:
                ev = by_name.get(str(name).strip().lower())
                if ev:
                    fired.append(ev)
        print("\n----- DIRECTOR DECISION -----")
        if not fired:
            print("would fire: (none — VLM chose no event, or returned an unauthored/unparseable name)")
        for ev in fired:
            bits = []
            if ev.get("health") is not None:
                bits.append(f"health {ev['health']:+d}")
            if ev.get("addItem"):
                bits.append(f"+{ev['addItem']}")
            extra = f"  [{', '.join(bits)}]" if bits else ""
            print(f"  FIRE -> {ev['name']}{extra}")
        print("-----------------------------")

    usage = getattr(resp, "usage", None)
    _tok_line = ""
    if usage is not None:
        _tok_line = f"  tokens: prompt={usage.prompt_tokens} completion={usage.completion_tokens}"
        _tps = usage.completion_tokens / _elapsed if _elapsed > 0 else 0.0
        _tok_line += f" ({_tps:.1f} tok/s)"
    print(f"[vlm-test] reply time: {_elapsed:.2f}s{_tok_line}", flush=True)


if __name__ == "__main__":
    main()
