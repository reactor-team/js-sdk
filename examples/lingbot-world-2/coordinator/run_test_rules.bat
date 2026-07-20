@echo off
setlocal enableextensions
REM Unit-test the rule decider (./rules.ts) -- the json-rules-engine that DECIDES
REM events in rules-decide mode (the default now that the VLM decide is off). Pure:
REM no coordinator / WebSocket / VLM, not billed. Covers every `requires` gate kind
REM (fired / firedAny / notFired / minChunks / min|maxHealth / chance), the
REM observation-driven explicit-rule path, and the real jet-ski scene arc.
REM   run_test_rules.bat
cd /d "%~dp0"
npx --yes tsx --test rules.test.ts
endlocal
