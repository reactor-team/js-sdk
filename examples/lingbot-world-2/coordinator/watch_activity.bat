@echo off
setlocal enableextensions
REM Headless activity-feed viewer -- prints the coordinator's activity/vitals/mode
REM stream (the same thing the Director panel shows) so you can watch the AI
REM director fire WITHOUT the browser. Pure listener: not billed. Ctrl+C to stop.
REM Needs the coordinator running (start.bat / run_coordinator.bat).
set "HERE=%~dp0"
cd /d "%HERE%"
set "PY=%HERE%.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" aidirector/watch_activity.py %*
endlocal
