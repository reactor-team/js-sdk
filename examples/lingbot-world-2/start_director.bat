@echo off
setlocal enableextensions
REM ==========================================================================
REM One-click HUMAN-DIRECTOR loop: launches the History coordinator (:8090) in
REM its own window, then starts the app with the director wired (NEXT_PUBLIC_
REM COORDINATOR_WS=ws://localhost:8090).
REM
REM   start_director.bat            cloud video + director
REM   start_director.bat local      local video (also launches run_reactor_server.bat) + director
REM ==========================================================================
set "HERE=%~dp0"
set "VIDEO=%~1"

REM 1) History coordinator (self-detects if already running on :8090)
echo launching History coordinator (:8090) in a new window...
start "coordinator" cmd /k "%HERE%run_coordinator.bat"

REM 2) local video server too, if local mode
if /i "%VIDEO%"=="local" (
  echo launching local video server (:8080) in a new window...
  start "reactor-local-server" cmd /k "C:\workspace\world\lingbot-world-v2\run_reactor_server.bat"
)

echo waiting for servers to come up...
timeout /t 3 /nobreak >nul

REM 3) the app, director enabled
if /i "%VIDEO%"=="local" (
  echo starting app: LOCAL video + director
  call "%HERE%start.bat" local director
) else (
  echo starting app: CLOUD video + director
  call "%HERE%start.bat" director
)
endlocal
