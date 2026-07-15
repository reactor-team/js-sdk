@echo off
setlocal enableextensions
REM Test the AI director's event decision on one frame + injectable state.
REM Defaults: jet-ski scene + shark frame. Needs NVIDIA_API_KEY. Native Windows Python
REM (uses coordinator\.venv). Deps: openai, pillow, websockets.
REM Usage:  run_test_director.bat  [--image <path>] [--scene <game.json>]
REM                                [--health N] [--fired "A,B"] [--facts "..."] [--step N]
if "%NVIDIA_API_KEY%"=="" ( echo ERROR: set NVIDIA_API_KEY ^(nvapi-... key^) first & exit /b 1 )
cd /d "%~dp0"
if "%PY%"=="" set "PY=%~dp0.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" test_director.py %*
endlocal
