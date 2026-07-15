@echo off
setlocal enableextensions
REM Live integration verify for run_director_nim via a MOCK coordinator (WS server + frame).
REM Checks the director connects, probes+decides, and emits ops. Needs NVIDIA_API_KEY.
if "%NVIDIA_API_KEY%"=="" ( echo ERROR: set NVIDIA_API_KEY ^(nvapi-... key^) first & exit /b 1 )
cd /d "%~dp0"
if "%PY%"=="" set "PY=%~dp0.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" vlm/verify_director_live.py %*
endlocal
