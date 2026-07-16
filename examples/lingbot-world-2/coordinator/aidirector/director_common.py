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
- Fire AT MOST ONE event: return either an empty list [] or a SINGLE event. NEVER more than one.
  Most of the time an empty list is correct — only fire when the moment genuinely calls for it.

Respond with ONLY a JSON object, no prose (0 or 1 event):
{{"events": ["<single exact event name from the list>"]}}

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


def _norm_name(s):
    """Normalize an event name for matching: the model may reply with the display
    name ("Gold Coin Appears") OR the slug form ("gold_coin_appears") — treat them
    the same by lowercasing and unifying underscores/spaces."""
    return str(s).strip().lower().replace("_", " ")


def _event_summary(clause):
    """Distinct one-liner for the candidate list. Strips the shared "explorer
    unchanged … ONLY the world … changes:" boilerplate so each event reads
    differently (else clause[:N] is identical for every event and the model
    can't tell them apart)."""
    idx = clause.find("changes:")
    text = clause[idx + len("changes:"):].strip() if idx != -1 else clause
    return text[:130]


def build_system(scene, state):
    fired = state.get("fired") or []
    fired_lower = {f.lower() for f in fired}
    dir_events = scene.get("dir_events") or []
    # Prefer events NOT already fired this session so the arc actually ADVANCES
    # (don't just re-offer an already-active event). If everything has fired,
    # reopen the full list so repeats become allowed again.
    available = [e for e in dir_events if e["name"] and e["name"].lower() not in fired_lower]
    if not available:
        available = [e for e in dir_events if e["name"]]
    events_list = (
        "\n".join(f'- "{e["name"]}": {_event_summary(e["clause"])}' for e in available)
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


async def run_director(decide, url, frame_path, scene, interval, once, probe=None, debug=False,
                       reload_game=None, hello_extra=None, model_check=None, fire_cooldown=0):
    # Latest state pushed by the coordinator (facts + vitals) for prompt context.
    # `fired` = short memory of the arc (event names introduced); `step` = pacing.
    # `observations` = the probe read of the current frame (the AI director's eyes).
    state = {"facts": "", "health": 100, "fired": [], "step": 0, "observations": {}}
    # Probe lives in a holder so a game switch (see the "game" message) can swap it.
    pstate = {"probe": probe}
    # Model-server health: the director starts only when the model is reachable
    # (director_nim exits otherwise); if a decide later fails AND model_check() confirms
    # the server is down, we unload the game and STOP (see the decide error handler).
    last_fire_step = -(10 ** 9)  # for --fire-cooldown: don't fire again within N chunks
    last_key_clause = {}  # dedup: only re-assert when a key's clause changes
    last_mtime = 0.0
    last_idle_msg = None  # throttle: only re-print an idle reason when it changes

    def dbg(*a):
        if debug:
            print("[director:dbg]", *a, flush=True)

    dbg(f"config: url={url} frame={os.path.abspath(frame_path)} interval={interval}s "
        f"probe={'on' if probe else 'off'} events={len(scene.get('dir_events') or [])}")

    # No coordinator -> no billed decisions. If we can't reach it, exit cleanly
    # (don't crash with a traceback, and don't spend a single NVIDIA call).
    try:
        ws = await websockets.connect(url)
    except Exception as e:  # noqa: BLE001 — any connect failure means "no server"
        print(f"[director] cannot reach coordinator at {url}: {type(e).__name__}: {e}", flush=True)
        print("[director] NOT starting — the director makes no billed decisions without a coordinator. "
              "Start it (run_coordinator.bat / start.bat) and relaunch.", flush=True)
        return

    connected = {"ok": True}  # flipped False when the socket closes (see listen())
    async with ws:
        print(f"[director] connected to {url}", flush=True)
        # register as the AI director (+ report model reachability so the coordinator shows it)
        await ws.send(json.dumps({"op": "hello", "role": "ai", **(hello_extra or {})}))
        # A "game" = the active scene + objective. Log the start of this one, and
        # remember its objective so a later change (UI switched games) is detected.
        state["objective_summary"] = scene.get("objective") or ""
        print(f"[director] === GAME START === {scene.get('objective') or '(no objective)'}", flush=True)

        async def listen():
            try:
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
                    elif m.get("type") == "game":
                        # The UI selected a game. Reload that FULL scene file (identity +
                        # events + probe checklist) so we truly follow the UI, not just
                        # swap the event list. reload_game() returns (scene, probe)|None.
                        slug = m.get("slug") or ""
                        if not slug and state.get("game_slug"):
                            # UNLOAD: back to no game — revert to the empty startup scene,
                            # drop probes, reset the arc, clear the feed pointer.
                            scene.clear()
                            scene.update(load_scene(""))
                            pstate["probe"] = None
                            state["game_slug"] = ""
                            state["objective_summary"] = ""
                            state["fired"] = []
                            state["step"] = 0
                            last_key_clause.clear()
                            try:
                                if os.path.exists("active_game.txt"):
                                    os.remove("active_game.txt")
                            except OSError:
                                pass
                            print("[director] === GAME UNLOADED === (idle, waiting for a game)", flush=True)
                        elif slug and slug != state.get("game_slug") and reload_game is not None:
                            loaded = reload_game(slug)
                            if loaded:
                                new_scene, new_probe, img_path = loaded
                                scene.clear()
                                scene.update(new_scene)
                                pstate["probe"] = new_probe
                                state["game_slug"] = slug
                                state["objective_summary"] = scene.get("objective") or ""
                                state["fired"] = []
                                state["step"] = 0
                                last_key_clause.clear()
                                try:
                                    # the frame-feed loop reads this to feed the matching still
                                    with open("active_game.txt", "w", encoding="utf-8") as f:
                                        f.write(img_path)
                                except OSError:
                                    pass
                                print(f"[director] === GAME START === {slug}: "
                                      f"{scene.get('objective') or '(no objective)'} "
                                      f"({len(scene.get('dir_events') or [])} events, "
                                      f"probes={'on' if new_probe else 'off'})", flush=True)
                            else:
                                dbg(f"game '{slug}': scene file not found — keeping current")
                    elif m.get("type") == "scene_events":
                        # The Player publishes the active scene's director events; rebuild
                        # our action set from them so a UI game switch retargets us live
                        # (without this, we'd keep firing the launch scene's events).
                        evs = m.get("events") or []
                        scene["dir_events"] = [
                            {"name": e.get("name", ""), "clause": e.get("clause", ""),
                             "health": e.get("health"), "addItem": e.get("addItem")}
                            for e in evs if e.get("name")
                        ]
                        dbg(f"<- scene_events: {len(scene['dir_events'])} events -> {[e['name'] for e in scene['dir_events']]}")
                    elif m.get("type") == "objective":
                        obj = m.get("objective") or {}
                        summ = (obj.get("director") or obj.get("summary") or "") if isinstance(obj, dict) else ""
                        if summ != state.get("objective_summary"):
                            # Game changed -> retarget objective, reset arc, announce it.
                            state["objective_summary"] = summ
                            scene["objective"] = summ  # build_system reads this
                            state["fired"] = []
                            state["step"] = 0
                            last_key_clause.clear()
                            print(f"[director] === GAME START === {summ or '(no objective)'}", flush=True)
            finally:
                connected["ok"] = False  # socket closed -> stop deciding (no billing)

        listener = asyncio.create_task(listen())
        try:
            while True:
                # No coordinator -> stop: don't spend a single NVIDIA call with
                # nowhere to send the result.
                if not connected["ok"]:
                    print("[director] coordinator disconnected — stopping (no billed "
                          "decisions without a server).", flush=True)
                    break
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
                        # MODEL GATE: never spend a VLM call (probe or decide) while the
                        # model server is unreachable. If it was down, re-probe (free) first.
                        # No game loaded -> no authored events to fire and no probe checklist,
                        # so don't decide (the model would just invent events that all get
                        # dropped). Wait for a game to be picked in the UI. No billing.
                        if not (scene.get("dir_events") or []):
                            reason = "idle: no game loaded — pick a game in the UI (not deciding, no billing)"
                            if reason != last_idle_msg:
                                print(f"[director] {reason}", flush=True)
                                last_idle_msg = reason
                            await asyncio.sleep(interval)
                            continue
                        # NOTE: the fire-cooldown is applied at the FIRE step below, NOT here —
                        # the director still probes + decides (evaluates the image) every frame;
                        # cooldown only suppresses actually firing, so its eyes stay open.
                        # Probes first (the AI director's eyes): read the frame into a
                        # verified observation map, and emit any invariant re-anchor ops
                        # (subject off-frame, duplicate, submerged) before deciding.
                        if pstate["probe"] is not None:
                            try:
                                p_ops, p_obs = pstate["probe"](frame)
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
                            # Distinguish a transient error from a real model disconnect.
                            if model_check is not None and not model_check():
                                # Model server is DOWN -> unload the game and STOP the director.
                                print("[director] model server disconnected — unloading game and "
                                      "stopping the AI director.", flush=True)
                                try:
                                    await ws.send(json.dumps({"op": "game", "role": "ai", "slug": ""}))
                                except Exception:  # noqa: BLE001
                                    pass
                                break
                            # transient — surface it and keep going
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
                                _norm_name(e["name"]): e for e in (scene.get("dir_events") or [])
                            }
                            wanted = (result.get("events", []) or [])[:1]  # hard cap: at most ONE event
                            dbg(f"decide wants to fire: {wanted or '(nothing)'}")
                            # Fire-cooldown: the image WAS evaluated (probe+decide ran above);
                            # we just pace the actual firing so it doesn't fire every frame.
                            if wanted and fire_cooldown and (state["step"] - last_fire_step) < fire_cooldown:
                                wait = fire_cooldown - (state["step"] - last_fire_step)
                                dbg(f"  cooldown: would fire {wanted[0]!r} but {wait} chunk(s) left — holding")
                                wanted = []
                            for name in wanted:
                                ev = by_name.get(_norm_name(name))
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
                                    vital_op = {"op": "vital", "role": "ai", "change": change,
                                                "name": ev["name"]}  # show the event on the vital row
                                    dbg(f"-> vital: {json.dumps(vital_op)}")
                                    await ws.send(json.dumps(vital_op))
                                # Remember the arc (cap so the prompt stays small).
                                state["fired"].append(ev["name"])
                                state["fired"] = state["fired"][-8:]
                                last_fire_step = state["step"]  # start the cooldown
                                print(f"[director] fire {ev['name']}", flush=True)
                        if once:
                            break
                await asyncio.sleep(interval)
        finally:
            listener.cancel()
