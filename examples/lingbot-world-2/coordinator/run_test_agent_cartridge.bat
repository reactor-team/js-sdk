@echo off
setlocal enableextensions
REM Agent / Game-Cartridge conformance tests for the `agent-test` scene: decomposed
REM World/Character/Actions/Dynamics conditioning, landmark-anchored prompt invariance,
REM player-vs-director split, gated quest progression + reward, VLM visual triggers,
REM and video-only prose. Pure -- no VLM / coordinator / network, NOT billed.
REM   run_test_agent_cartridge.bat
cd /d "%~dp0"
set "PY=%~dp0.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" aidirector/test_agent_cartridge.py
endlocal
