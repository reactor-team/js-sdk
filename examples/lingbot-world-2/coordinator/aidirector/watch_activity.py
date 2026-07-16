"""Headless activity-feed viewer — the UI-less UI.

Connects to the coordinator (ws://localhost:8090) and prints the SAME stream the
Director panel's activity feed renders (activity / vitals / mode / facts), so you
can watch the AI director fire WITHOUT the browser. Pure listener: sends nothing,
touches no model, not billed.

Run the real coordinator + the director, then this, then feed a frame:
    watch_activity.bat
    (in another shell)  feed_frame.bat templerun
-> you should see rows like:  ai      assert scene:gold_coin_appears  "..."
"""
import argparse
import asyncio
import json

import websockets


def _fmt(m):
    t = m.get("type")
    if t == "activity":
        role = m.get("role", "?")
        op = m.get("op", "")
        label = m.get("key") or m.get("name") or m.get("slug") or ""
        change = m.get("change")
        clause = m.get("clause")
        extra = f" {json.dumps(change)}" if change else ""
        tail = f'  "{clause[:60]}"' if clause else ""
        return f"{role:6s} {op} {label}{extra}{tail}"
    if t == "vitals":
        return f"       vitals  health={m.get('health')} inv={m.get('inventory')}"
    if t == "mode":
        return f"       mode    {m.get('mode')}"
    if t == "won":
        return f"       WON     reward={m.get('reward')}"
    return None  # skip facts/state/scene_events/objective (noisy)


async def run(url, out):
    # Fresh log each session so the in-app ticker starts clean.
    if out:
        try:
            open(out, "w", encoding="utf-8").close()
        except OSError:
            pass
    async with websockets.connect(url) as ws:
        print(f"[watch] connected to {url} — waiting for activity (Ctrl+C to stop)...", flush=True)
        async for raw in ws:
            try:
                m = json.loads(raw)
            except json.JSONDecodeError:
                continue
            line = _fmt(m)
            if line:
                print(f"[watch] {line}", flush=True)
                if out:  # also stream into the app (Next.js /api/activity tails this file)
                    try:
                        with open(out, "a", encoding="utf-8") as f:
                            f.write(line.strip() + "\n")
                    except OSError:
                        pass


def main():
    ap = argparse.ArgumentParser(description="Headless view of the coordinator's activity feed.")
    ap.add_argument("--url", default="ws://localhost:8090", help="coordinator WebSocket")
    ap.add_argument("--out", default="activity.log",
                    help="also append each line here so the app can show it ('' to disable)")
    args = ap.parse_args()
    try:
        asyncio.run(run(args.url, args.out))
    except (OSError, websockets.exceptions.WebSocketException) as e:
        raise SystemExit(f"[watch] cannot reach coordinator at {args.url}: {type(e).__name__}: {e}")


if __name__ == "__main__":
    main()
