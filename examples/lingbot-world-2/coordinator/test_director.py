"""Test the AI director's decision on ONE frame + scene, with injectable STATE.

Mirrors the live director (director_common.build_system + director_nim's VLM call)
but standalone and offline: build the director system prompt from the scene + a
SIMULATED state (objective is read from the scene; health / fired-memory / facts /
step you pass in), send one frame, and print which authored events the VLM would
fire — and the health/inventory each would apply. Vary --health / --fired / --facts
to see how state changes the decision. Dry-run: prints, sends nothing.

Needs NVIDIA_API_KEY. Deps: openai, Pillow, websockets (director_common).

Usage (defaults to a jet-ski frame + scene):
    NVIDIA_API_KEY=nvapi-... python test_director.py
    python test_director.py --image ../../../assets/shark.jpg \
        --scene ../lib/lingbot-cases/jet-ski-cruise.json \
        --health 40 --fired "Shark Appears,Storm Rolls In" --step 12
"""
import argparse
import base64
import io
import json
import os
import time

from openai import OpenAI
from PIL import Image

from director_common import load_scene, build_system, parse_json, USER_TEXT

NVIDIA_URL = "https://inference-api.nvidia.com/v1"
DEFAULT_MODEL = "nvidia/nvidia/nemotron-nano-12b-v2-vl"
DEFAULT_IMAGE = "../../../assets/shark.jpg"
DEFAULT_SCENE = "../lib/lingbot-cases/jet-ski-cruise.json"


def main():
    ap = argparse.ArgumentParser(description="Test the AI director's event decision on one frame + state.")
    ap.add_argument("--image", default=DEFAULT_IMAGE, help="frame the director looks at")
    ap.add_argument("--scene", default=DEFAULT_SCENE, help="game JSON (identity + objective + event list)")
    ap.add_argument("--model", default=DEFAULT_MODEL, help="NVIDIA inference model id")
    ap.add_argument("--base-url", default=NVIDIA_URL, help="OpenAI-compatible base URL")
    ap.add_argument("--max-px", type=int, default=768, help="max image dimension sent")
    ap.add_argument("--max-tokens", type=int, default=256, help="max tokens in the reply")
    # --- injectable STATE (what the director knows beyond the frame) ---
    ap.add_argument("--health", type=int, default=100, help="current HUD health in the prompt")
    ap.add_argument("--fired", default="", help="comma-separated event names already fired this session")
    ap.add_argument("--facts", default="", help="current persistent world facts text")
    ap.add_argument("--step", type=int, default=1, help="elapsed chunks (pacing signal)")
    ap.add_argument("--dump", default="director_debug.json", help="write the full exchange here")
    args = ap.parse_args()

    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        raise SystemExit("Set NVIDIA_API_KEY (nvapi-... key) in the environment.")
    for path, what in ((args.image, "Image"), (args.scene, "Scene")):
        if not os.path.isfile(path):
            raise SystemExit(f"{what} not found: {path}")

    scene = load_scene(args.scene)
    fired = [s.strip() for s in args.fired.split(",") if s.strip()]
    state = {"facts": args.facts or "(none)", "health": args.health, "fired": fired, "step": args.step}
    system_text = build_system(scene, state)
    dir_events = scene.get("dir_events") or []
    print(f"[director] scene={os.path.basename(args.scene)}  {len(dir_events)} events  "
          f"health={args.health}  step={args.step}  fired={fired or '(none)'}", flush=True)

    img = Image.open(args.image).convert("RGB")
    if max(img.size) > args.max_px:
        s = args.max_px / max(img.size)
        img = img.resize((int(img.width * s), int(img.height * s)))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    messages = [
        {"role": "system", "content": system_text},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": USER_TEXT},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
            ],
        },
    ]

    client = OpenAI(api_key=api_key, base_url=args.base_url, max_retries=2, timeout=120)
    print(f"[director] model={args.model}  image={args.image} ({img.width}x{img.height})", flush=True)
    _t0 = time.perf_counter()
    resp = client.chat.completions.create(
        model=args.model, messages=messages, temperature=0.0, max_tokens=args.max_tokens
    )
    _elapsed = time.perf_counter() - _t0
    if not resp.choices:
        raise SystemExit("empty response (no choices)")

    reply = (resp.choices[0].message.content or "").strip()
    parsed = parse_json(reply)
    by_name = {e["name"].lower(): e for e in dir_events}
    fired_now = []
    if parsed:
        for name in parsed.get("events", []) or []:
            ev = by_name.get(str(name).strip().lower())
            if ev:
                fired_now.append(ev)

    print("\n===== DIRECTOR DECISION =====")
    if not fired_now:
        print("would fire: (none — VLM chose no event, or an unauthored/unparseable name)")
    for ev in fired_now:
        bits = []
        if ev.get("health") is not None:
            bits.append(f"health {ev['health']:+d}")
        if ev.get("addItem"):
            bits.append(f"+{ev['addItem']}")
        extra = f"  [{', '.join(bits)}]" if bits else ""
        print(f"  FIRE -> {ev['name']}{extra}")
    print("=============================")

    usage = getattr(resp, "usage", None)
    debug = {
        "scene": args.scene, "image": args.image, "model": args.model,
        "state": state, "system": system_text, "raw_reply": reply,
        "parsed": parsed, "fired": [e["name"] for e in fired_now],
        "elapsed_s": round(_elapsed, 2),
        "tokens": ({"prompt": usage.prompt_tokens, "completion": usage.completion_tokens}
                   if usage is not None else None),
    }
    with open(args.dump, "w", encoding="utf-8") as f:
        json.dump(debug, f, indent=2, ensure_ascii=False)

    tok = ""
    if usage is not None:
        tok = f"  tokens: prompt={usage.prompt_tokens} completion={usage.completion_tokens}"
    print(f"\n[director] reply time: {_elapsed:.2f}s{tok}", flush=True)
    print(f"[director] OUTPUT FILE: {os.path.abspath(args.dump)}", flush=True)


if __name__ == "__main__":
    main()
