@echo off
cd /d "%~dp0"
chcp 65001 >nul
echo Starting Task Manager...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0startup.ps1"
pause
