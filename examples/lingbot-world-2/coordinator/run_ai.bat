@echo off
setlocal enableextensions
REM ==========================================================================
REM One command for the whole AI-director stack: launches the AI director AND a
REM frame-feed loop, each in its own window, so the activity feed populates
REM without juggling terminals. Normally invoked by start.bat, but usable alone.
REM
REM BILLED: the director makes one NVIDIA API call per fed frame (~1 / 8s).
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
REM with no slug the director must start empty and follow the UI. The feed loop
REM copies the active game's image onto frame.png (via active_game.txt).
if "%SLUG%"=="" ( set "SCENE=" )
if not "%SLUG%"=="" set "SCENE=../lib/lingbot-cases/%SLUG%.json"
if "%SLUG%"=="" echo AI director + frame feed: NO game yet -- follows the UI selection ^(BILLED per frame once a game is picked^).
if not "%SLUG%"=="" echo AI director + frame feed for "%SLUG%" ^(BILLED per frame^).

REM Director and feeder are launched INDEPENDENTLY -- a stale/closed feeder is the
REM usual cause of "waiting for a new frame", so the feed loop must start even when
REM a director is already up (otherwise start.bat comes up with no frames).

REM Guard against duplicate directors (= double billing): if a python is already
REM running director_nim.py, don't launch another -- but still (re)start the feeder.
wmic process where "name='python.exe' and commandline like '%%director_nim%%'" get processid 2>nul | findstr /r "[0-9]" >nul
if not errorlevel 1 (
  echo AI director already running -- NOT launching another ^(avoids double billing^).
  echo   to restart it, close the existing "lingbot-ai-director" window first.
) else (
  start "lingbot-ai-director" cmd /k "cd /d %HERE% && run_director_nim.bat"
)

REM Guard against duplicate feeders the same way, then launch if none is running.
wmic process where "name='cmd.exe' and commandline like '%%feed_frame_loop%%'" get processid 2>nul | findstr /r "[0-9]" >nul
if not errorlevel 1 (
  echo frame feed already running -- not launching another.
) else (
  start "lingbot-frame-feed" cmd /k "cd /d %HERE% && feed_frame_loop.bat"
)
echo launched. In the UI: pick a game + set Director mode = ai.
endlocal
