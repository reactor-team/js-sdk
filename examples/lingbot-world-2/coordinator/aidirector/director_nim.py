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
import json
import os

from director_common import USER_TEXT, load_scene, make_probe, run_director, resolve_model
from client import NVIDIA_URL, DEFAULT_MODEL, make_client, vlm_call


def make_vlm(client, model, max_px):
    """vlm(frame, system, user_text, max_tokens) -> reply text, over the shared vlm_call.
    Shared by the director's decide() and the probe checklist."""
    def vlm(frame, system, user_text, max_tokens=384):
        text, _resp = vlm_call(client, model, frame, system, user_text, max_tokens, max_px)
        return text

    return vlm


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="ws://localhost:8090", help="coordinator WebSocket")
    ap.add_argument("--frame", default="frame.png", help="latest-frame image file to watch")
    ap.add_argument("--scene", default="", help="scene JSON (for base identity + event list)")
    ap.add_argument("--interval", type=float, default=3.0, help="seconds between frame checks")
    ap.add_argument("--once", action="store_true", help="run one proposal and exit (test)")
    ap.add_argument("--model", default=DEFAULT_MODEL,
                    help="model id OR a shortcut: cosmos|nemotron|gemini|minimax|qwen")
    ap.add_argument("--base-url", default=NVIDIA_URL, help="OpenAI-compatible base URL")
    ap.add_argument("--max-px", type=int, default=768, help="max frame dimension sent")
    ap.add_argument("--no-probe", action="store_true",
                    help="disable the probe pass (the AI director's eyes); decide from the frame alone")
    args = ap.parse_args()
    args.model = resolve_model(args.model)  # expand a shortcut (cosmos) to the full slug

    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        raise SystemExit("Set NVIDIA_API_KEY (nvapi-... key) in the environment.")

    client = make_client(api_key, args.base_url)
    vlm = make_vlm(client, args.model, args.max_px)
    decide = lambda frame, system: vlm(frame, system, USER_TEXT, 384)  # noqa: E731
    scene = load_scene(args.scene)

    # Probe pass = the AI director's eyes. Needs the FULL scene JSON (derive_probes),
    # not the trimmed load_scene() view. Skipped with --no-probe or if no scene given.
    probe = None
    if not args.no_probe and args.scene and os.path.isfile(args.scene):
        scene_json = json.load(open(args.scene, encoding="utf-8"))
        probe = make_probe(vlm, scene_json)

    print(f"[director] NVIDIA inference: {args.model}  probes={'on' if probe else 'off'}", flush=True)
    asyncio.run(
        run_director(decide, args.url, args.frame, scene, args.interval, args.once, probe=probe)
    )


if __name__ == "__main__":
    main()
