@echo off
setlocal enableextensions
REM AI Director (Qwen2.5-VL-3B) -> coordinator ops. LOCAL path.
REM Deps (once): pip install websockets accelerate "transformers>=4.49" (torch from cu130 index).
REM Model is already cached (Qwen/Qwen2.5-VL-3B-Instruct) so no download.
REM Watches frame.png for the latest rendered frame; wire engine.py to dump it there.
REM Check nvidia-smi first: this shares the GPU with the 14B generator.
set "HF_DEACTIVATE_ASYNC_LOAD=1"
set "HERE=%~dp0"
if "%PYTHON%"=="" set "PYTHON=python"
if "%SCENE%"=="" set "SCENE=%HERE%..\lib\lingbot-cases\noir-alley-combat.json"
if "%FRAME%"=="" set "FRAME=%HERE%frame.png"
"%PYTHON%" "%HERE%director_vlm.py" --url ws://localhost:8090 --scene "%SCENE%" --frame "%FRAME%" %*
endlocal
