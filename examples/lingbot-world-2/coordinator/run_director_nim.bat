@echo off
setlocal enableextensions
REM ==========================================================================
REM AI Director via NVIDIA inference (no local GPU) -> coordinator ops.
REM
REM Runs on the coordinator's NATIVE Windows venv (.venv) -- NOT WSL. director_nim
REM is pure Python (openai + pillow + websockets, a cloud API call), so it does
REM not need Linux, and running it natively lets it reach the Windows coordinator
REM over plain ws://localhost:8090 (WSL2 can't reliably hit the Windows host's
REM localhost). Default model is cosmos3-nano-reasoner (see client.py). Debug log
REM is ON by default (pass --quiet to silence). Needs NVIDIA_API_KEY.
REM
REM Watches frame.png for the latest frame; feed it with feed_frame.bat (a still)
REM or wire engine.py's LINGBOT_FRAME_TAP to it (live local video).
REM ==========================================================================
if "%NVIDIA_API_KEY%"=="" ( echo ERROR: set NVIDIA_API_KEY ^(nvapi-... key^) first & exit /b 1 )
set "HERE=%~dp0"
cd /d "%HERE%"
set "PY=%HERE%.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
REM No default scene: the director starts with NO game and follows the UI's
REM selection (the coordinator's "game" broadcast). Set SCENE to preload one.
REM Frame path is CONFIGURABLE: LINGBOT_FRAME_TAP (shared with engine.py + the
REM feeder) wins; then %FRAME%; else the default coordinator\frame.png.
if not defined FRAME if defined LINGBOT_FRAME_TAP set "FRAME=%LINGBOT_FRAME_TAP%"
if "%FRAME%"=="" set "FRAME=frame.png"
"%PY%" aidirector/director_nim.py --url ws://localhost:8090 --scene "%SCENE%" --frame "%FRAME%" %*
endlocal
