"""Agent / Game-Cartridge conformance tests for the `agent-test` scene.

Encodes the principles from Alberto Hojel's "In Search for the World Model Harness
for Gaming" (Roblox, May 2026) that this app's harness implements:

  - Decomposed conditioning: World / Character / Actions / Dynamics as separate
    layers (base / player / movement / camera) instead of one homogeneous prompt.
  - Prompt invariance: object placement anchored to LANDMARKS, invariant to WASD —
    "at the base of the tree", never "in front of the character".
  - Player vs director (engine) split: character actions vs world/state events.
  - Gated quest progression: a state machine advances via gated director events,
    with a reward event as the win condition.
  - VLM visual triggers: every world/action beat derives a yes/no probe (the VLM
    observer that grounds pixels back into abstract state).
  - Video-only: no audio-only description (the model has no sound).

Pure: no VLM / coordinator / network, NOT billed. Run: python test_agent_cartridge.py
"""
from __future__ import annotations

import json
import os
import sys

from scene_probes import _slug, derive_probes

HERE = os.path.dirname(os.path.abspath(__file__))
SCENE_PATH = os.path.join(HERE, "..", "..", "lib", "lingbot-cases", "agent-test.json")
GAME = json.load(open(SCENE_PATH, encoding="utf-8"))
SCENE = GAME["scene"]
EVENTS = SCENE["events"]
DIRECTOR = [e for e in EVENTS if e.get("actor") == "director"]
PLAYER = [e for e in EVENTS if e.get("actor", "player") == "player"]


def _detail(e: dict) -> str:
    det = e.get("detail")
    return det if isinstance(det, str) else (det or {}).get("static", "")


def test_decomposed_conditioning() -> None:
    # World / Character / Actions / Dynamics as SEPARATE layers, not one prompt.
    for layer in ("base", "player", "camera", "movement"):
        assert layer in SCENE and SCENE[layer], f"missing decomposed layer: {layer}"
    assert SCENE["base"].get("default"), "World (base.default) empty"
    assert SCENE["player"].get("default"), "Character (player.default) empty"


def test_player_director_split() -> None:
    # Character actions vs world/engine events must both exist and be tagged.
    assert PLAYER, "no player-action events"
    assert DIRECTOR, "no director (world) events"
    for e in PLAYER:
        assert e.get("actor", "player") == "player"
    for e in DIRECTOR:
        assert e.get("actor") == "director"


def test_prompt_invariance() -> None:
    # Object-appearance director events must anchor to a LANDMARK (invariant to WASD),
    # never place the object relative to the player. This is the core cartridge lesson.
    anchors = ("at the base of", "at a fixed position", "on the horizon",
               "on the left", "on the right", "straight ahead")
    banned = ("in front of the character", "in front of the explorer",
              "in front of you", "in front of the player", "in front of the subject",
              "ahead of the character", "ahead of the explorer")
    # The World layer must pin its landmarks at fixed positions (invariant to WASD).
    assert "at a fixed position" in SCENE["base"]["default"].lower(), \
        "base.default does not pin landmarks 'at a fixed position'"
    # Any object-APPEARANCE director event must anchor to a landmark, not the player
    # (scenes with no spawn-at-a-place events — e.g. tool actions — skip this cleanly).
    appear = [e for e in DIRECTOR if "appear" in e["name"].lower() or "portal" in e["name"].lower()]
    for e in appear:
        d = _detail(e).lower()
        assert any(a in d for a in anchors), f"{e['name']}: no landmark anchor (WASD-invariant placement)"
    for e in EVENTS:  # nothing may place an object relative to the player
        d = _detail(e).lower()
        for b in banned:
            assert b not in d, f"{e['name']}: player-relative placement '{b}' breaks invariance"


def test_gated_progression() -> None:
    # A state machine: at least one gated director beat, and the reward is gated.
    gated = [e for e in DIRECTOR if e.get("requires")]
    assert gated, "no gated director events — no progression"
    reward_name = GAME.get("objective", {}).get("reward")
    assert reward_name, "objective has no reward event"
    reward = next((e for e in DIRECTOR if e["name"] == reward_name), None)
    assert reward is not None, f"reward '{reward_name}' is not a director event"
    req = reward.get("requires", {})
    assert req.get("minChunks") or req.get("minHealth") or req.get("fired"), \
        "reward event is not gated (should require survival / progress)"


def test_vlm_visual_triggers() -> None:
    # Every world + action beat derives a yes/no probe — the VLM observer's checklist.
    probes = derive_probes(GAME, include_invariants=True, include_state=True)["probes"]
    ids = {p["id"] for p in probes}
    for e in DIRECTOR:
        assert _slug(e["name"]) in ids, f"no visual trigger derived for director event {e['name']}"
    for e in PLAYER:
        assert "doing_" + _slug(e["name"]) in ids, f"no action probe for player event {e['name']}"


def test_reward_objective() -> None:
    obj = GAME.get("objective", {})
    for k in ("summary", "director", "success", "failure", "durationChunks", "reward"):
        assert obj.get(k), f"objective missing {k}"
    assert isinstance(obj["durationChunks"], int) and obj["durationChunks"] > 0


def test_destroyed_object_disappears() -> None:
    # Destroyed / dropped / consumed objects must be described as GONE — an
    # autoregressive model keeps rendering an object that only "pops". Match events by
    # a destructive verb in the NAME (avoids flagging "fires a rifle") and require the
    # detail to say the object is gone/charred/stubble/dropped.
    gone = ("gone", "consumed", "vanish", "charred", "stubble", "blackened",
            "scorched", "drops", "empty-handed", "drains", "absorb")
    destructive = [e for e in EVENTS if any(
        k in e["name"].lower() for k in ("cut", "fire", "burn", "drop", "destroy", "break", "smash"))]
    assert destructive, "no destructive/consuming events to check"
    for e in destructive:
        d = _detail(e).lower()
        assert any(w in d for w in gone), f"{e['name']}: destroyed/dropped object not described as gone"


def test_diverse_actions() -> None:
    # The blog's locomotion/action rig — "diverse actions like jumping, sprinting,
    # swimming, emoting". The harness exposes these as vertical PLAYER actions
    # (Space jump / C crouch / release stand), a locomotion split in the movement
    # layer (idle vs moving = walk/sprint), and several DISTINCT hold-key interactions.
    assert SCENE.get("jumpPrompt", "").strip(), "no jump action (Space) — jumping unsupported"
    assert SCENE.get("crouchPrompt", "").strip(), "no crouch action (C held)"
    assert SCENE.get("standPrompt", "").strip(), "no stand action (C release)"
    mv = SCENE["movement"]["default"]
    assert isinstance(mv, dict) and mv.get("static", "").strip() and mv.get("dynamic", "").strip(), \
        "movement layer missing the idle/moving (locomotion) split"
    names = {e["name"].strip().lower() for e in PLAYER if e.get("name", "").strip()}
    assert len(names) >= 3, f"only {len(names)} distinct player actions — not a diverse action set"


def test_video_only_no_audio() -> None:
    # The model has no sound: no audio-only words anywhere in the scene prose.
    banned = ("roar", "cheer", "chant", "silence", "howl", "hiss", "scream",
              "applause", "whisper")
    blobs = [SCENE["base"]["default"], SCENE["player"]["default"]] + [_detail(e) for e in EVENTS]
    for txt in blobs:
        low = txt.lower()
        for b in banned:
            assert b not in low, f"audio-only word '{b}' in scene prose (video has no sound)"


def main() -> None:
    tests = [
        test_decomposed_conditioning, test_player_director_split, test_prompt_invariance,
        test_gated_progression, test_vlm_visual_triggers, test_reward_objective,
        test_destroyed_object_disappears, test_diverse_actions,
        test_video_only_no_audio,
    ]
    failures = 0
    for t in tests:
        try:
            t()
            print(f"  OK   {t.__name__}")
        except AssertionError as e:
            failures += 1
            print(f"  FAIL {t.__name__}: {e}")
    print(f"\n[agent-cartridge] RESULT: {'PASS' if not failures else f'FAIL ({failures})'}")
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
