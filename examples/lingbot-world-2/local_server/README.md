# Local backend for the LingBot World 2 Reactor UI

Point the unchanged js-sdk app at a LOCAL model instead of Reactor cloud, by
emulating Reactor's WebRTC coordinator protocol.

## Stages
1. **Protocol shim** (`server.py`) — 4 HTTP endpoints + aiortc peer connection
   streaming a TEST PATTERN. Proves the js-sdk UI connects to localhost. ← runnable now
2. **Model engine** (`engine.py`, TODO) — our `lingbot-world-v2` pipeline refactored
   into interactive `init_session` / `step(action)` (per-chunk causal AR loop).
3. **Wire** — DataChannel `set_prompt`/`set_move_*`/`set_camera_pose` → engine →
   stream real frames (replace the test-pattern `FrameSource`).

## Run stage 1 (validate the protocol)
```bash
pip install -r requirements.txt
python server.py --port 8080          # http://localhost:8080/healthz -> {"status":"ok"}
```
Then in the app's `.env.local` set the local backend and restart the UI:
```
NEXT_PUBLIC_COORDINATOR_URL=http://localhost:8080
REACTOR_API_KEY=local   # any non-empty value
```
```bash
cd ..   # examples/lingbot-world-2
npm run dev             # http://localhost:3000 -> Connect
```
**Success = the UI reaches `ready` and shows the animated test pattern.** That
confirms the endpoint paths + shapes match; watch `server.py` logs for the
DataChannel commands the UI sends.

## If it doesn't connect
The exact endpoint paths / request+response shapes are reverse-engineered from the
minified `@reactor-team/js-sdk` and may need correction. The server logs every hit;
compare against the browser Network tab (which paths/bodies the SDK actually sends)
and adjust `build_app()` routes + the `sessions`/`connections` response bodies.

## Stage 2/3 note
The model runs in **WSL** (fp8, ~1 fps). Once stage 1's protocol is validated,
`engine.py` wraps the pipeline from `C:\workspace\world\lingbot-world-v2` and the
`FrameSource.next_frame()` pulls from the live AR stream. ~1 fps — steerable, not
real-time (see the lingbot-world-v2 memory).
