@echo off
setlocal enableextensions
REM ==========================================================================
REM Start the Reactor LingBot-World-2 example (Next.js dev, run directly to
REM bypass pnpm 11's install-check).
REM
REM Args (any order, all optional):
REM   cloud       VIDEO via api.reactor.inc  (default; needs REACTOR_API_KEY)
REM   local       VIDEO via http://localhost:8080  (run run_reactor_server.bat first)
REM   nodirector  disable the director wiring (no coordinator auto-start)
REM
REM ONE COMMAND, EVERYTHING ON BY DEFAULT. `start.bat` launches, in their own
REM windows: the coordinator (free local relay), and -- if NVIDIA_API_KEY is set
REM -- the AI director + a frame-feed loop (BILLED, ~1 API call / 8s, scene
REM templerun), then the dev server. So the Director panel, live state, and the
REM AI activity feed populate out of the box. No key set -> AI director is skipped
REM (coordinator + UI still come up). Use `nodirector` to skip all of it.
REM
REM Examples:
REM   start.bat                     cloud video + coordinator + AI director (if key)
REM   start.bat local               same, with local video
REM   start.bat nodirector          cloud video only, no coordinator/AI
REM ==========================================================================
set "HERE=%~dp0"
cd /d "%HERE%"
set "NEXT=%HERE%node_modules\.bin\next.CMD"

REM --- parse args: video mode (cloud|local) + director on/off (on by default) ---
set "MODE=cloud"
set "DIRECTOR=1"
:parse
if "%~1"=="" goto parsed
if /i "%~1"=="local" set "MODE=local"
if /i "%~1"=="cloud" set "MODE=cloud"
if /i "%~1"=="director" set "DIRECTOR=1"
if /i "%~1"=="nodirector" set "DIRECTOR="
shift
goto parse
:parsed

if /i "%MODE%"=="local" (
  set "NEXT_PUBLIC_COORDINATOR_URL=http://localhost:8080"
  echo video   : LOCAL  -^> http://localhost:8080   ^(run run_reactor_server.bat first^)
) else (
  set "NEXT_PUBLIC_COORDINATOR_URL=https://api.reactor.inc"
  echo video   : CLOUD  -^> https://api.reactor.inc
)
if defined DIRECTOR (
  set "NEXT_PUBLIC_COORDINATOR_WS=ws://localhost:8090"
  echo director: ON    -^> ws://localhost:8090
) else (
  echo director: off   ^(pass "nodirector" was given^)
)

REM auto-start the coordinator (free local relay) in its own window if director
REM is on and nothing is already listening on the port.
set "COORDSTARTED="
if defined DIRECTOR (
  netstat -ano | findstr ":8090" | findstr "LISTENING" >nul 2>&1
  if errorlevel 1 (
    echo coordinator: starting in a new window...
    start "lingbot-coordinator" "%HERE%run_coordinator.bat"
    set "COORDSTARTED=1"
  ) else (
    echo coordinator: already listening on ws://localhost:8090
  )
)

REM AI director stack (director + frame feed) -- BILLED, so only when a key is
REM present. Wait a moment first if we just launched the coordinator so the
REM director's websocket connect lands after the port is bound.
if defined DIRECTOR if defined NVIDIA_API_KEY (
  if defined COORDSTARTED ( echo waiting for coordinator to bind... & timeout /t 4 /nobreak >nul )
  echo AI director: starting ^(BILLED once a game is picked^) -- no game yet, follows the UI...
  call "%HERE%coordinator\run_ai.bat"
)
if defined DIRECTOR if not defined NVIDIA_API_KEY echo AI director: off -- set NVIDIA_API_KEY to auto-start it ^(billed^).

where node >nul 2>&1
if errorlevel 1 ( echo ERROR: Node.js not found. Install:  winget install OpenJS.NodeJS.LTS & exit /b 1 )

REM --- ensure .env.local has a key (cloud video) ---
if not exist "%HERE%.env.local" (
  if defined REACTOR_API_KEY (
    >"%HERE%.env.local" echo REACTOR_API_KEY=%REACTOR_API_KEY%
  ) else if exist "%HERE%.env.example" (
    copy /y "%HERE%.env.example" "%HERE%.env.local" >nul
  )
)
if /i not "%MODE%"=="local" (
  findstr /b /c:"REACTOR_API_KEY=rk_" "%HERE%.env.local" >nul 2>&1
  if errorlevel 1 echo WARNING: cloud video but no REACTOR_API_KEY=rk_... in .env.local -- session will 401.
)

REM --- install deps once if the next binary is missing ---
if not exist "%NEXT%" (
  echo installing dependencies ^(first run, slow^)...
  call npx --yes pnpm@latest install
)
if not exist "%NEXT%" ( echo ERROR: dependencies not installed. & exit /b 1 )

echo.
echo dev server -^> http://localhost:3000   (Ctrl+C to stop)
echo.
call "%NEXT%" dev
endlocal
