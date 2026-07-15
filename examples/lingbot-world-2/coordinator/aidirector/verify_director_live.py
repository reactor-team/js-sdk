"""Live integration verify for run_director_nim — with a MOCK coordinator.

Spins up a fake coordinator WebSocket server, drops a frame image, runs
`director_nim.py --once` against it, and checks the FULL connected loop:
  - the director connects to the coordinator
  - it reads the frame, runs probes + decides
  - it emits ops (assert/vital) back to the coordinator

This exercises everything run_director_nim.bat does, minus a real coordinator +
the app's frame.png handoff (both mocked here). Needs NVIDIA_API_KEY.

Run:  verify_director_live.bat
"""
import asyncio
import json
import os
import shutil
import sys

import websockets

HERE = os.path.dirname(os.path.abspath(__file__))  # .../coordinator/aidirector
COORD = os.path.dirname(HERE)                       # .../coordinator (cwd for the director)
PY = os.path.join(COORD, ".venv", "Scripts", "python.exe")
if not os.path.isfile(PY):
    PY = sys.executable
PORT = 8390  # not 8090, so it never clashes with a real coordinator
FRAME = os.path.join(COORD, "verify_frame.png")
SCENE = "../lib/lingbot-cases/jet-ski-cruise.json"  # relative to COORD
SHARK = os.path.join(COORD, "..", "..", "..", "assets", "shark.jpg")

received = []


async def handler(ws, *_):
    # Collect every op the director sends; stay open until it disconnects.
    async for raw in ws:
        try:
            received.append(json.loads(raw))
        except Exception:
            pass


async def main():
    if not os.environ.get("NVIDIA_API_KEY"):
        raise SystemExit("Set NVIDIA_API_KEY first.")
    shutil.copy(SHARK, FRAME)  # fresh mtime -> the director acts on one frame

    async with websockets.serve(handler, "localhost", PORT):
        print(f"[mock] coordinator listening on ws://localhost:{PORT}", flush=True)
        proc = await asyncio.create_subprocess_exec(
            PY, "aidirector/director_nim.py", "--once", "--model", "cosmos",
            "--url", f"ws://localhost:{PORT}", "--scene", SCENE, "--frame", FRAME,
            cwd=COORD, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        )
        try:
            raw_out, _ = await asyncio.wait_for(proc.communicate(), timeout=90)
        except asyncio.TimeoutError:
            proc.kill()
            raw_out = b"(director timed out)"
        out = raw_out.decode(errors="replace")
        # give any in-flight ops a moment to arrive before the server closes
        await asyncio.sleep(0.5)

    print(out[-1500:], flush=True)

    connected = "connected to" in out
    ops = [m for m in received if isinstance(m, dict) and m.get("op") in ("assert", "retract", "vital")]
    fired = "fire " in out.lower()

    print("\n===== LIVE DIRECTOR VERIFY (mock coordinator) =====")
    print(f"  connected to mock coordinator : {connected}")
    print(f"  ops received                  : {len(ops)}  {[o.get('op') for o in ops][:8]}")
    print(f"  director fired an event       : {fired}")
    ok = connected and len(ops) > 0
    print(f"  RESULT: {'PASS' if ok else 'FAIL'}")

    if os.path.isfile(FRAME):
        os.remove(FRAME)
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
