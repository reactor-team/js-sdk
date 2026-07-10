@echo off
setlocal enableextensions
REM ==========================================================================
REM One-click LOCAL mode: launches the local Reactor server (:8080, your fp8/test
REM engine) in its own window, then starts the frontend pointed at it (:3000).
REM
REM   start_local.bat            -> test-pattern engine (no GPU, validates transport)
REM For the REAL fp8 model: start the server in WSL with LINGBOT_ENGINE=real instead,
REM then run:  start.bat local
REM ==========================================================================
set "HERE=%~dp0"
set "SERVER=C:\workspace\world\lingbot-world-v2\run_reactor_server.bat"

if not exist "%SERVER%" ( echo ERROR: local server not found: %SERVER% & exit /b 1 )

echo launching local Reactor server (:8080) in a new window...
start "reactor-local-server" cmd /k "%SERVER%"

echo waiting for the server to come up...
timeout /t 3 /nobreak >nul

echo starting frontend in LOCAL mode -^> http://localhost:3000
call "%HERE%start.bat" local
endlocal
