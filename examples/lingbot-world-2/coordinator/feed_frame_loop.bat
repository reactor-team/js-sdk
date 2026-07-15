@echo off
setlocal enableextensions
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
if "%SLUG%"=="" set "SLUG=templerun"
set "SECS=%~2"
if "%SECS%"=="" set "SECS=8"
echo feeding "%SLUG%" every %SECS%s  (Ctrl+C to stop)
:loop
call "%HERE%feed_frame.bat" "%SLUG%"
timeout /t %SECS% /nobreak >nul
goto loop
