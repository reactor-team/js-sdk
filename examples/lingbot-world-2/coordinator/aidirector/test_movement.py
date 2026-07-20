"""Movement / locomotion-rig tests for the `movement-test` scene.

Checks the blog's movement capabilities — "agile locomotion: 1st/3rd person, jumping,
sprinting, swimming, emoting" — as exposed by the harness: a third-person camera rig,
vertical actions (jump / crouch / stand), an idle-vs-moving locomotion split, and
sprint / emote / swim / dive player actions. Director scene control is a SEPARATE test
(test_environment.py). Pure: no VLM / coordinator / network, NOT billed.

Run: python test_movement.py
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = json.load(open(os.path.join(HERE, "..", "..", "lib", "lingbot-cases", "movement-test.json"), encoding="utf-8"))
SCENE = GAME["scene"]
EVENTS = SCENE["events"]
DIRECTOR = [e for e in EVENTS if e.get("actor") == "director"]
PLAYER = [e for e in EVENTS if e.get("actor", "player") == "player"]


def _detail(e: dict) -> str:
    det = e.get("detail")
    return det if isinstance(det, str) else (det or {}).get("static", "")


def test_third_person_camera() -> None:
    cam = SCENE["camera"]["default"]
    assert cam.get("static", "").strip() and cam.get("dynamic", "").strip(), "camera missing static/dynamic"
    assert "first-person" in (cam["static"] + cam["dynamic"]).lower(), \
        "camera does not assert perspective (never a first-person view)"


def test_vertical_actions() -> None:
    for k in ("jumpPrompt", "crouchPrompt", "standPrompt"):
        assert SCENE.get(k, "").strip(), f"missing vertical action {k}"


def test_locomotion_split() -> None:
    mv = SCENE["movement"]["default"]
    assert mv.get("static", "").strip() and mv.get("dynamic", "").strip(), \
        "movement layer missing the idle/moving (locomotion) split"


def test_sprint_action() -> None:
    assert any(w in (e["name"] + " " + _detail(e)).lower()
               for e in PLAYER for w in ("sprint", "run", "dash")), \
        "no sprint/run locomotion action"


def test_emote_action() -> None:
    assert any(w in (e["name"] + " " + _detail(e)).lower()
               for e in PLAYER for w in ("wave", "emote", "dance", "point", "gesture", "salute")), \
        "no emote action"


def test_swim_action() -> None:
    # Swimming — a locomotion modifier. A dry street has no water, so it's paired with a
    # director flood event (scene control adds the water).
    swim = [e for e in PLAYER if any(w in (e["name"] + " " + _detail(e)).lower()
                                     for w in ("swim", "wade", "stroke"))]
    assert swim, "no swim action"
    assert any("flood" in (e["name"] + " " + _detail(e)).lower() or "water" in _detail(e).lower()
               for e in DIRECTOR), "swim action with no director event that adds water"


def test_dive_action() -> None:
    # Diving — an underwater locomotion action; like Swim it needs water (director flood).
    dive = [e for e in PLAYER if any(w in (e["name"] + " " + _detail(e)).lower()
                                     for w in ("dive", "dives", "submerge", "underwater"))]
    assert dive, "no dive action"
    assert any("flood" in (e["name"] + " " + _detail(e)).lower() or "water" in _detail(e).lower()
               for e in DIRECTOR), "dive action with no director event that adds water"


def main() -> None:
    tests = [test_third_person_camera, test_vertical_actions, test_locomotion_split,
             test_sprint_action, test_emote_action, test_swim_action, test_dive_action]
    failures = 0
    print("== MOVEMENT (player locomotion rig) ==")
    for t in tests:
        try:
            t()
            print(f"  OK   {t.__name__}")
        except AssertionError as e:
            failures += 1
            print(f"  FAIL {t.__name__}: {e}")
    print(f"\n[movement] RESULT: {'PASS' if not failures else f'FAIL ({failures})'}")
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
