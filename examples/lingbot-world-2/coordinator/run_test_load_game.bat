@echo off
setlocal enableextensions
REM Test loading a game by slug WITHOUT the UI/coordinator/VLM (not billed). Verifies
REM every scene the UI could pick resolves (by JSON id or filename) and loads with a
REM real identity + director events + a probe checklist -- the same path the director's
REM reload_game uses when the UI broadcasts a game.
REM   run_test_load_game.bat              (all scenes)
REM   run_test_load_game.bat case1_0036   (one slug)
set "HERE=%~dp0"
cd /d "%HERE%"
set "PY=%HERE%.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" aidirector/test_load_game.py %*
endlocal
