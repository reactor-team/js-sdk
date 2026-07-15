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

# Named vision-model shortcuts: pass e.g. --model cosmos. All are multimodal + accessible
# on the default-models key. Benchmarked on the 26-probe shark checklist (accuracy = does
# it detect the shark fin that the small model reads as a dolphin):
#   cosmos   ~4s  PASS   8B VL reasoner — fastest AND accurate  (RECOMMENDED)
#   nemotron ~7s  FAIL   12B VL         — fast but misses hard cases
#   gemini   ~3s  PASS   fast VL flash
#   minimax  ~19s FAIL*  VL reasoner    — accurate when focused, degrades on big batches
#   qwen     ~59s PASS   397B VL reasoner — accurate but very slow
MODELS = {
    "cosmos":   "nvidia/nvidia/cosmos3-nano-reasoner",
    "nemotron": "nvidia/nvidia/nemotron-nano-12b-v2-vl",
    "gemini":   "gcp/google/gemini-3.5-flash",
    "minimax":  "nvidia/minimaxai/minimax-m2.7",
    "qwen":     "nvidia/qwen/qwen3-5-397b-a17b",
}
DEFAULT_MODEL = MODELS["cosmos"]  # fastest + accurate (see table above)
DEFAULT_IMAGE = "../../../assets/shark.jpg"
DEFAULT_SCENE = "../lib/lingbot-cases/jet-ski-cruise.json"


def parse_json(text):
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.DOTALL)  # strip reasoning traces
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def main():
    ap = argparse.ArgumentParser(description="Test derive_probes -> VLM -> resolve on one frame.")
    ap.add_argument("--image", default=None, help="frame image to probe")
    ap.add_argument("--scene", default=None, help="game JSON to derive the checklist from")
    ap.add_argument("--model", default=DEFAULT_MODEL,
                    help="model id OR a shortcut: cosmos|nemotron|gemini|minimax|qwen (cosmos = fastest+accurate)")
    ap.add_argument("--base-url", default=NVIDIA_URL, help="OpenAI-compatible base URL")
    ap.add_argument("--max-px", type=int, default=768, help="max image dimension sent")
    ap.add_argument("--max-tokens", type=int, default=512, help="max tokens in the reply")
    ap.add_argument("--dump", default="probes_debug.json",
                    help="write the full request/reply/resolve artifact here for debugging")
    ap.add_argument("--expect", default="",
                    help="expected-results JSON (e.g. ../../../assets/pistol.expected.json): supplies "
                         "image/scene + expect_true/expect_false. Paths in it are relative to the file.")
    ap.add_argument("--expect-true", default="",
                    help="comma-separated probe ids that MUST be true; a false one is a FALSE NEGATIVE -> exit 1")
    ap.add_argument("--expect-false", default="",
                    help="comma-separated probe ids that MUST be false; a true one is a false positive -> exit 1")
    ap.add_argument("--no-think", action="store_true",
                    help="append Qwen3 '/no_think' soft-switch to disable the reasoning trace (much faster on qwen3-*)")
    args = ap.parse_args()
    args.model = MODELS.get(args.model, args.model)  # expand a shortcut (cosmos) to the full slug

    # Resolve --expect (expected-results JSON): fills image/scene (relative to the file)
    # and the expect lists. CLI --image/--scene/--expect-true/false override / add.
    exp_true = [s.strip() for s in args.expect_true.split(",") if s.strip()]
    exp_false = [s.strip() for s in args.expect_false.split(",") if s.strip()]
    if args.expect:
        _base = os.path.dirname(os.path.abspath(args.expect))
        with open(args.expect, encoding="utf-8") as f:
            _e = json.load(f)
        if args.image is None and _e.get("image"):
            args.image = os.path.join(_base, _e["image"])
        if args.scene is None and _e.get("scene"):
            args.scene = os.path.join(_base, _e["scene"])
        exp_true += [x for x in _e.get("expect_true", []) if x not in exp_true]
        exp_false += [x for x in _e.get("expect_false", []) if x not in exp_false]
    if args.image is None:
        args.image = DEFAULT_IMAGE
    if args.scene is None:
        args.scene = DEFAULT_SCENE

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
    if args.no_think:
        user_text += "\n\n/no_think"  # Qwen3 soft-switch: skip the reasoning trace

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

    # Assertions: a required-true probe that came back false is a FALSE NEGATIVE.
    # (exp_true / exp_false were resolved up top from --expect + CLI flags.)
    if exp_true or exp_false:
        probe_ids = {p["id"] for p in probes}
        failures = []
        print("\n===== ASSERTIONS =====")
        for pid in exp_true:
            if pid not in probe_ids:
                print(f"  WARNING: '{pid}' is not a derived probe id (typo?)")
            got = bool(answers.get(pid, False))
            print(f"  expect-true  {pid}: {'true' if got else 'false'}  [{'OK' if got else 'FALSE NEGATIVE'}]")
            if not got:
                failures.append(f"false negative: {pid}")
        for pid in exp_false:
            if pid not in probe_ids:
                print(f"  WARNING: '{pid}' is not a derived probe id (typo?)")
            got = bool(answers.get(pid, False))
            print(f"  expect-false {pid}: {'true' if got else 'false'}  [{'FALSE POSITIVE' if got else 'OK'}]")
            if got:
                failures.append(f"false positive: {pid}")
        print(f"  RESULT: {'PASS' if not failures else 'FAIL (' + str(len(failures)) + ')'}")
        if failures:
            print("[probes] assertion failures:", "; ".join(failures), file=sys.stderr)
            raise SystemExit(1)


if __name__ == "__main__":
    main()
