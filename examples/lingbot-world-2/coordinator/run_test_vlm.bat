@echo off
setlocal enableextensions
REM Send ONE image to the NVIDIA VLM and print the reply (test_vlm_image.py).
REM For the scene/director path (which events a frame would fire) use run_test_director.bat.
REM Runs on the coordinator's NATIVE Windows venv (.venv) -- no WSL. Needs NVIDIA_API_KEY.
REM Usage:  run_test_vlm.bat [--image <path>] [--prompt "..."]
REM   no args -> the default shark image; or pass --image to override.
if "%NVIDIA_API_KEY%"=="" ( echo ERROR: set NVIDIA_API_KEY ^(nvapi-... key^) first & exit /b 1 )
set "HERE=%~dp0"
cd /d "%HERE%"
set "PY=%HERE%.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
set "DEFAULT_IMG=C:\workspace\world\REACTOR_js-sdk\assets\shark.jpg"
REM no args -> run the default image; otherwise pass everything through as-is.
if "%~1"=="" (
  "%PY%" aidirector/test_vlm_image.py --image "%DEFAULT_IMG%"
) else (
  "%PY%" aidirector/test_vlm_image.py %*
)
endlocal
