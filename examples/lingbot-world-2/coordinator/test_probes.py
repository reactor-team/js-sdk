"""Test the VLM state-probe flow end-to-end on ONE frame + scene.

Builds on scene_probes.py: derive the checklist FROM a game JSON, ask the VLM all
probes in ONE call, then resolve the answers into coordinator ops + observations.
Dry-run by design (prints everything; sends nothing). This is the test harness for
the derive_probes -> VLM -> resolve path (DESIGN_vlm_state_probes.md).

Needs an nvapi key in NVIDIA_API_KEY. Deps: openai, Pillow.

Usage (defaults to the shark frame + jet-ski scene):
    NVIDIA_API_KEY=nvapi-... python test_probes.py
    python test_probes.py --image ../../../assets/shark.jpg \
        --scene ../lib/lingbot-cases/jet-ski-cruise.json
"""
import argparse
import base64
import io
import json
import os
import re
import sys
import time

from openai import OpenAI
from PIL import Image

from scene_probes import derive_probes, resolve

NVIDIA_URL = "https://inference-api.nvidia.com/v1"
DEFAULT_MODEL = "nvidia/nvidia/nemotron-nano-12b-v2-vl"
DEFAULT_IMAGE = "../../../assets/shark.jpg"
DEFAULT_SCENE = "../lib/lingbot-cases/jet-ski-cruise.json"


def parse_json(text):
    m = re.search(r"\{.*\}", text or "", re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def main():
    ap = argparse.ArgumentParser(description="Test derive_probes -> VLM -> resolve on one frame.")
    ap.add_argument("--image", default=DEFAULT_IMAGE, help="frame image to probe")
    ap.add_argument("--scene", default=DEFAULT_SCENE, help="game JSON to derive the checklist from")
    ap.add_argument("--model", default=DEFAULT_MODEL, help="NVIDIA inference model id")
    ap.add_argument("--base-url", default=NVIDIA_URL, help="OpenAI-compatible base URL")
    ap.add_argument("--max-px", type=int, default=768, help="max image dimension sent")
    ap.add_argument("--max-tokens", type=int, default=512, help="max tokens in the reply")
    ap.add_argument("--dump", default="probes_debug.json",
                    help="write the full request/reply/resolve artifact here for debugging")
    args = ap.parse_args()

    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        raise SystemExit("Set NVIDIA_API_KEY (nvapi-... key) in the environment.")
    for path, what in ((args.image, "Image"), (args.scene, "Scene")):
        if not os.path.isfile(path):
            raise SystemExit(f"{what} not found: {path}")

    scene = json.load(open(args.scene, encoding="utf-8"))
    derived = derive_probes(scene)
    probes = derived["probes"]
    print(f"[probes] scene={os.path.basename(args.scene)}  derived {len(probes)} probes", flush=True)

    # One call: system + every probe as "id: question" + the frame; expect JSON {id: bool}.
    questions = "\n".join(f'- {p["id"]}: {p["q"]}' for p in probes)
    user_text = (
        "Answer each of these yes/no questions about the image. Respond with ONLY a JSON "
        "object mapping each id to true or false.\n\n" + questions
    )

    img = Image.open(args.image).convert("RGB")
    if max(img.size) > args.max_px:
        s = args.max_px / max(img.size)
        img = img.resize((int(img.width * s), int(img.height * s)))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    messages = [
        {"role": "system", "content": derived["system"]},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": user_text},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
            ],
        },
    ]

    client = OpenAI(api_key=api_key, base_url=args.base_url, max_retries=2, timeout=120)
    print(f"[probes] model={args.model}  image={args.image} ({img.width}x{img.height})", flush=True)
    _t0 = time.perf_counter()
    resp = client.chat.completions.create(
        model=args.model, messages=messages, temperature=0.0, max_tokens=args.max_tokens
    )
    _elapsed = time.perf_counter() - _t0
    if not resp.choices:
        raise SystemExit("empty response (no choices)")

    reply = (resp.choices[0].message.content or "").strip()
    answers = parse_json(reply) or {}
    ops, obs = resolve(answers, probes) if answers else ([], {})

    # Always dump the full exchange for debugging — raw reply is saved even if it
    # didn't parse, so a bad response can be inspected after the fact.
    usage = getattr(resp, "usage", None)
    debug = {
        "scene": args.scene, "image": args.image, "model": args.model,
        "probe_count": len(probes), "probes": probes,
        "system": derived["system"], "user_text": user_text,
        "raw_reply": reply, "answers": answers,
        "observations": obs, "ops": ops,
        "elapsed_s": round(_elapsed, 2),
        "tokens": ({"prompt": usage.prompt_tokens, "completion": usage.completion_tokens}
                   if usage is not None else None),
    }
    with open(args.dump, "w", encoding="utf-8") as f:
        json.dump(debug, f, indent=2, ensure_ascii=False)
    print(f"[probes] debug dump -> {os.path.abspath(args.dump)}", flush=True)

    if not answers:
        print("\n[probes] WARNING: could not parse JSON answers. Raw reply:")
        print(reply)
        raise SystemExit(1)

    print("\n===== VLM ANSWERS (true only) =====")
    trues = [p["id"] for p in probes if bool(answers.get(p["id"], False))]
    print(", ".join(trues) if trues else "(all false)")

    print("\n===== OBSERVATIONS (flat state) =====")
    for k, v in obs.items():
        print(f"  {k} = {v}")

    print("\n===== COORDINATOR OPS (would send) =====")
    if not ops:
        print("  (none)")
    for op in ops:
        print("  " + json.dumps(op))

    usage = getattr(resp, "usage", None)
    tok = ""
    if usage is not None:
        tok = f"  tokens: prompt={usage.prompt_tokens} completion={usage.completion_tokens}"
    print(f"\n[probes] reply time: {_elapsed:.2f}s{tok}", flush=True)
    if os.path.isfile(args.dump):
        print(f"[probes] OUTPUT FILE: {os.path.abspath(args.dump)}", flush=True)


if __name__ == "__main__":
    main()
