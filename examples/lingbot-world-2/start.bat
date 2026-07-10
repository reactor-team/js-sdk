@echo off
setlocal enableextensions
REM ==========================================================================
REM Start the Reactor LingBot-World-2 example (Next.js dev, run directly to
REM bypass pnpm 11's install-check).
REM
REM Mode (arg 1) selects the backend -- the local server is OPTIONAL:
REM   start.bat            -> CLOUD (api.reactor.inc; needs REACTOR_API_KEY; no local server)
REM   start.bat cloud      -> CLOUD (same as default)
REM   start.bat local      -> LOCAL (http://localhost:8080; run run_reactor_server.bat first)
REM
REM The chosen URL is exported as NEXT_PUBLIC_COORDINATOR_URL, which takes
REM precedence over .env.local, so you don't have to edit .env.local to switch.
REM ==========================================================================
set "HERE=%~dp0"
cd /d "%HERE%"
set "NEXT=%HERE%node_modules\.bin\next.CMD"

set "MODE=%~1"
if "%MODE%"=="" set "MODE=cloud"
if /i "%MODE%"=="local" (
  set "NEXT_PUBLIC_COORDINATOR_URL=http://localhost:8080"
  echo mode: LOCAL  -^> http://localhost:8080   ^(start run_reactor_server.bat first^)
) else (
  set "NEXT_PUBLIC_COORDINATOR_URL=https://api.reactor.inc"
  echo mode: CLOUD  -^> https://api.reactor.inc   ^(local server not needed^)
)

where node >nul 2>&1
if errorlevel 1 ( echo ERROR: Node.js not found. Install:  winget install OpenJS.NodeJS.LTS & exit /b 1 )

REM --- ensure .env.local has a key (cloud) ---
if not exist "%HERE%.env.local" (
  if defined REACTOR_API_KEY (
    >"%HERE%.env.local" echo REACTOR_API_KEY=%REACTOR_API_KEY%
  ) else if exist "%HERE%.env.example" (
    copy /y "%HERE%.env.example" "%HERE%.env.local" >nul
  )
)
if /i not "%MODE%"=="local" (
  findstr /b /c:"REACTOR_API_KEY=rk_" "%HERE%.env.local" >nul 2>&1
  if errorlevel 1 echo WARNING: cloud mode but no REACTOR_API_KEY=rk_... in .env.local -- session will 401.
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
