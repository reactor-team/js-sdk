@echo off
setlocal enableextensions
REM Simulate a UI game switch (headless): tells the coordinator the active game is
REM <slug>, so the AI director reloads that scene. Needs the coordinator running.
REM   sim_game.bat case_asteroids       (slug = scene JSON id, or the filename stem)
if "%~1"=="" ( echo ERROR: pass a scene slug, e.g.  sim_game.bat case_asteroids & exit /b 1 )
set "HERE=%~dp0"
cd /d "%HERE%"
set "PY=%HERE%.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" aidirector/sim_game.py %*
endlocal
