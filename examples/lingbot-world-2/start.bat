@echo off
setlocal enableextensions
REM ==========================================================================
REM Start the Reactor LingBot-World-2 example (Next.js dev, run directly to
REM bypass pnpm 11's install-check).
REM
REM Args (any order, all optional):
REM   cloud     VIDEO via api.reactor.inc  (default; needs REACTOR_API_KEY)
REM   local     VIDEO via http://localhost:8080  (run run_reactor_server.bat first)
REM   director  HUMAN DIRECTOR on ws://localhost:8090  (run run_coordinator.bat first)
REM
REM Examples:
REM   start.bat                     cloud video, no director
REM   start.bat local               local video
REM   start.bat director            cloud video + human-director loop
REM   start.bat local director      local video + human-director loop
REM ==========================================================================
set "HERE=%~dp0"
cd /d "%HERE%"
set "NEXT=%HERE%node_modules\.bin\next.CMD"

REM --- parse args: video mode (cloud|local) + optional director ---
set "MODE=cloud"
set "DIRECTOR="
:parse
if "%~1"=="" goto parsed
if /i "%~1"=="local" set "MODE=local"
if /i "%~1"=="cloud" set "MODE=cloud"
if /i "%~1"=="director" set "DIRECTOR=1"
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
  echo director: ON    -^> ws://localhost:8090   ^(run run_coordinator.bat first^)
) else (
  echo director: off   ^(pass "director" to enable the human-director loop^)
)

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
