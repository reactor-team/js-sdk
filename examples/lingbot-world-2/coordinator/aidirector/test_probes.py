"""Test the VLM state-probe flow end-to-end on ONE frame + scene.

Builds on scene_probes.py: derive the checklist FROM a game JSON, ask the VLM all
probes in ONE call, then resolve the answers into coordinator ops + observations.
Dry-run by design (prints everything; sends nothing). This is the test harness for
the derive_probes -> VLM -> resolve path (CONTRACT.md §6.3).

Needs an nvapi key in NVIDIA_API_KEY. Deps: openai, Pillow.

Usage (defaults to the shark frame + jet-ski scene):
    NVIDIA_API_KEY=nvapi-... python test_probes.py
    python test_probes.py --image ../../../assets/shark.jpg \
        --scene ../lib/lingbot-cases/jet-ski-cruise.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

from PIL import Image

from scene_probes import derive_probes, resolve, _tri
from client import NVIDIA_URL, DEFAULT_MODEL, MODELS, make_client, vlm_call, parse_json

DEFAULT_IMAGE = "../../../assets/shark.jpg"
DEFAULT_SCENE = "../lib/lingbot-cases/jet-ski-cruise.json"


def main() -> None:
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
        "Answer each of these yes/no questions about the image. Use \"unknown\" when you "
        "genuinely cannot tell from the image — do not guess. Respond with ONLY a JSON "
        "object mapping each id to true, false, or \"unknown\".\n\n" + questions
    )
    if args.no_think:
        user_text += "\n\n/no_think"  # Qwen3 soft-switch: skip the reasoning trace

    img = Image.open(args.image).convert("RGB")

    client = make_client(api_key, args.base_url)
    print(f"[probes] model={args.model}  image={args.image} ({img.width}x{img.height})", flush=True)
    _t0 = time.perf_counter()
    reply, resp = vlm_call(client, args.model, img, derived["system"], user_text,
                           args.max_tokens, args.max_px)
    _elapsed = time.perf_counter() - _t0
    if not resp.choices:
        raise SystemExit("empty response (no choices)")

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

    print("\n===== VLM ANSWERS (true / unknown) =====")
    trues = [p["id"] for p in probes if _tri(answers.get(p["id"])) is True]
    unknowns = [p["id"] for p in probes if _tri(answers.get(p["id"])) is None]
    print("true   :", ", ".join(trues) if trues else "(none)")
    print("unknown:", ", ".join(unknowns) if unknowns else "(none)")

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
        def _label(v: bool | None) -> str:
            return "true" if v is True else "unknown" if v is None else "false"
        for pid in exp_true:
            if pid not in probe_ids:
                print(f"  WARNING: '{pid}' is not a derived probe id (typo?)")
            v = _tri(answers.get(pid))
            ok = v is True  # unknown counts as a miss for a required-true probe
            print(f"  expect-true  {pid}: {_label(v)}  [{'OK' if ok else 'FALSE NEGATIVE'}]")
            if not ok:
                failures.append(f"false negative: {pid} ({_label(v)})")
        for pid in exp_false:
            if pid not in probe_ids:
                print(f"  WARNING: '{pid}' is not a derived probe id (typo?)")
            v = _tri(answers.get(pid))
            bad = v is True  # unknown is NOT a false positive
            print(f"  expect-false {pid}: {_label(v)}  [{'FALSE POSITIVE' if bad else 'OK'}]")
            if bad:
                failures.append(f"false positive: {pid}")
        print(f"  RESULT: {'PASS' if not failures else 'FAIL (' + str(len(failures)) + ')'}")
        if failures:
            print("[probes] assertion failures:", "; ".join(failures), file=sys.stderr)
            raise SystemExit(1)


if __name__ == "__main__":
    main()
