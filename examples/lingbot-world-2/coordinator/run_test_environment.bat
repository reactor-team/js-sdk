@echo off
setlocal enableextensions
REM Environment / director scene-control tests for the `movement-test` scene: add objects
REM (cars), transform objects (billboards->neon), change object state (traffic light->red),
REM hazard (crash/flood), add water (flood->swim/dive), and physics (low gravity). Pure --
REM no VLM / coordinator / network, NOT billed.
REM   run_test_environment.bat
cd /d "%~dp0"
set "PY=%~dp0.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" aidirector/test_environment.py
endlocal
