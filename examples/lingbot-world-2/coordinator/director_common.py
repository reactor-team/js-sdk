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
import re

import websockets
from PIL import Image

# The Director's charter. Invariants keep it from warping the base world; the
# grounding rule keeps it from inventing things that aren't plausibly on screen.
SYSTEM_TEMPLATE = """You are the DIRECTOR of a real-time interactive world. A video model renders \
the world; you steer it by proposing short prose events that get appended to its prompt.

THE WORLD (identity — never contradict this):
{base}

RULES:
- Keep the controllable subject unchanged in identity, pose and position — never move or replace it.
- Never switch to a first-person view.
- Only propose what is PLAUSIBLE given what is visible in the frame. Do not invent off-screen events.
- Prefer environmental changes (weather, time of day) and background hazards/entities AHEAD of the subject.
- Each event is one vivid sentence.

You may also change the player's vitals when the frame justifies it (e.g. standing in fire -> damage).

Respond with ONLY a JSON object, no prose, in exactly this shape:
{{
  "proposals": [
    {{"key": "env:weather", "clause": "a heavy snowstorm blows in, thick flakes filling the air",
      "weight": 5, "life": {{"kind": "sustained"}}}}
  ],
  "vital": {{"health": -10}}
}}
Lifetimes: {{"kind":"sustained"}} (until cleared) | {{"kind":"steps","n":6}} (fades) | {{"kind":"instant"}}.
Use stable keys (env:weather, env:time, entity:*, fx:*) so re-proposing refreshes rather than duplicates.
Propose 0-2 events. Empty proposals list is fine when nothing should change.
The current known events already registered: {events}
Current world facts: {facts}
Current health: {health}"""

USER_TEXT = "Here is the latest frame. Propose events as JSON only."


def load_scene(path):
    if not path or not os.path.exists(path):
        return {"base": "An interactive world.", "events": []}
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    scene = data.get("scene", {})
    base = (scene.get("base", {}) or {}).get("default", "An interactive world.")
    events = [e.get("name", "") for e in scene.get("events", [])]
    return {"base": base, "events": events}


def build_system(scene, state):
    return SYSTEM_TEMPLATE.format(
        base=scene["base"],
        events=", ".join(scene["events"]) or "(none)",
        facts=state.get("facts") or "(none)",
        health=state.get("health", "?"),
    )


def parse_json(text):
    # The model may wrap JSON in prose/fences; grab the first {...} block.
    m = re.search(r"\{.*\}", text or "", re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


async def run_director(decide, url, frame_path, scene, interval, once):
    # Latest state pushed by the coordinator (facts + vitals) for prompt context.
    state = {"facts": "", "health": 100}
    last_key_clause = {}  # dedup: only re-assert when a key's clause changes
    last_mtime = 0.0

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
                elif m.get("type") == "vitals":
                    state["health"] = m.get("health", state["health"])

        listener = asyncio.create_task(listen())
        try:
            while True:
                # Frame source: the file, only when it changed since last look.
                if os.path.exists(frame_path):
                    mtime = os.path.getmtime(frame_path)
                    if mtime != last_mtime:
                        last_mtime = mtime
                        try:
                            frame = Image.open(frame_path).convert("RGB")
                        except OSError:
                            await asyncio.sleep(interval)
                            continue
                        result = parse_json(decide(frame, build_system(scene, state)))
                        if result:
                            for p in result.get("proposals", []) or []:
                                key = p.get("key")
                                clause = p.get("clause")
                                if not key or not clause:
                                    continue
                                if last_key_clause.get(key) == clause:
                                    continue  # unchanged — skip
                                last_key_clause[key] = clause
                                fact = {
                                    "key": key,
                                    "clause": clause,
                                    "weight": p.get("weight", 5),
                                    "life": p.get("life", {"kind": "sustained"}),
                                }
                                await ws.send(
                                    json.dumps({"op": "assert", "role": "ai", "fact": fact})
                                )
                                print(f"[director] assert {key}: {clause[:60]}", flush=True)
                            vital = result.get("vital")
                            if vital:
                                await ws.send(
                                    json.dumps({"op": "vital", "role": "ai", "change": vital})
                                )
                                print(f"[director] vital {vital}", flush=True)
                        if once:
                            break
                await asyncio.sleep(interval)
        finally:
            listener.cancel()
