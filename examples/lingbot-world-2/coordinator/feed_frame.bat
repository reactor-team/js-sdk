@echo off
setlocal enableextensions
REM ==========================================================================
REM Feed the LIVE AI director a still frame so it decides ONCE, with no video
REM pipeline. In cloud video mode nothing writes the frame tap, so the director
REM sits at "idle: frame not found". This copies a scene image onto the file it
REM watches (coordinator\frame.png) -- the copy updates the mtime, which is the
REM director's trigger to look. Re-run to make it decide again.
REM
REM Usage:  feed_frame.bat [slug|path]
REM   feed_frame.bat                 -> public\lingbot-cases\templerun.jpg
REM   feed_frame.bat jet-ski-cruise  -> public\lingbot-cases\jet-ski-cruise.jpg
REM   feed_frame.bat C:\some\img.jpg -> that exact file
REM
REM Prereqs: coordinator running (run_coordinator.bat) + the AI director running
REM   (run_director_nim.bat, watching frame.png). This does NOT start them.
REM ==========================================================================
set "HERE=%~dp0"
set "IMG=%~1"
if "%IMG%"=="" set "IMG=templerun"

REM An existing file is used as-is; otherwise treat the arg as a scene slug.
if exist "%IMG%" (
  set "SRC=%IMG%"
) else (
  set "SRC=%HERE%..\public\lingbot-cases\%IMG%.jpg"
)
if not exist "%SRC%" ( echo ERROR: image not found: %SRC% & exit /b 1 )

copy /y "%SRC%" "%HERE%frame.png" >nul
if errorlevel 1 ( echo ERROR: copy failed. & exit /b 1 )
REM Windows `copy` keeps the SOURCE's timestamp, so re-feeding the same image
REM leaves frame.png's mtime unchanged and the director (which triggers on mtime
REM change) won't re-decide. Bump the modified time to NOW so every run fires.
copy /b "%HERE%frame.png"+,, "%HERE%frame.png" >nul 2>&1
echo fed frame: %SRC%
echo        -^> %HERE%frame.png
echo watch the director shell for "new frame" then a "fire", and the coordinator
echo for "[coordinator] ai assert ...".  Re-run this to make it decide again.
endlocal
