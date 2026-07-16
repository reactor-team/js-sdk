"""AI Director — NVIDIA inference backend (no local GPU).

Uses the NVIDIA inference hub (OpenAI-compatible) instead of a local model, so
it does NOT compete with the 14B generator for VRAM. Mirrors the proven pattern
in gfnagent/dataset/inference_api.py: OpenAI client -> inference-api.nvidia.com,
frames sent as base64 image_url blocks. Default model is the small NVIDIA VLM
nemotron-nano-12b-v2-vl.

Needs an nvapi key in NVIDIA_API_KEY. Runs the shared director loop.
"""
import argparse
import asyncio
import glob
import json
import os
import time

from director_common import USER_TEXT, load_scene, make_probe, run_director, resolve_model
from client import NVIDIA_URL, DEFAULT_MODEL, make_client, vlm_call

# Timestamp this module's log lines too (HH:MM:SS, no date), matching the runtime
# loop in director_common. Shadows the builtin print for this module only.
_builtin_print = print


def print(*args, **kwargs):  # noqa: A001 — intentional module-level shadow
    _builtin_print(time.strftime("%H:%M:%S"), *args, **kwargs)


def make_vlm(client, model, max_px):
    """vlm(frame, system, user_text, max_tokens) -> reply text, over the shared vlm_call.
    Shared by the director's decide() and the probe checklist."""
    def vlm(frame, system, user_text, max_tokens=384):
        text, _resp = vlm_call(client, model, frame, system, user_text, max_tokens, max_px)
        return text

    return vlm


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="ws://localhost:8090", help="coordinator WebSocket")
    ap.add_argument("--frame", default="frame.png", help="latest-frame image file to watch")
    ap.add_argument("--scene", default="", help="scene JSON (for base identity + event list)")
    ap.add_argument("--interval", type=float, default=3.0, help="seconds between frame checks")
    ap.add_argument("--once", action="store_true", help="run one proposal and exit (test)")
    ap.add_argument("--model", default=DEFAULT_MODEL,
                    help="model id OR a shortcut: cosmos|nemotron|gemini|minimax|qwen")
    ap.add_argument("--base-url", default=NVIDIA_URL, help="OpenAI-compatible base URL")
    ap.add_argument("--max-px", type=int, default=768, help="max frame dimension sent")
    ap.add_argument("--no-probe", action="store_true",
                    help="disable the probe pass (the AI director's eyes); decide from the frame alone")
    ap.add_argument("--fire-cooldown", type=int, default=3,
                    help="min chunks between fires (paces the director; default 3, 0 = off). Stops it "
                         "firing every frame")
    ap.add_argument("--warmup", type=float, default=5.0,
                    help="seconds to do NOTHING at the start of a game so the scene establishes "
                         "(default 5, 0 = off)")
    ap.add_argument("--quiet", action="store_true",
                    help="turn OFF the detailed per-step debug log (on by default)")
    ap.add_argument("--reuse-frame", action="store_true",
                    help="DEBUG: keep re-deciding on the same (old) frame each interval "
                         "instead of waiting for a new one — use when nothing refreshes the "
                         "frame tap (e.g. cloud video). Billed per look.")
    ap.add_argument("--self-feed", dest="self_feed", action="store_true", default=True,
                    help="(DEFAULT ON) source the frame from the active scene's OWN still image "
                         "(no external feeder, no active_game.txt) — the cloud-mode replacement "
                         "for feed_frame_loop.bat. FALLBACK only: a live LINGBOT_FRAME_TAP with "
                         "fresh frames always wins. Billed per look.")
    ap.add_argument("--no-self-feed", dest="self_feed", action="store_false",
                    help="disable self-feed (rely solely on an external frame tap / feeder).")
    # Probe checklist sizing. Default is the LEAN set: ungated director-event + ungated
    # player-action presence probes only (no invariants, no alt-state). Flags add back.
    ap.add_argument("--no-player-actions", dest="probe_player_actions", action="store_false",
                    help="drop the 'is the character doing X now?' player-action probes.")
    ap.add_argument("--probe-invariants", action="store_true",
                    help="ADD submerged/duplicate/off-frame invariant probes (auto consistency fixes).")
    ap.add_argument("--probe-state", action="store_true",
                    help="ADD alt base-version state probes (e.g. overboard).")
    ap.add_argument("--probe-gated", action="store_true",
                    help="ALSO probe gated events (default skips events with a `requires` gate).")
    args = ap.parse_args()
    args.model = resolve_model(args.model)  # expand a shortcut (cosmos) to the full slug
    debug = not args.quiet  # detailed shell logging is ON by default

    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        raise SystemExit("Set NVIDIA_API_KEY (nvapi-... key) in the environment.")

    client = make_client(api_key, args.base_url)

    # model_check() pings the MODEL server (NVIDIA inference) — separate from the
    # coordinator; the model is the director's brain. Reused at startup AND at runtime
    # so the director never decides (never bills) while the model is unreachable.
    def model_check():
        try:
            client.models.list()
            return True
        except Exception:  # noqa: BLE001
            return False

    try:
        client.models.list()
        print(f"[director] model check: reachable -> {args.base_url}  ({args.model})", flush=True)
    except Exception as e:  # noqa: BLE001 — show WHY it failed, then don't start
        print(f"[director] model check: FAILED -- {type(e).__name__}: {e}", flush=True)
        key = os.environ.get("NVIDIA_API_KEY", "")
        print(f"[director]   NVIDIA_API_KEY: {'set (' + str(len(key)) + ' chars)' if key else 'NOT SET'}  "
              f"base_url: {args.base_url}", flush=True)
        print("[director]   -> check: key set in THIS window? key valid/not expired? network/firewall "
              "to inference-api.nvidia.com? NOT starting the AI director.", flush=True)
        return  # no model -> don't start (mirrors: disconnect unloads + stops)
    vlm = make_vlm(client, args.model, args.max_px)
    decide = lambda frame, system: vlm(frame, system, USER_TEXT, 384)  # noqa: E731
    scene = load_scene(args.scene)

    # Probe pass = the AI director's eyes. Needs the FULL scene JSON (derive_probes),
    # not the trimmed load_scene() view. Skipped with --no-probe or if no scene given.
    # Checklist sizing shared by the launch scene and every reload_game() switch.
    probe_opts = dict(include_player_actions=args.probe_player_actions,
                      include_invariants=args.probe_invariants,
                      include_state=args.probe_state,
                      only_ungated=not args.probe_gated)
    probe = None
    if not args.no_probe and args.scene and os.path.isfile(args.scene):
        scene_json = json.load(open(args.scene, encoding="utf-8"))
        probe = make_probe(vlm, scene_json, debug=debug, **probe_opts)

    # reload_game(slug) lets the director FOLLOW the UI: on a game switch it loads
    # that scene file and rebuilds identity + events + the probe checklist.
    # The UI's slug is the JSON `id`, which is NOT the filename for most scenes, so
    # resolve by scanning: index every case by BOTH its `id` and its filename stem.
    # Returns (scene, probe, image_abspath) or None if the slug can't be resolved.
    cases_dir = os.path.dirname(args.scene) or "../lib/lingbot-cases"
    img_dir = os.path.join(os.path.dirname(cases_dir), "..", "public", "lingbot-cases")

    def _index_cases():
        idx = {}
        for p in glob.glob(os.path.join(cases_dir, "*.json")):
            idx[os.path.splitext(os.path.basename(p))[0]] = p  # by filename stem
            try:
                jid = json.load(open(p, encoding="utf-8")).get("id")
            except (OSError, json.JSONDecodeError):
                continue
            if jid:
                idx[jid] = p  # and by JSON id (what the UI broadcasts)
        return idx

    scene_index = _index_cases()

    def reload_game(slug):
        path = scene_index.get(slug)
        if not path:
            scene_index.update(_index_cases())  # rescan once in case a scene was added
            path = scene_index.get(slug)
        if not path or not os.path.isfile(path):
            return None
        with open(path, encoding="utf-8") as f:
            sj = json.load(f)
        new_scene = load_scene(path)
        new_probe = make_probe(vlm, sj, debug=debug, **probe_opts) if not args.no_probe else None
        # Resolve the scene's still image (for the cloud-mode frame feed). image.src
        # is a web path like /lingbot-cases/foo.jpg; fall back to the file stem.
        src = (sj.get("image") or {}).get("src") or ""
        if src.startswith("/lingbot-cases/"):
            img = os.path.join(img_dir, os.path.basename(src))
        else:
            img = os.path.join(img_dir, os.path.splitext(os.path.basename(path))[0] + ".jpg")
        return new_scene, new_probe, os.path.abspath(img)

    print(f"[director] NVIDIA inference: {args.model}  probes={'on' if probe else 'off'}  "
          f"debug={'on' if debug else 'off'}", flush=True)
    asyncio.run(
        run_director(decide, args.url, args.frame, scene, args.interval, args.once,
                     probe=probe, debug=debug, reload_game=reload_game,
                     hello_extra={"model": args.model, "modelOk": True},
                     model_check=model_check, fire_cooldown=args.fire_cooldown,
                     warmup=args.warmup, reuse_frame=args.reuse_frame,
                     self_feed=args.self_feed)
    )


if __name__ == "__main__":
    main()
