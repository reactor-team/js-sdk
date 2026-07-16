"""Derive a yes/no VLM checklist FROM the game definition (lib/lingbot-cases/*.json).

The scene JSON is the single source: it both queries the VLM (the questions) and
updates state (the ops). See CONTRACT.md §6.3.

    director events      -> "Is this visible now?"            (presence observation)
    player actions       -> "Is the character doing this now?" (verify the action rendered)
    authored invariants  -> "Is it violated?"                 (re-anchor on yes)
    alt base versions    -> "Is the scene in this state?"     (state observation)

    derive_probes(scene) -> { "system": str, "probes": [ {id, q, onTrue?, onFalse?, observe?}, ... ] }

All questions are yes/no. Heuristic by design; the scene stays authoritative and a
hand-written probes_*.json can still override.
"""
import re

# If a marker appears in the scene's identity text, add a violation check whose YES
# answer means "the invariant is broken" and fires a corrective re-anchor assert.
_INVARIANT_RULES = [
    {"markers": ["never sink", "submerge", "underwater", "below the surface", "dips below"],
     "id": "submerged",
     "q": "Is the main subject or its vehicle submerged, sinking, or underwater?",
     "clause": "The subject stays up on the surface of the water, riding on top — not submerged or underwater."},
    {"markers": ["exactly one", "no duplicate", "no clone", "no second", "a single lone"],
     "id": "duplicate_subject",
     "q": "Is there more than one of the main subject — a duplicate, clone, or second copy?",
     "clause": "There is EXACTLY ONE main subject in frame — a single character, no duplicate and no clone."},
    {"markers": ["centred in frame", "exact centre", "clearly in view", "back to camera"],
     "id": "subject_out_of_frame",
     "q": "Is the main subject missing, off-screen, or not clearly visible?",
     "clause": "The main subject is re-centred in frame, clearly in view."},
]


def _first_sentence(text, n=90):
    s = re.split(r"(?<=[.!?])\s", (text or "").strip())
    return (s[0] if s else "")[:n]


def _slug(name):
    return re.sub(r"[^a-z0-9]+", "_", (name or "").lower()).strip("_")


def derive_probes(scene, include_player_actions=True, include_invariants=False,
                  include_state=False):
    """Build the yes/no checklist from the scene. Each director-event and player-action
    probe is TAGGED with its `requires` gate; the probe pass (make_probe) then asks only
    the ones whose gate is currently VALID (ungated events always; gated events once
    their predecessor has fired) — so the checklist tracks the live arc instead of
    statically dropping every gated beat. Category toggles:
      - `include_player_actions` (default ON) — "is the character doing X?" probes.
      - `include_invariants` (default OFF) — submerged / duplicate / off-frame checks
        that fire a corrective re-anchor on YES (the automatic consistency fixes).
      - `include_state` (default OFF) — alt base-version state probes (e.g. overboard)."""
    sc = scene.get("scene", scene)  # accept a full example or a bare scene
    base = sc.get("base", {}) or {}
    probes = []

    # Invariant scan spans all base versions + default camera framing.
    parts = [v for v in base.values() if isinstance(v, str)]
    cam = (sc.get("camera", {}) or {}).get("default", {})
    if isinstance(cam, dict):
        parts += [cam.get("static", ""), cam.get("dynamic", "")]
    low = " ".join(parts).lower()

    # alt base versions -> "is the scene in this state?"
    if include_state:
        for v in base:
            if v in ("default", "empty"):
                continue
            probes.append({"id": f"state_{v}",
                           "q": f"Is the scene in the '{v}' state — {_first_sentence(base[v], 70)}",
                           "observe": f"state:{v}"})

    # invariants -> violation check (re-anchor on yes)
    if include_invariants:
        for r in _INVARIANT_RULES:
            if any(m in low for m in r["markers"]):
                probes.append({"id": r["id"], "q": r["q"],
                               "onTrue": {"op": "assert", "key": "fix:" + r["id"], "clause": r["clause"]},
                               "observe": r["id"]})

    # director events -> presence observation, TAGGED with the event's gate. The probe
    # pass asks it only when the gate is currently valid (ungated -> always; gated ->
    # once its predecessor has fired), so locked beats aren't probed until they unlock.
    for e in sc.get("events", []) or []:
        if e.get("actor") != "director":
            continue
        det = e.get("detail")
        gloss = _first_sentence(det if isinstance(det, str) else (det or {}).get("static", ""), 90)
        probes.append({"id": _slug(e.get("name", "")),
                       "q": f"Is this visible in the frame now: {gloss}",
                       "observe": _slug(e.get("name", "")),
                       "requires": e.get("requires")})

    # player actions (actor "player" or unset default) -> "is the character doing this
    # now?" observation. Same gate tag — a locked action can't be happening yet.
    if include_player_actions:
        for e in sc.get("events", []) or []:
            if e.get("actor", "player") != "player":
                continue
            det = e.get("detail")
            gloss = _first_sentence(det if isinstance(det, str) else (det or {}).get("static", ""), 90)
            pid = "doing_" + _slug(e.get("name", ""))  # "doing_" avoids colliding with "Player X" director-event slugs
            probes.append({"id": pid,
                           "q": f"Is the main character performing this action right now: {gloss}",
                           "observe": pid,
                           "requires": e.get("requires")})

    system = ("You are a visual state checker. Answer each question true or false about the "
              "image. Respond with ONLY a JSON object mapping each id to true or false.")
    return {"system": system, "probes": probes}


# --- applying the answers (the other half: JSON -> state update) ---------------

def _op_to_coordinator(op):
    """Translate a probe's declarative op into a coordinator wire op (CONTRACT §3)."""
    k = op.get("op")
    if k == "assert":
        return {"op": "assert", "role": "ai",
                "fact": {"key": op["key"], "clause": op["clause"],
                         "weight": op.get("weight", 2), "life": {"kind": "sustained"}}}
    if k == "retract":
        return {"op": "retract", "role": "ai", "key": op["key"]}
    if k == "vital":
        return {"op": "vital", "role": "ai", "change": op["change"]}
    if k == "fire":
        return {"op": "assert", "role": "ai",
                "fact": {"key": "scene:" + op["event"].lower().replace(" ", "_"),
                         "clause": op["clause"], "weight": 2, "life": {"kind": "sustained"}}}
    raise ValueError(f"unknown op: {k!r}")


def resolve(answers, probes):
    """answers {id: bool} + probes -> (coordinator ops, observations {predicate: bool}).

    ops go to the coordinator; observations are the flat bool state the scene declares.
    """
    ops, obs = [], {}
    for p in probes:
        val = bool(answers.get(p["id"], False))
        if p.get("observe"):
            obs[p["observe"]] = val
        branch = p.get("onTrue") if val else p.get("onFalse")
        if branch:
            ops.append(_op_to_coordinator(branch))
    return ops, obs
