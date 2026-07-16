@echo off
setlocal enableextensions
REM ==========================================================================
REM One command for the AI director. It runs with --self-feed, so it sources the
REM frame from the active scene's OWN still image (kept in memory on game load) --
REM NO external feeder window, NO active_game.txt. Real local video (a live
REM LINGBOT_FRAME_TAP) still overrides the self-feed whenever it writes newer
REM frames. Normally invoked by start.bat, but usable alone.
REM
REM BILLED: the director makes one NVIDIA API call per look (paced by --fire-cooldown).
REM
REM Usage:  run_ai.bat [scene-slug]   (no slug = start with NO game, follow the UI)
REM ==========================================================================
set "HERE=%~dp0"
set "SLUG=%~1"
REM No default game: with no slug the director starts idle and follows the UI's
REM scene selection. Pass a slug to preload one.
if "%NVIDIA_API_KEY%"=="" ( echo ERROR: set NVIDIA_API_KEY first ^(the AI director is billed^). & exit /b 1 )

netstat -ano | findstr ":8090" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 echo WARNING: no coordinator on ws://localhost:8090 yet -- start it first ^(start.bat / run_coordinator.bat^).

REM The director reads %SCENE% (inherited by the spawned window). Explicitly CLEAR
REM it when no slug is passed, so a leftover SCENE env var can't preload a game --
REM with no slug the director must start empty and follow the UI.
if "%SLUG%"=="" ( set "SCENE=" )
if not "%SLUG%"=="" set "SCENE=../lib/lingbot-cases/%SLUG%.json"
if "%SLUG%"=="" echo AI director ^(self-feed^): NO game yet -- follows the UI selection ^(BILLED per look once a game is picked^).
if not "%SLUG%"=="" echo AI director ^(self-feed^) for "%SLUG%" ^(BILLED per look^).

REM Guard against duplicate directors (= double billing): if a python is already
REM running director_nim.py, don't launch another.
wmic process where "name='python.exe' and commandline like '%%director_nim%%'" get processid 2>nul | findstr /r "[0-9]" >nul
if not errorlevel 1 (
  echo AI director already running -- NOT launching another ^(avoids double billing^).
  echo   to restart it, close the existing "lingbot-ai-director" window first.
) else (
  start "lingbot-ai-director" cmd /k "cd /d %HERE% && run_director_nim.bat --self-feed"
)
echo launched. In the UI: pick a game + set Director mode = ai.
endlocal
