@echo off
setlocal enableextensions
REM ==========================================================================
REM One command for the whole AI-director stack: launches the AI director AND a
REM frame-feed loop, each in its own window, so the activity feed populates
REM without juggling terminals. Normally invoked by start.bat, but usable alone.
REM
REM BILLED: the director makes one NVIDIA API call per fed frame (~1 / 8s).
REM
REM Usage:  run_ai.bat [scene-slug]        (default templerun)
REM ==========================================================================
set "HERE=%~dp0"
set "SLUG=%~1"
if "%SLUG%"=="" set "SLUG=templerun"
if "%NVIDIA_API_KEY%"=="" ( echo ERROR: set NVIDIA_API_KEY first ^(the AI director is billed^). & exit /b 1 )

netstat -ano | findstr ":8090" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 echo WARNING: no coordinator on ws://localhost:8090 yet -- start it first ^(start.bat / run_coordinator.bat^).

REM Guard against duplicate directors (= double billing): if a python is already
REM running director_nim.py, don't launch another.
wmic process where "name='python.exe' and commandline like '%%director_nim%%'" get processid 2>nul | findstr /r "[0-9]" >nul
if not errorlevel 1 (
  echo AI director already running -- NOT launching another ^(avoids double billing^).
  echo   to restart it, close the existing "lingbot-ai-director" window first.
  goto :skipdir
)

REM The director reads %SCENE% (inherited by the spawned window); the feed loop
REM copies public\lingbot-cases\<slug>.jpg onto frame.png every 8s.
set "SCENE=../lib/lingbot-cases/%SLUG%.json"
echo AI director + frame feed for "%SLUG%"  ^(BILLED per frame^)
start "lingbot-ai-director" cmd /k "cd /d %HERE% && run_director_nim.bat"
start "lingbot-frame-feed" cmd /k "cd /d %HERE% && feed_frame_loop.bat %SLUG% 8"
echo launched. In the UI: load the "%SLUG%" scene + set Director mode = ai.
:skipdir
endlocal
