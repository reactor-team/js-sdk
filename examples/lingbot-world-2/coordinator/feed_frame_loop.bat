@echo off
setlocal enableextensions enabledelayedexpansion
REM ==========================================================================
REM Feed the AI director a still frame a LIMITED number of times per game, then
REM idle. In cloud video mode nothing writes real frames, so a still stands in --
REM but re-feeding it forever makes the director march through EVERY event (it
REM keeps "seeing a new frame"). So we feed MAXFEEDS times when a game loads, then
REM stop until you switch games (which re-arms it). Real local video doesn't use
REM this loop at all. Follows active_game.txt (the director writes the image path
REM there on a game load). Ctrl+C to stop.
REM
REM Usage:  feed_frame_loop.bat [slug] [seconds] [maxfeeds]   (defaults: - 8 2)
REM ==========================================================================
set "HERE=%~dp0"
set "SLUG=%~1"
set "SECS=%~2"
if "%SECS%"=="" set "SECS=8"
set "MAXFEEDS=%~3"
if "%MAXFEEDS%"=="" set "MAXFEEDS=2"
set "LAST="
set "CNT=0"
echo frame feed: %MAXFEEDS% frame^(s^) per game, then idle until you switch games ^(Ctrl+C to stop^)
:loop
set "CUR=%SLUG%"
if exist "%HERE%active_game.txt" set /p CUR=<"%HERE%active_game.txt"
if "!CUR!"=="" (
  echo   no active game yet -- pick one in the UI
  timeout /t %SECS% /nobreak >nul
  goto loop
)
REM New game -> re-arm the per-game feed counter.
if not "!CUR!"=="!LAST!" ( set "LAST=!CUR!" & set "CNT=0" )
if !CNT! LSS %MAXFEEDS% (
  call "%HERE%feed_frame.bat" "!CUR!"
  set /a CNT+=1
) else (
  echo   fed %MAXFEEDS%x for this game -- idle until you switch games
)
timeout /t %SECS% /nobreak >nul
goto loop
