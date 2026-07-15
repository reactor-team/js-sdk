"""Simulate a UI game switch WITHOUT the browser.

Sends {op:"clear"} + {op:"game", slug} to the coordinator, exactly like the UI does
when you pick a scene — so the AI director reloads that game (identity + events +
probes) and starts directing it. Pair with watch_activity.py to see the result.

    sim_game.bat case_asteroids      (the UI slug is the scene JSON's `id`)
    sim_game.bat jet-ski-cruise      (filename stem also works)
"""
import argparse
import asyncio
import json

import websockets


async def run(url, slug):
    async with websockets.connect(url) as ws:
        await ws.send(json.dumps({"op": "clear", "role": "player"}))
        await ws.send(json.dumps({"op": "game", "role": "player", "slug": slug}))
        print(f"[sim] sent game switch -> {slug}  (director should log '=== GAME START ==='", flush=True)
        await asyncio.sleep(0.3)


def main():
    ap = argparse.ArgumentParser(description="Simulate a UI game switch (headless).")
    ap.add_argument("slug", help="scene slug (JSON id or filename stem)")
    ap.add_argument("--url", default="ws://localhost:8090", help="coordinator WebSocket")
    args = ap.parse_args()
    try:
        asyncio.run(run(args.url, args.slug))
    except (OSError, websockets.exceptions.WebSocketException) as e:
        raise SystemExit(f"[sim] cannot reach coordinator at {args.url}: {type(e).__name__}: {e}")


if __name__ == "__main__":
    main()
