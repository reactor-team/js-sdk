@echo off
setlocal enableextensions
REM Pure unit tests for scene_probes.py (derive/resolve) -- tri-state answers, the
REM unknown="don't update state" rule, word-boundary gloss cut, and the player-layer
REM invariant fold. No VLM / coordinator / network, NOT billed.
REM   run_test_scene_probes.bat
cd /d "%~dp0"
set "PY=%~dp0.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" aidirector/test_scene_probes.py
endlocal
