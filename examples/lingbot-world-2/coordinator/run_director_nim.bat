@echo off
setlocal enableextensions
REM AI Director via NVIDIA inference (no local GPU) -> coordinator ops.
REM Uses nemotron-nano-12b-v2-vl on inference-api.nvidia.com. Needs NVIDIA_API_KEY.
REM Deps (once): uv pip install --python /home/kschmid/lingbot-venv/bin/python openai websockets
REM Watches frame.png for the latest rendered frame; wire engine.py to dump it there.
if "%NVIDIA_API_KEY%"=="" ( echo ERROR: set NVIDIA_API_KEY ^(nvapi-... key^) first & exit /b 1 )
set "HERE=%~dp0"
if "%SCENE%"=="" set "SCENE=../lib/lingbot-cases/noir-alley-combat.json"
if "%FRAME%"=="" set "FRAME=frame.png"
wsl -e bash -lc "cd /mnt/c/workspace/world/REACTOR_js-sdk/examples/lingbot-world-2/coordinator && NVIDIA_API_KEY='%NVIDIA_API_KEY%' /home/kschmid/lingbot-venv/bin/python director_nim.py --url ws://localhost:8090 --scene '%SCENE%' --frame '%FRAME%' %*"
endlocal
