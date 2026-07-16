"""Test: load a game by slug WITHOUT the UI, coordinator, or a VLM call.

Mirrors exactly what the AI director does when the UI broadcasts a game slug (see
director_nim.reload_game): resolve the slug (which is the scene JSON's `id`, OR the
filename stem) to its scene file, load_scene() it, and derive_probes(). Asserts that
every scene loads with a real identity, director events, and a probe checklist -- and
that a couple of known slugs resolve to the right file. No coordinator, no browser,
no model call, not billed.

Run from the coordinator/ folder (so ../lib/lingbot-cases resolves):
    python aidirector/test_load_game.py                (test every scene)
    python aidirector/test_load_game.py case1_0036     (test one slug)
"""
import argparse
import glob
import json
import os
import sys

from director_common import load_scene
from scene_probes import derive_probes

CASES_DIR = os.path.join("..", "lib", "lingbot-cases")

# A couple of id -> filename mappings we KNOW must hold (the UI sends the id).
KNOWN_MAP = {
    "case1_0036": "noir-alley-patrol.json",
    "case2_1012": "jet-ski-cruise.json",
    "templerun": "templerun.json",
}


def index_cases(cases_dir):
    """slug -> path, keyed by BOTH the filename stem and the JSON `id`."""
    idx = {}
    for p in glob.glob(os.path.join(cases_dir, "*.json")):
        idx[os.path.splitext(os.path.basename(p))[0]] = p
        try:
            jid = json.load(open(p, encoding="utf-8")).get("id")
        except (OSError, json.JSONDecodeError):
            continue
        if jid:
            idx[jid] = p
    return idx


def load_by_slug(idx, slug):
    """Resolve + load exactly like the director's reload_game does."""
    path = idx.get(slug)
    if not path:
        return None
    scene = load_scene(path)
    with open(path, encoding="utf-8") as f:
        derived = derive_probes(json.load(f))
    return path, scene, derived


def check(idx, slug):
    r = load_by_slug(idx, slug)
    if not r:
        return f"{slug}: NOT RESOLVED (no scene file for this slug)", False
    path, scene, derived = r
    events = scene.get("dir_events") or []
    probes = derived.get("probes") or []
    base = scene.get("base") or ""
    base_ok = bool(base) and base != "An interactive world."
    ok = base_ok and len(events) > 0 and len(probes) > 0
    detail = (f"{slug:22s} -> {os.path.basename(path):28s} "
              f"events={len(events):2d} probes={len(probes):2d} base={'ok' if base_ok else 'MISSING'}")
    return detail, ok


def main():
    ap = argparse.ArgumentParser(description="Load a game by slug without the UI.")
    ap.add_argument("slug", nargs="?", help="one slug to test; default = every scene")
    args = ap.parse_args()

    if not os.path.isdir(CASES_DIR):
        raise SystemExit(f"[test] cases dir not found: {os.path.abspath(CASES_DIR)} "
                         f"(run from the coordinator/ folder)")
    idx = index_cases(CASES_DIR)
    fails = 0

    print("===== id -> file mappings (the UI sends the id) =====")
    for slug, want in KNOWN_MAP.items():
        r = load_by_slug(idx, slug)
        got = os.path.basename(r[0]) if r else "(unresolved)"
        okm = got == want
        print(f"  {'OK  ' if okm else 'FAIL'}  {slug:12s} -> {got}  (want {want})")
        if not okm:
            fails += 1

    slugs = [args.slug] if args.slug else sorted(set(idx.keys()))
    print(f"\n===== load {len(slugs)} slug(s) =====")
    for slug in slugs:
        detail, ok = check(idx, slug)
        print(("  OK   " if ok else "  FAIL ") + detail)
        if not ok:
            fails += 1

    print(f"\n[test] RESULT: {'PASS' if fails == 0 else f'FAIL ({fails})'}")
    if fails:
        print("[test] a FAIL means a game the UI could pick would load empty (no identity/events/probes).",
              file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
