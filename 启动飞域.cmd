@echo off
setlocal
cd /d "%~dp0"
set "FEIYU_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "FEIYU_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
"%FEIYU_NODE%" "%~dp0scripts\start-local.cjs" --open
if errorlevel 1 pause
endlocal
