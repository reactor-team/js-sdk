@echo off
setlocal enableextensions
REM Movement / locomotion-rig tests for the `movement-test` scene: third-person camera,
REM jump/crouch/stand, idle-vs-moving locomotion, sprint + emote + swim actions, a
REM director that adds cars, and a persistent low-gravity physics variant. Pure -- no
REM VLM / coordinator / network, NOT billed.
REM   run_test_movement.bat
cd /d "%~dp0"
set "PY=%~dp0.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" aidirector/test_movement.py
endlocal
