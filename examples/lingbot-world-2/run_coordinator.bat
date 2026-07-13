@echo off
setlocal enableextensions
REM ==========================================================================
REM Run the History COORDINATOR (coordinator/) on ws://localhost:8090 — the
REM shared-History server that makes the HUMAN DIRECTOR affect the world. Both
REM the Player and the Director connect to it.
REM
REM The coordinator/ folder is self-contained (its own package.json + node_modules
REM with ws + tsx), so we run it from there via its own `npm start`.
REM
REM Wire the app to it:
REM   - Player:  start.bat local-director   (sets NEXT_PUBLIC_COORDINATOR_WS)
REM   - Director panel: set "coordinator ws" = ws://localhost:8090
REM COORDINATOR_PORT overrides 8090.
REM ==========================================================================
set "HERE=%~dp0"
set "COORD=%HERE%coordinator"
if not defined COORDINATOR_PORT set "COORDINATOR_PORT=8090"

where node >nul 2>&1
if errorlevel 1 ( echo ERROR: Node.js not found. & exit /b 1 )
if not exist "%COORD%\package.json" ( echo ERROR: coordinator folder not found: %COORD% & exit /b 1 )

REM already listening? -> don't crash with EADDRINUSE, just report it.
netstat -ano | findstr ":%COORDINATOR_PORT%" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo Coordinator already running on ws://localhost:%COORDINATOR_PORT%  -- nothing to do.
  echo Point the app at it:  NEXT_PUBLIC_COORDINATOR_WS=ws://localhost:%COORDINATOR_PORT%
  echo and set the Director panel "coordinator ws" to the same.
  exit /b 0
)

cd /d "%COORD%"
REM install the coordinator's OWN deps once (ws + tsx) if missing
if not exist "%COORD%\node_modules" (
  echo installing coordinator deps ^(ws + tsx^)...
  call npm install || ( echo ERROR: npm install failed. & exit /b 1 )
)

echo.
echo Coordinator -^> ws://localhost:%COORDINATOR_PORT%   (Ctrl+C to stop)
echo.
call npm start
endlocal
