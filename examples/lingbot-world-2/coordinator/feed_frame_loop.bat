@echo off
setlocal enableextensions enabledelayedexpansion
REM ==========================================================================
REM Repeatedly feed the AI director a still frame so it keeps deciding. In cloud
REM video mode nothing writes the frame tap, so this stands in as the frame
REM source: it re-copies a scene image onto frame.png every N seconds (bumping
REM the mtime), which is the director's trigger to look again. Ctrl+C to stop.
REM
REM Usage:  feed_frame_loop.bat [slug] [seconds]
REM   feed_frame_loop.bat                 -> templerun every 8s
REM   feed_frame_loop.bat jet-ski-cruise 6
REM ==========================================================================
set "HERE=%~dp0"
set "SLUG=%~1"
set "SECS=%~2"
if "%SECS%"=="" set "SECS=8"
echo frame feed: waiting for the active game ^(follows active_game.txt; Ctrl+C to stop^)
:loop
REM Follow the UI's active game: the director writes the current image path here on
REM a game load, so the fed still matches whatever scene is loaded. No game yet ->
REM feed nothing (the director idles until a scene is picked).
set "CUR=%SLUG%"
if exist "%HERE%active_game.txt" set /p CUR=<"%HERE%active_game.txt"
if not "!CUR!"=="" (
  call "%HERE%feed_frame.bat" "!CUR!"
) else (
  echo   ^(no active game yet -- pick one in the UI^)
)
timeout /t %SECS% /nobreak >nul
goto loop
