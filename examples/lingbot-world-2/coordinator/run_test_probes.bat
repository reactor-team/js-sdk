@echo off
setlocal enableextensions
REM Test the VLM state-probe flow (scene_probes derive -> VLM -> resolve) on one frame.
REM Defaults: shark.jpg + jet-ski-cruise.json. Needs NVIDIA_API_KEY. Native Windows Python
REM (no WSL, no GPU -- just a cloud API call). Deps (once): pip install openai pillow
REM Usage:  run_test_probes.bat  [--image <path>] [--scene <game.json>]
if "%NVIDIA_API_KEY%"=="" ( echo ERROR: set NVIDIA_API_KEY ^(nvapi-... key^) first & exit /b 1 )
cd /d "%~dp0"
REM Prefer the local venv (.venv, openai+pillow); fall back to PATH python.
if "%PY%"=="" set "PY=%~dp0.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" test_probes.py %*
endlocal
