@echo off
cd /d "%~dp0frontend"
echo Starting PitchIQ frontend on http://localhost:5173
call npm.cmd install
call npm.cmd run dev
pause
