"""Pure unit tests for scene_probes.py — the derive/resolve half of the probe path.

No VLM, no coordinator, no network, NOT billed. Locks in the tri-state answer
handling, the unknown = "don't update state" rule, the word-boundary gloss cut,
and the player-layer invariant fold. Run: python test_scene_probes.py
"""
from __future__ import annotations

import sys

from scene_probes import _first_sentence, _tri, derive_probes, resolve


def test_tri() -> None:
    # Clean yes/no -> bool; everything else (incl. the literal "unknown") -> None.
    assert _tri(True) is True
    assert _tri(False) is False
    assert _tri("true") is True
    assert _tri("YES") is True
    assert _tri("false") is False
    assert _tri("no") is False
    assert _tri("unknown") is None  # the bug guard: bool("unknown") is True
    assert _tri(None) is None
    assert _tri("maybe") is None
    assert _tri(1) is None  # ints are not clean bools (1 is True -> False)


def test_resolve_unknown_omits() -> None:
    probes = [
        {"id": "a", "observe": "a", "onTrue": {"op": "assert", "key": "fix:a", "clause": "ca"}},
        {"id": "b", "observe": "b", "onFalse": {"op": "assert", "key": "fix:b", "clause": "cb"}},
        {"id": "c", "observe": "c"},  # answered "unknown"
        {"id": "d", "observe": "d"},  # missing from answers entirely
    ]
    ops, obs = resolve({"a": True, "b": False, "c": "unknown"}, probes)
    # unknown (c) and missing (d) update NOTHING; a/b recorded.
    assert obs == {"a": True, "b": False}, obs
    keys = sorted(o["fact"]["key"] for o in ops)  # a's onTrue + b's onFalse fire
    assert keys == ["fix:a", "fix:b"], keys


def test_first_sentence_word_boundary() -> None:
    assert _first_sentence("A short clause.") == "A short clause."
    assert _first_sentence("First one. Second one.") == "First one."  # first sentence only
    assert _first_sentence(None) == ""
    # A long single sentence must cut at a WORD boundary (never mid-word) + ellipsis.
    long = "A single tall upright rigid sharply pointed dorsal fin standing straight up ahead"
    out = _first_sentence(long, 40)
    assert out.endswith("…"), out
    body = out[:-1]  # drop the ellipsis
    assert len(body) <= 40, (len(body), out)
    assert not body.endswith(" "), out  # trimmed, no dangling space
    assert long.startswith(body), out  # body is a real prefix
    assert long[len(body)] == " ", "cut landed mid-word"  # next original char is a space


def test_player_fold_invariant() -> None:
    # Post-split shape: the SUBJECT (and its markers) live in `player`, not `base`.
    scene = {"scene": {
        "base": {"default": "A calm open sea, turquoise water, bright sun."},  # no subject markers
        "player": {"default": "A lone rider on a jet ski. EXACTLY ONE rider — "
                              "a single lone person, no duplicate and no clone."},
        "events": [],
    }}
    ids = {p["id"] for p in derive_probes(scene, include_invariants=True)["probes"]}
    assert "duplicate_subject" in ids, ids  # restored by folding player into the scan
    # Control: no subject markers anywhere -> the invariant is NOT derived.
    plain = {"scene": {"base": {"default": "A calm open sea."},
                       "player": {"default": "A rider."}, "events": []}}
    ids2 = {p["id"] for p in derive_probes(plain, include_invariants=True)["probes"]}
    assert "duplicate_subject" not in ids2, ids2


def main() -> None:
    tests = [test_tri, test_resolve_unknown_omits,
             test_first_sentence_word_boundary, test_player_fold_invariant]
    failures = 0
    for t in tests:
        try:
            t()
            print(f"  OK   {t.__name__}")
        except AssertionError as e:
            failures += 1
            print(f"  FAIL {t.__name__}: {e}")
    print(f"\n[scene_probes] RESULT: {'PASS' if not failures else f'FAIL ({failures})'}")
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
