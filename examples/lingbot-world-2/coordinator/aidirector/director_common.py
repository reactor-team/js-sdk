"""Shared AI-Director loop, backend-agnostic. A backend supplies one function:

    decide(frame: PIL.Image, system_prompt: str) -> str   # the model's raw reply

run_director() watches the latest-frame file, builds the invariant-bounded
system prompt from the scene + live state, calls decide(), parses the JSON, and
emits assert/vital ops (role="ai") to the coordinator. Backend: director_nim.py
(NVIDIA NIM inference).
"""
import asyncio
import json
import os

import websockets
from PIL import Image

from scene_probes import derive_probes, resolve
from client import MODELS, resolve_model, parse_json  # noqa: F401  re-exported (shared plumbing)

# The Director's charter. The AI Director has the SAME action set as the human
# Director: it may ONLY trigger the scene's authored director events (by name) —
# it does not invent free-form prose. The authored clause + vitals are applied
# exactly as the human's scene buttons do.
SYSTEM_TEMPLATE = """You are the DIRECTOR of a real-time interactive world. A video model renders \
the world; you steer it by triggering pre-authored events at the right moments.

THE WORLD (identity — never contradict this):
{base}

OBJECTIVE — build the world toward this over time, don't just react frame-by-frame:
{objective}

You have already fired these events this session (build ON them; don't just repeat):
{memory}
Elapsed: {step} chunks.

You may ONLY trigger events from this list — the SAME set the human director has.
Do NOT invent new events or write your own prose:
{events_list}

RULES:
- Trigger an event only when it is PLAUSIBLE and fitting given what is visible in the frame and the objective.
- If the Current world facts or Verified observations show an event is ALREADY in progress, do NOT
  fire it again or stack a competing one — return an empty list and let the current event play out.
- Choose 0-2 events. An empty list is correct when nothing should change yet.

Respond with ONLY a JSON object, no prose:
{{"events": ["<exact event name from the list>"]}}

Current world facts: {facts}
Verified observations (from probes — what is ACTUALLY on screen now; trust these over your own read): {observed}
Current health: {health}"""

USER_TEXT = "Here is the latest frame. Choose which authored events to fire, as JSON only."

# User text for a probe (checklist) call — the derived questions are appended after it.
PROBE_USER = ("Answer each of these yes/no questions about the image. Respond with ONLY a "
              "JSON object mapping each id to true or false.")


def make_probe(vlm, scene_json, debug=False):
    """Build a probe(frame) -> (ops, observations) from the FULL scene JSON.

    Reuses the backend's vlm(frame, system, user_text) call. Derives the typed
    checklist once (scene_probes.derive_probes), asks it in ONE call per frame, and
    resolves answers into coordinator ops (invariant re-anchors) + a flat observation
    map. This is the AI director's eyes — grounding/verification, not a driving path.
    """
    derived = derive_probes(scene_json)
    probes = derived["probes"]
    questions = "\n".join(f'- {p["id"]}: {p["q"]}' for p in probes)
    user = PROBE_USER + "\n\n" + questions
    if debug:
        print(f"[director:dbg] probe checklist derived: {len(probes)} questions", flush=True)
        for p in probes:
            print(f"[director:dbg]   ? {p['id']}: {p['q']}", flush=True)

    def probe(frame):
        raw = vlm(frame, derived["system"], user, 512)
        answers = parse_json(raw) or {}
        ops, obs = resolve(answers, probes)
        if debug:
            print(f"[director:dbg] probe raw reply: {raw[:600]}", flush=True)
            trues = [k for k, v in answers.items() if v]
            print(f"[director:dbg] probe answers (true): {trues or '(none)'}", flush=True)
            print(f"[director:dbg] probe observations: {obs}", flush=True)
            print(f"[director:dbg] probe -> {len(ops)} re-anchor op(s): {ops}", flush=True)
        return ops, obs

    return probe


def load_scene(path):
    if not path or not os.path.exists(path):
        return {"base": "An interactive world.", "dir_events": [], "objective": ""}
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    scene = data.get("scene", {})
    base = (scene.get("base", {}) or {}).get("default", "An interactive world.")
    # The director's action set = the scene's DIRECTOR-owned events (same buttons
    # the human sees). Each carries its authored clause + optional vitals.
    dir_events = []
    for e in scene.get("events", []):
        if e.get("actor") != "director":
            continue
        det = e.get("detail")
        clause = det if isinstance(det, str) else (det or {}).get("static", "")
        dir_events.append(
            {"name": e.get("name", ""), "clause": clause,
             "health": e.get("health"), "addItem": e.get("addItem")}
        )
    obj = data.get("objective") or {}
    director_goal = obj.get("director") or obj.get("summary") or ""
    return {"base": base, "dir_events": dir_events, "objective": director_goal}


def build_system(scene, state):
    fired = state.get("fired") or []
    dir_events = scene.get("dir_events") or []
    events_list = (
        "\n".join(
            f'- "{e["name"]}": {e["clause"][:90]}' for e in dir_events if e["name"]
        )
        or "(this scene has no director events)"
    )
    obs = state.get("observations") or {}
    observed = ", ".join(f"{k}={'yes' if v else 'no'}" for k, v in obs.items()) or "(no probe read yet)"
    return SYSTEM_TEMPLATE.format(
        base=scene["base"],
        events_list=events_list,
        objective=scene.get("objective") or "(no explicit objective — keep the scene alive and coherent)",
        memory=", ".join(fired) or "(none yet)",
        step=state.get("step", 0),
        facts=state.get("facts") or "(none)",
        observed=observed,
        health=state.get("health", "?"),
    )


async def run_director(decide, url, frame_path, scene, interval, once, probe=None, debug=False):
    # Latest state pushed by the coordinator (facts + vitals) for prompt context.
    # `fired` = short memory of the arc (event names introduced); `step` = pacing.
    # `observations` = the probe read of the current frame (the AI director's eyes).
    state = {"facts": "", "health": 100, "fired": [], "step": 0, "observations": {}}
    last_key_clause = {}  # dedup: only re-assert when a key's clause changes
    last_mtime = 0.0
    last_idle_msg = None  # throttle: only re-print an idle reason when it changes

    def dbg(*a):
        if debug:
            print("[director:dbg]", *a, flush=True)

    dbg(f"config: url={url} frame={os.path.abspath(frame_path)} interval={interval}s "
        f"probe={'on' if probe else 'off'} events={len(scene.get('dir_events') or [])}")

    async with websockets.connect(url) as ws:
        print(f"[director] connected to {url}", flush=True)

        async def listen():
            async for raw in ws:
                try:
                    m = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if m.get("type") == "facts":
                    state["facts"] = m.get("prompt", "")
                    dbg(f"<- facts: {(m.get('prompt') or '')[:160]}")
                elif m.get("type") == "vitals":
                    state["health"] = m.get("health", state["health"])
                    dbg(f"<- vitals: health={state['health']}")
                elif m.get("type") == "mode":
                    dbg(f"<- mode: {m.get('mode')}")

        listener = asyncio.create_task(listen())
        try:
            while True:
                # Frame source: the file, only when it changed since last look.
                if not os.path.exists(frame_path):
                    # This is the usual "no action" cause: cloud video never writes
                    # the frame tap, so the director has nothing to look at.
                    reason = f"idle: frame not found at {os.path.abspath(frame_path)} " \
                             f"(cloud video? the frame tap needs the LOCAL backend)"
                    if reason != last_idle_msg:
                        dbg(reason)
                        last_idle_msg = reason
                else:
                    mtime = os.path.getmtime(frame_path)
                    if mtime == last_mtime:
                        reason = f"idle: frame unchanged (mtime={mtime:.0f}); waiting for a new frame"
                        if reason != last_idle_msg:
                            dbg(reason)
                            last_idle_msg = reason
                    else:
                        last_idle_msg = None
                        last_mtime = mtime
                        state["step"] += 1  # one look = one chunk of pacing
                        try:
                            frame = Image.open(frame_path).convert("RGB")
                        except OSError as e:
                            dbg(f"frame open failed: {e}")
                            await asyncio.sleep(interval)
                            continue
                        dbg(f"=== step {state['step']}: new frame {frame.width}x{frame.height} "
                            f"health={state['health']} fired={state['fired'] or '(none)'} ===")
                        # Probes first (the AI director's eyes): read the frame into a
                        # verified observation map, and emit any invariant re-anchor ops
                        # (subject off-frame, duplicate, submerged) before deciding.
                        if probe is not None:
                            try:
                                p_ops, p_obs = probe(frame)
                                state["observations"] = p_obs
                                for op in p_ops:
                                    dbg(f"-> probe op: {json.dumps(op)}")
                                    await ws.send(json.dumps(op))
                            except Exception as e:  # noqa: BLE001 — probes are best-effort
                                print(f"[director] probe error: {type(e).__name__}: {e}", flush=True)
                        system_text = build_system(scene, state)
                        if debug:
                            dbg(f"decide system prompt ({len(system_text)} chars):")
                            print(system_text, flush=True)
                        try:
                            raw = decide(frame, system_text)
                        except Exception as e:  # noqa: BLE001 — surface to the feed
                            msg = f"{type(e).__name__}: {e}"
                            print(f"[director] VLM error: {msg}", flush=True)
                            await ws.send(
                                json.dumps({"op": "log", "role": "ai", "cmd": "error", "detail": msg})
                            )
                            await asyncio.sleep(interval)
                            continue
                        dbg(f"decide raw reply: {raw!r}")
                        result = parse_json(raw)
                        dbg(f"decide parsed: {result}")
                        if raw and result is None:
                            dbg("decide reply did NOT parse as JSON")
                            await ws.send(
                                json.dumps({"op": "log", "role": "ai", "cmd": "error",
                                            "detail": "VLM returned unparseable JSON"})
                            )
                        if result:
                            # The AI may ONLY fire the scene's authored director
                            # events (by name) — same as the human's scene buttons.
                            by_name = {
                                e["name"].lower(): e for e in (scene.get("dir_events") or [])
                            }
                            wanted = result.get("events", []) or []
                            dbg(f"decide wants to fire: {wanted or '(nothing)'}")
                            for name in wanted:
                                ev = by_name.get(str(name).strip().lower())
                                if not ev or not ev["clause"]:
                                    dbg(f"  drop '{name}': not an authored director event")
                                    continue
                                # Mirror the human fireEvent: key = scene:<slug>.
                                key = "scene:" + ev["name"].lower().replace(" ", "_")
                                if last_key_clause.get(key) == ev["clause"]:
                                    dbg(f"  skip '{ev['name']}': already active (same clause)")
                                    continue  # already active — skip
                                last_key_clause[key] = ev["clause"]
                                assert_op = {
                                    "op": "assert", "role": "ai",
                                    "fact": {"key": key, "clause": ev["clause"],
                                             "weight": 2, "life": {"kind": "sustained"}},
                                }
                                dbg(f"-> assert: {json.dumps(assert_op)}")
                                await ws.send(json.dumps(assert_op))
                                if ev.get("health") is not None or ev.get("addItem"):
                                    change = {}
                                    if ev.get("health") is not None:
                                        change["health"] = ev["health"]
                                    if ev.get("addItem"):
                                        change["addItem"] = ev["addItem"]
                                    vital_op = {"op": "vital", "role": "ai", "change": change}
                                    dbg(f"-> vital: {json.dumps(vital_op)}")
                                    await ws.send(json.dumps(vital_op))
                                # Remember the arc (cap so the prompt stays small).
                                state["fired"].append(ev["name"])
                                state["fired"] = state["fired"][-8:]
                                print(f"[director] fire {ev['name']}", flush=True)
                        if once:
                            break
                await asyncio.sleep(interval)
        finally:
            listener.cancel()
