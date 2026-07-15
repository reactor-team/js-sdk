@echo off
setlocal enableextensions
REM Automated smoke-test: probes (cosmos) + director decision (cosmos) + optional qwen override.
REM Exit 0 = all pass, 1 = a failure. Needs NVIDIA_API_KEY. Native Windows (coordinator\.venv).
REM Usage:  verify.bat          (fast: ~2 billed calls)
REM         verify.bat --full   (also the ~60s qwen override)
if "%NVIDIA_API_KEY%"=="" ( echo ERROR: set NVIDIA_API_KEY ^(nvapi-... key^) first & exit /b 1 )
cd /d "%~dp0"
if "%PY%"=="" set "PY=%~dp0.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" aidirector/verify.py %*
endlocal
