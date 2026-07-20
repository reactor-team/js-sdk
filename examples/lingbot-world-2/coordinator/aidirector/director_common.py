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
import shutil
import time

import websockets
from PIL import Image

# Prefix every director log line with the wall-clock time (HH:MM:SS, no date) so
# events in the console can be correlated. Shadows the builtin print for this
# module only — dbg() and every print(f"[director] ...") pick it up automatically.
_builtin_print = print


def print(*args, **kwargs):  # noqa: A001 — intentional module-level shadow
    _builtin_print(time.strftime("%H:%M:%S"), *args, **kwargs)


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

You decide from the STATE below (world facts, verified observations, objective, health, and
what you have already fired) — reason about the game state, not a picture.

RULES:
- Trigger an event only when it is PLAUSIBLE and fitting given the current world state and the objective.
- If the Current world facts or Verified observations show an event is ALREADY in progress, do NOT
  fire it again or stack a competing one — return an empty list and let the current event play out.
- If the world facts or observations show the character is CURRENTLY in a battle or mid-action
  (fighting, being attacked, falling, or actively engaged), do NOT introduce a new event — return an
  empty list and let the current action resolve first.
- Fire AT MOST ONE event: return either an empty list [] or a SINGLE event. NEVER more than one.
  Most of the time an empty list is correct — only fire when the moment genuinely calls for it.

Respond with ONLY a JSON object, no prose (0 or 1 event):
{{"events": ["<single exact event name from the list>"]}}

Current world facts: {facts}
Verified observations (from probes — what is ACTUALLY on screen now; trust these over your own read): {observed}
Current health: {health}"""

USER_TEXT = "Based on the current world state and objective, choose which authored event (if any) to fire, as JSON only."

# User text for a probe (checklist) call — the derived questions are appended after it.
PROBE_USER = ("Answer each of these yes/no questions about the image. Respond with ONLY a "
              "JSON object mapping each id to true or false.")


def make_probe(vlm, scene_json, debug=False, **probe_opts):
    """Build a probe(frame) -> (ops, observations) from the FULL scene JSON.

    Reuses the backend's vlm(frame, system, user_text) call. Derives the typed
    checklist once (scene_probes.derive_probes), asks it in ONE call per frame, and
    resolves answers into coordinator ops (invariant re-anchors) + a flat observation
    map. This is the AI director's eyes — grounding/verification, not a driving path.
    `probe_opts` pass straight to derive_probes (include_player_actions,
    include_invariants, include_state) to size the checklist. Each event probe is
    tagged with its `requires` gate; probe(frame, state) asks ONLY the probes whose
    gate is currently valid (ungated always; gated once its predecessor has fired).
    """
    derived = derive_probes(scene_json, **probe_opts)
    all_probes = derived["probes"]
    if debug:
        print(f"[director:dbg] probe checklist derived: {len(all_probes)} questions", flush=True)
        for p in all_probes:
            gate = " [gated]" if p.get("requires") else ""
            print(f"[director:dbg]   ? {p['id']}: {p['q']}{gate}", flush=True)

    def probe(frame, state=None):
        # Ask only gate-valid probes this frame (ungated + unlocked gated events).
        active = [p for p in all_probes if _gate_ok(p.get("requires"), state or {})]
        questions = "\n".join(f'- {p["id"]}: {p["q"]}' for p in active)
        user = PROBE_USER + "\n\n" + questions
        raw = vlm(frame, derived["system"], user, 512)
        answers = parse_json(raw) or {}
        ops, obs = resolve(answers, active)
        if debug:
            print(f"[director:dbg] probe: asked {len(active)}/{len(all_probes)} (gate-valid)", flush=True)
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
             "health": e.get("health"), "addItem": e.get("addItem"),
             "requires": e.get("requires")}
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


def _gate_ok(requires, state):
    """Python mirror of isEventAvailable (lib/lingbot-world-prompts.ts): a director
    event is only a valid AI trigger when its declarative `requires` gate holds.
    Gating reads the ONE shared History (`shared_fired`, derived from the
    coordinator's projected facts), NOT the director's local arc memory — there is
    exactly one History, so a predecessor fired by ANYONE (human, AI, or the win
    clock) unlocks the gate (e.g. Police Car only AFTER Gunman on the Fire Escape).
    Names are normalized so display/slug forms match. `hasItem` is not gated here;
    `minChunks` uses the director `step` counter as the elapsed-time proxy."""
    g = requires
    if not g:
        return True
    # The single source of truth for what has fired is the coordinator's History.
    fired = {_norm_name(f) for f in (state.get("shared_fired") or [])}
    if g.get("fired") and not all(_norm_name(n) in fired for n in g["fired"]):
        return False
    if g.get("firedAny") and not any(_norm_name(n) in fired for n in g["firedAny"]):
        return False
    if g.get("notFired") and any(_norm_name(n) in fired for n in g["notFired"]):
        return False
    if g.get("minChunks") is not None and state.get("step", 0) < g["minChunks"]:
        return False
    health = state.get("health", 100)
    if g.get("maxHealth") is not None and health > g["maxHealth"]:
        return False
    if g.get("minHealth") is not None and health < g["minHealth"]:
        return False
    return True


def _event_open(e, state):
    """Is director event `e` a valid AI trigger right now? Prefer the authored
    `requires` gate (load_scene path) evaluated against the DIRECTOR's own state —
    authoritative for the AI's own fires. If `requires` is absent (the event came
    via a scene_events broadcast, which only carries the client-computed flag),
    fall back to that `available` flag. Unknown on both -> open."""
    req = e.get("requires")
    if req is not None:
        return _gate_ok(req, state)
    return e.get("available") is not False


def build_system(scene, state):
    fired = state.get("fired") or []
    fired_lower = {f.lower() for f in fired}
    dir_events = scene.get("dir_events") or []
    # Prefer events NOT already fired this session so the arc actually ADVANCES
    # (don't just re-offer an already-active event) AND whose gate is open, so the
    # AI never triggers a dependency-locked event. If everything eligible has
    # fired, reopen repeats — but ONLY of gate-open events, never a locked one.
    available = [
        e for e in dir_events
        if e["name"] and e["name"].lower() not in fired_lower and _event_open(e, state)
    ]
    if not available:
        available = [e for e in dir_events if e["name"] and _event_open(e, state)]
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


async def _timed_call(fn, *args):
    """Run a blocking VLM call in a worker thread and time it, so probe and decide
    can run CONCURRENTLY under asyncio.gather. Returns (result, err, seconds) and
    never raises — the caller inspects `err`."""
    _t = time.monotonic()
    try:
        return await asyncio.to_thread(fn, *args), None, time.monotonic() - _t
    except Exception as e:  # noqa: BLE001 — surfaced via the returned err
        return None, e, time.monotonic() - _t


async def _noop_call():
    """Stand-in for the probe coroutine when no probe is configured."""
    return None, None, 0.0


async def run_director(decide, url, frame_path, scene, interval, once, probe=None, debug=False,
                       reload_game=None, hello_extra=None, model_check=None, fire_cooldown=0,
                       warmup=0.0, reuse_frame=False, self_feed=True, vlm_decide=True):
    # Latest state pushed by the coordinator (facts + vitals) for prompt context.
    # `fired` = short memory of the arc (event names introduced); `step` = pacing.
    # `observations` = the probe read of the current frame (the AI director's eyes).
    state = {"facts": "", "health": 100, "fired": [], "step": 0, "observations": {},
             "shared_fired": set()}  # the ONE History's fired-set (gate source)
    # Probe lives in a holder so a game switch (see the "game" message) can swap it.
    pstate = {"probe": probe}
    # Model-server health: the director starts only when the model is reachable
    # (director_nim exits otherwise); if a decide later fails AND model_check() confirms
    # the server is down, we unload the game and STOP (see the decide error handler).
    last_fire_step = -(10 ** 9)  # for --fire-cooldown: don't fire again within N chunks
    last_key_clause = {}  # dedup: only re-assert when a key's clause changes
    last_mtime = 0.0
    last_idle_msg = None  # throttle: only re-print an idle reason when it changes
    paused_announced = False  # human-mode pause: announce once per transition, then stay silent
    model_down = False  # model-server pause: set on a confirmed disconnect, polls to auto-resume
    last_stale_warn = 0.0  # throttle the "frame is stale — feeder not running?" warning
    STALE_WARN_SECS = 30.0  # frame older than this => warn that nothing is feeding it
    STALE_WARN_EVERY = 30.0  # re-warn at most this often while it stays stale
    consec_vlm_errors = 0  # STOP the director after this many decides fail in a row
    MAX_VLM_ERRORS = 3  # (a model disconnect that model_check misses shouldn't loop forever)

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
        state["game_start_time"] = time.monotonic()  # for --warmup (do nothing at game start)
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
                    elif m.get("type") == "state":
                        # The ONE shared History. Every fired event is a `scene:<slug>`
                        # fact here, regardless of who fired it (human, AI, win clock), so
                        # this is the authoritative fired-set the gate reads (_gate_ok).
                        fired = set()
                        for f in (m.get("facts") or []):
                            k = f.get("key", "") if isinstance(f, dict) else ""
                            if k.startswith("scene:"):
                                fired.add(k[len("scene:"):].replace("_", " "))
                        state["shared_fired"] = fired
                        # directorMode rides in the state snapshot too — track it so the
                        # loop can pause the AI (no VLM calls) while it's the human's turn.
                        if m.get("mode"):
                            state["mode"] = m.get("mode")
                        dbg(f"<- state: shared_fired={sorted(fired)} mode={state.get('mode')}")
                    elif m.get("type") == "vitals":
                        state["health"] = m.get("health", state["health"])
                        dbg(f"<- vitals: health={state['health']}")
                    elif m.get("type") == "mode":
                        state["mode"] = m.get("mode")
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
                            state["game_image"] = ""  # nothing to self-feed while idle
                            last_key_clause.clear()
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
                                state["game_start_time"] = time.monotonic()  # restart --warmup
                                # Keep the scene's still IN STATE so --self-feed can source the
                                # frame directly (no active_game.txt, no external feeder needed).
                                state["game_image"] = img_path
                                last_key_clause.clear()
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
                        # Carry the client-computed `available` flag: it already
                        # evaluated each event's `requires` gate against shared
                        # state, so we honor the SAME locks the human panel shows
                        # (build_system -> _event_open drops available===false).
                        scene["dir_events"] = [
                            {"name": e.get("name", ""), "clause": e.get("clause", ""),
                             "health": e.get("health"), "addItem": e.get("addItem"),
                             # requires = evaluated against the director's OWN fired-state
                             # (authoritative for its arc); available = the player-computed
                             # flag as a fallback. _event_open prefers requires.
                             "requires": e.get("requires"), "available": e.get("available")}
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
                # MODE GATE (top of loop): in "human" director mode the AI is fully paused —
                # the coordinator drops its ops anyway. Skip EVERYTHING (self-feed, frame
                # checks, probe/decide, stale warnings) and idle SILENTLY — post NOTHING to
                # the activity feed so switching to human in the UI cleanly stops all AI
                # logging. A one-shot console line (local only) marks the transition.
                if state.get("mode") == "human":
                    if not paused_announced:
                        paused_announced = True
                        last_idle_msg = None
                        print("[director] human director mode — AI paused (silent; no frames, no VLM calls)", flush=True)
                    await asyncio.sleep(interval)
                    continue
                paused_announced = False
                # MODEL GATE (top of loop): while the model server is known-down, PAUSE —
                # no probe/decide (no billing), just poll for reconnect and auto-resume when
                # it's back. Only checks while paused, so the healthy path pings nothing extra.
                if model_down:
                    if model_check is None or model_check():
                        model_down = False
                        last_idle_msg = None
                        print("[director] model server reconnected — AI resuming.", flush=True)
                    else:
                        await asyncio.sleep(interval)
                        continue
                # SELF-FEED (default ON): when a game is loaded, the director sources the
                # frame from the scene's OWN still (kept in state on game load) — NO external
                # feeder, NO active_game.txt. It's a FALLBACK, not a clobber: it only writes
                # when the frame is MISSING or STALE, so a live tap (LINGBOT_FRAME_TAP / real
                # local video) writing fresh frames is never overwritten. On the cloud path
                # nothing writes the tap, so this keeps the director fed on its own.
                if self_feed and state.get("game_image") and (scene.get("dir_events") or []):
                    stale_after = max(2.0 * interval, 4.0)  # a live tap refreshes faster than this
                    need_feed = True
                    if os.path.exists(frame_path):
                        need_feed = (time.time() - os.path.getmtime(frame_path)) > stale_after
                    if need_feed:
                        try:
                            shutil.copyfile(state["game_image"], frame_path)
                            os.utime(frame_path, None)  # mtime = NOW so it reads as a new frame
                            dbg(f"self-feed: {state['game_image']} -> {frame_path}")
                        except OSError as e:  # noqa: BLE001 — best-effort, fall through to idle
                            print(f"[director] self-feed error: {type(e).__name__}: {e}", flush=True)
                # Frame source: the file, only when it changed since last look.
                if not os.path.exists(frame_path):
                    # This is the usual "no action" cause: cloud video never writes
                    # the frame tap, so the director has nothing to look at.
                    reason = f"idle: frame not found at {os.path.abspath(frame_path)} " \
                             f"(cloud video? the frame tap needs the LOCAL backend)"
                    if reason != last_idle_msg:
                        dbg(reason)
                        last_idle_msg = reason
                        await ws.send(json.dumps({"op": "log", "role": "ai", "cmd": "look",
                                                  "name": "idle — no frame (run feed_frame / local backend)"}))
                else:
                    mtime = os.path.getmtime(frame_path)
                    # Normally we only look when the frame CHANGED. --reuse-frame is a
                    # DEBUG option: keep re-deciding on the same (old) frame each interval,
                    # in order, so the decision path runs even when nothing refreshes the
                    # tap (e.g. cloud video, which never writes frame.png). Billed per look.
                    if mtime == last_mtime and not reuse_frame:
                        reason = f"idle: frame unchanged (mtime={mtime:.0f}); waiting for a new frame"
                        if reason != last_idle_msg:
                            dbg(reason)
                            last_idle_msg = reason
                            await ws.send(json.dumps({"op": "log", "role": "ai", "cmd": "look",
                                                      "name": "idle — waiting for a new frame"}))
                        # WARN when the frame is genuinely STALE: if nothing has refreshed
                        # frame.png for a while, the feeder almost certainly isn't running
                        # (feed_frame_loop.bat closed, or a hand-started director skipped it).
                        # Escalate the neutral "waiting" into an actionable warning, throttled.
                        age = time.time() - mtime
                        now_m = time.monotonic()
                        if age > STALE_WARN_SECS and (now_m - last_stale_warn) > STALE_WARN_EVERY:
                            last_stale_warn = now_m
                            warn = (f"frame is {age:.0f}s stale — nothing is feeding it. "
                                    f"On cloud video run feed_frame_loop.bat (or use --reuse-frame). "
                                    f"Frame: {os.path.abspath(frame_path)}")
                            print(f"[director] WARNING: {warn}", flush=True)
                            await ws.send(json.dumps({"op": "log", "role": "ai", "cmd": "error",
                                                      "detail": f"frame {age:.0f}s stale — feeder not running "
                                                                f"(start feed_frame_loop.bat)"}))
                    else:
                        if mtime == last_mtime:
                            dbg(f"reuse-frame: re-deciding on unchanged frame (mtime={mtime:.0f})")
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
                                await ws.send(json.dumps({"op": "log", "role": "ai", "cmd": "look",
                                                          "name": "idle — no game loaded"}))
                            await asyncio.sleep(interval)
                            continue
                        # WARMUP: do nothing for the first `warmup` seconds of a game so the
                        # scene establishes before the director intervenes (no billing).
                        if warmup and state.get("game_start_time") is not None:
                            left = warmup - (time.monotonic() - state["game_start_time"])
                            if left > 0:
                                reason = f"warmup: letting the scene establish — {left:.0f}s before directing"
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
                        # Timing: measure the full decision cycle (probe + decide) so you
                        # can see how long one director look actually costs end to end.
                        # Probe (eyes) and decide (brain) are INDEPENDENT VLM calls:
                        # decide's prompt embeds the observations from the PREVIOUS
                        # step (state["observations"]), so we fire BOTH concurrently
                        # via asyncio.gather instead of serially — the cycle now costs
                        # ~max(probe, decide) rather than their sum. Frames are seconds
                        # apart, so a one-step-stale observation map is a fine trade.
                        # build_system MUST run first so decide reads the prior probe.
                        t_start = time.monotonic()
                        system_text = build_system(scene, state)
                        if debug:
                            dbg(f"decide system prompt ({len(system_text)} chars):")
                            print(system_text, flush=True)
                        probe_co = (
                            _timed_call(pstate["probe"], frame, state)
                            if pstate["probe"] is not None else _noop_call()
                        )
                        if not vlm_decide:
                            # RULES-DECIDE: the coordinator's json-rules-engine is the decide step;
                            # the Python director is PERCEPTION-ONLY. Run the probe, post its
                            # observations to the coordinator (op:"observe") so rules can read them,
                            # and fire nothing here — the coordinator asserts the events.
                            (p_res, p_err, t_probe) = await probe_co
                            obs = {}
                            if p_err is not None:
                                print(f"[director] probe error: {type(p_err).__name__}: {p_err}", flush=True)
                            elif p_res is not None:
                                p_ops, obs = p_res
                                state["observations"] = obs
                                for op in p_ops:
                                    dbg(f"-> probe op: {json.dumps(op)}")
                                    await ws.send(json.dumps(op))
                            await ws.send(json.dumps({"op": "observe", "role": "ai", "obs": obs}))
                            t_total = time.monotonic() - t_start
                            name = f"new frame — probe only, rules decide ({t_total:.2f}s)"
                            print(f"[director] {name}", flush=True)
                            await ws.send(json.dumps({"op": "log", "role": "ai", "cmd": "look", "name": name}))
                            if once:
                                break
                            await asyncio.sleep(interval)
                            continue
                        (p_res, p_err, t_probe), (raw, d_err, t_decide) = await asyncio.gather(
                            probe_co, _timed_call(decide, frame, system_text)
                        )

                        # Apply the probe result -> refresh observations for the NEXT
                        # step and emit any invariant re-anchor ops (best-effort).
                        if p_err is not None:
                            print(f"[director] probe error: {type(p_err).__name__}: {p_err}", flush=True)
                        elif p_res is not None:
                            p_ops, p_obs = p_res
                            state["observations"] = p_obs
                            for op in p_ops:
                                dbg(f"-> probe op: {json.dumps(op)}")
                                await ws.send(json.dumps(op))

                        # Apply the decide result (same handling as the serial path).
                        if d_err is not None:
                            msg = f"{type(d_err).__name__}: {d_err}"
                            consec_vlm_errors += 1
                            print(f"[director] VLM error ({consec_vlm_errors}/{MAX_VLM_ERRORS}): {msg}", flush=True)
                            # If the model server is unreachable, PAUSE (don't stop): flag it
                            # and let the top-of-loop MODEL GATE poll for reconnect and auto-
                            # resume — no billing while down. The consecutive-error count is a
                            # separate backstop that STOPS on persistent NON-disconnect failures.
                            server_down = model_check is not None and not model_check()
                            if server_down:
                                model_down = True
                                consec_vlm_errors = 0
                                print("[director] model server not connected — AI paused (waiting to reconnect, no VLM calls).", flush=True)
                                await asyncio.sleep(interval)
                                continue
                            if consec_vlm_errors >= MAX_VLM_ERRORS:
                                why = f"{consec_vlm_errors} consecutive VLM errors"
                                print(f"[director] {why} — unloading game and stopping the AI director.", flush=True)
                                try:
                                    await ws.send(json.dumps(
                                        {"op": "log", "role": "ai", "cmd": "error",
                                         "detail": f"director stopped: {why} ({msg})"}))
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
                        # decide succeeded -> the model is answering; reset the error counter.
                        consec_vlm_errors = 0
                        dbg(f"decide raw reply: {raw!r}")
                        result = parse_json(raw)
                        dbg(f"decide parsed: {result}")
                        # Heartbeat state: show the director looked even when it fires
                        # nothing, so the activity feed doesn't look dead (see below).
                        did_fire = False
                        look_reason = "new frame — no event"
                        if raw and result is None:
                            dbg("decide reply did NOT parse as JSON")
                            look_reason = "new frame — unparseable reply"
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
                                look_reason = f"new frame — holding {wanted[0]} ({wait} chunk cooldown)"
                                wanted = []
                            elif not wanted:
                                look_reason = "new frame — chose no event"
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
                                did_fire = True
                                print(f"[director] fire {ev['name']}", flush=True)
                        # Full decision time. probe ∥ decide run CONCURRENTLY, so
                        # t_total ≈ max(probe, decide) — not their sum.
                        t_total = time.monotonic() - t_start
                        timing = (f"{t_total:.2f}s (probe {t_probe:.2f}s ∥ decide {t_decide:.2f}s)")
                        print(f"[director] decision time: {timing}", flush=True)
                        # Heartbeat: even when the director fires nothing this look, emit a
                        # record-only log op so the activity feed shows it is alive and
                        # watching (otherwise an empty decision is invisible and it looks
                        # like the director dropped off). op:"log" changes no game state and
                        # is not mode-gated, so it shows even while mode=human. Carries the
                        # decision time so you can see the cost per look in the UI too.
                        if did_fire:
                            await ws.send(json.dumps({
                                "op": "log", "role": "ai", "cmd": "look",
                                "name": f"decided in {timing}",
                            }))
                        else:
                            print(f"[director] {look_reason}", flush=True)
                            await ws.send(json.dumps({
                                "op": "log", "role": "ai", "cmd": "look",
                                "name": f"{look_reason} · {timing}", "detail": (raw or "")[:200],
                            }))
                        if once:
                            break
                await asyncio.sleep(interval)
        finally:
            listener.cancel()
