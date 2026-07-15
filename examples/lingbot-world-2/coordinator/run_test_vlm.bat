@echo off
setlocal enableextensions
REM Send ONE image to the NVIDIA VLM and print the reply (test_vlm_image.py).
REM --scene <game.json> switches to director-mode (shows which authored events would fire).
REM Needs NVIDIA_API_KEY (nvapi-... key). Runs via WSL + lingbot-venv (has openai + pillow).
REM Deps (once): uv pip install --python /home/kschmid/lingbot-venv/bin/python openai pillow
REM Usage:  run_test_vlm.bat --image <path> [--prompt "..."] [--scene <game.json>]
REM   e.g.  run_test_vlm.bat --image ..\public\lingbot-cases\jet-ski-cruise.jpg
if "%NVIDIA_API_KEY%"=="" ( echo ERROR: set NVIDIA_API_KEY ^(nvapi-... key^) first & exit /b 1 )
if "%~1"=="" ( echo ERROR: pass --image ^<path^> ^(test_vlm_image.py needs an image^) & exit /b 1 )
wsl -e bash -lc "cd /mnt/c/workspace/world/REACTOR_js-sdk/examples/lingbot-world-2/coordinator && NVIDIA_API_KEY='%NVIDIA_API_KEY%' /home/kschmid/lingbot-venv/bin/python vlm/test_vlm_image.py %*"
endlocal
