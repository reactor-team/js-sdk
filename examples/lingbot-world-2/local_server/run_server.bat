@echo off
setlocal enableextensions
REM Launch the local LingBot World 2 backend in WSL.
REM   run_server.bat            -> protocol shim, TEST PATTERN (fast, validates the UI)
REM   run_server.bat --model    -> real lingbot-world-v2 pipeline (~2.5 min load, ~1 fps)
REM Runs from ~/lingbot-venv (has torch + flash-attn + aiortc). WSL2 forwards localhost,
REM so the Windows browser (npm run dev on :3000) reaches it on :8080.
REM Point the UI: .env.local -> NEXT_PUBLIC_COORDINATOR_URL=http://localhost:8080
set "ARGS=%*"
where wsl >nul 2>&1 || ( echo ERROR: WSL not installed. & exit /b 1 )
echo Starting local backend on http://localhost:8080  (args: %ARGS%)  Ctrl+C to stop
wsl -e bash -lc "cd /mnt/c/workspace/world/REACTOR_js-sdk/examples/lingbot-world-2/local_server && LINGBOT_FRAME_TAP=/mnt/c/workspace/world/REACTOR_js-sdk/examples/lingbot-world-2/coordinator/frame.png /home/kschmid/lingbot-venv/bin/python server.py --port 8080 %ARGS%"
endlocal
