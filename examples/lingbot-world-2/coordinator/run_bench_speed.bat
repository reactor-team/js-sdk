@echo off
setlocal enableextensions
REM ==========================================================================
REM Speed A/B benchmark for the director's VLM calls: times decide + probe with
REM reasoning ON vs OFF and frame 512 vs 768, and prints the speedup.
REM
REM BILLED: ~6 NVIDIA calls. Needs NVIDIA_API_KEY. Runs on the coordinator .venv.
REM
REM Usage:  run_bench_speed.bat [image] [repeat]
REM   run_bench_speed.bat                                 (defaults: noir frame, 2x)
REM   run_bench_speed.bat ..\public\lingbot-cases\f1-race.jpg 3
REM ==========================================================================
set "HERE=%~dp0"
if "%NVIDIA_API_KEY%"=="" ( echo ERROR: set NVIDIA_API_KEY ^(nvapi-... key^) first & exit /b 1 )
set "IMG=%~1"
if "%IMG%"=="" set "IMG=%HERE%..\public\lingbot-cases\noir-alley-patrol.jpg"
set "REPEAT=%~2"
if "%REPEAT%"=="" set "REPEAT=2"
set "PY=%HERE%.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" "%HERE%aidirector\bench_speed.py" --image "%IMG%" --repeat %REPEAT%
endlocal
