@echo off
REM Double-click to start auto-deploy. Keep this window open while you work.
cd /d "%~dp0"
node scripts\auto-deploy.mjs
pause
