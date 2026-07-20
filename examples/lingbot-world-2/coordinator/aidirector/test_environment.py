"""Environment / director scene-control tests for the `movement-test` scene.

Checks the blog's scene-control capabilities — "changing the scene composition,
adding or removing objects; NPCs; physics-level control" — as director events that
each persist a world change: ADD objects (cars), TRANSFORM existing objects
(billboards -> neon), CHANGE an object's state (traffic light -> red), stage a HAZARD
(car crash / flood), ADD water (flood -> enables swim/dive), and change PHYSICS
(low gravity). Pure: no VLM / coordinator / network, NOT billed.

Run: python test_environment.py
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


def _detail(e: dict) -> str:
    det = e.get("detail")
    return det if isinstance(det, str) else (det or {}).get("static", "")


def _blob(e: dict) -> str:
    return (e.get("name", "") + " " + _detail(e)).lower()


def test_add_objects() -> None:
    # Director can ADD objects to the world (cars / traffic).
    assert any(w in _blob(e) for e in DIRECTOR
               for w in ("car", "traffic", "vehicle", "truck", "taxi")), \
        "no director event that adds cars/traffic"


def test_transform_objects() -> None:
    # Director can CHANGE the composition of existing objects, persisted via a base swap
    # (e.g. billboards -> neon).
    assert any(e.get("baseVersion") and any(w in _blob(e)
               for w in ("neon", "transform", "turn", "change", "becomes"))
               for e in DIRECTOR), "no director event that recomposes objects (via baseVersion)"


def test_object_state_change() -> None:
    # Director can flip an existing object's STATE (e.g. traffic light -> red).
    assert any(("light" in _blob(e) and "red" in _blob(e)) or "traffic light" in _blob(e)
               for e in DIRECTOR), "no director event that changes an object's state"


def test_hazard() -> None:
    # Director can stage a persistent HAZARD / accident (crash, flood, ...).
    assert any(w in _blob(e) for e in DIRECTOR
               for w in ("crash", "collide", "flood", "wreck", "accident", "fire", "explos")), \
        "no director hazard/accident event"


def test_add_water_enables_swim() -> None:
    # Director can ADD water (a flood), and swim/dive player actions gate on it.
    flood = [e for e in DIRECTOR if "flood" in _blob(e) or "water" in _detail(e).lower()]
    assert flood, "no director event that adds water"
    flood_names = {e["name"] for e in flood}
    swim = [e for e in EVENTS if e.get("actor", "player") == "player"
            and any(w in _blob(e) for w in ("swim", "dive", "wade"))]
    assert swim, "flood adds water but no swim/dive action uses it"
    assert any(set(e.get("requires", {}).get("fired", [])) & flood_names for e in swim), \
        "swim/dive action is not gated on the flood"


def test_physics_control() -> None:
    # Director physics-level control (gravity), persisted via a movement/base version swap.
    phys = [e for e in DIRECTOR if (e.get("movementVersion") or e.get("baseVersion"))
            and any(w in _blob(e) for w in ("gravity", "weightless", "float", "slow motion"))]
    assert phys, "no director physics event persisting a version swap"


def main() -> None:
    tests = [test_add_objects, test_transform_objects, test_object_state_change,
             test_hazard, test_add_water_enables_swim, test_physics_control]
    failures = 0
    print("== ENVIRONMENT (director scene control) ==")
    for t in tests:
        try:
            t()
            print(f"  OK   {t.__name__}")
        except AssertionError as e:
            failures += 1
            print(f"  FAIL {t.__name__}: {e}")
    print(f"\n[environment] RESULT: {'PASS' if not failures else f'FAIL ({failures})'}")
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
