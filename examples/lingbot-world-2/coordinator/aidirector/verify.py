"""Automated smoke-test for the coordinator VLM tools.

Checks each path succeeds (exit code + expected marker in output):
  1. model shortcuts resolve            (free, no API)
  2. probes path, --model cosmos        (~4s billed) -> must PASS shark.expected.json
  3. director decision, --model cosmos  (~4s billed) -> must produce a decision
  4. --full: probes, --model qwen       (~60s billed) -> the shortcut override works + PASS

The director's *decision logic* here == what run_director_nim.bat runs per frame; the only
extra piece in the live bat is the coordinator WS + frame.png handoff (separate integration).

Needs NVIDIA_API_KEY. Run:  verify.bat  [--full]   (exit 0 = all pass, 1 = a failure)
"""
import argparse
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))  # .../coordinator/aidirector
COORD = os.path.dirname(HERE)                       # .../coordinator (cwd for the scripts)
PY = os.path.join(COORD, ".venv", "Scripts", "python.exe")
if not os.path.isfile(PY):
    PY = sys.executable
SHARK_EXPECT = "../../../assets/shark.expected.json"  # relative to COORD


def run(label, cmd, needs):
    """Run cmd (cwd=coordinator); PASS iff exit 0 AND `needs` appears in the output."""
    print(f"\n=== {label} ===\n$ {' '.join(cmd)}", flush=True)
    r = subprocess.run(cmd, cwd=COORD, capture_output=True, text=True)
    out = r.stdout + r.stderr
    ok = r.returncode == 0 and (needs in out)
    tail = "\n".join(out.strip().splitlines()[-6:])
    print(tail)
    print(f"[{label}] {'PASS' if ok else 'FAIL'} (exit {r.returncode}, marker {'found' if needs in out else 'MISSING'})", flush=True)
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="also exercise the slow qwen override (~60s billed)")
    args = ap.parse_args()
    if not os.environ.get("NVIDIA_API_KEY"):
        raise SystemExit("Set NVIDIA_API_KEY first.")

    results = []

    # 1. shortcuts resolve (free)
    print("=== shortcuts resolve (dry) ===")
    from director_common import MODELS, resolve_model
    for k, v in MODELS.items():
        print(f"  {k:9s} -> {resolve_model(k)}")
    results.append(("shortcuts", all(resolve_model(k) == v for k, v in MODELS.items())))

    # 2. probes path, cosmos (default) -> must PASS the shark fixture
    results.append(("probes:cosmos", run(
        "probes:cosmos",
        [PY, "aidirector/test_probes.py", "--model", "cosmos", "--expect", SHARK_EXPECT, "--dump", "verify_probes.json"],
        needs="RESULT: PASS")))

    # 3. director decision, cosmos (== run_director_nim's per-frame logic) -> must decide
    results.append(("director:cosmos", run(
        "director:cosmos",
        [PY, "aidirector/test_director.py", "--model", "cosmos", "--dump", "verify_director.json"],
        needs="DIRECTOR DECISION")))

    # 3b. pacing: an event is already in progress -> the director must fire NOTHING
    results.append(("director:no-stack", run(
        "director:no-stack (event in progress -> no fire)",
        [PY, "aidirector/test_director.py", "--model", "cosmos",
         "--facts", "A shark is RIGHT NOW circling and lunging at the jet ski, its dorsal fin "
                    "cutting the water right beside the rider -- the shark attack is in progress.",
         "--fired", "Shark Appears,Shark Lunges",
         "--expect-none", "--dump", "verify_nostack.json"],
        needs="RESULT: PASS")))

    # 4. optional: the qwen shortcut override works end-to-end
    if args.full:
        results.append(("probes:qwen", run(
            "probes:qwen (override)",
            [PY, "aidirector/test_probes.py", "--model", "qwen", "--max-tokens", "6000",
             "--expect", SHARK_EXPECT, "--dump", "verify_qwen.json"],
            needs="RESULT: PASS")))

    print("\n===== VERIFY SUMMARY =====")
    for name, ok in results:
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    if not all(ok for _, ok in results):
        raise SystemExit(1)
    print("ALL PASS")


if __name__ == "__main__":
    main()
