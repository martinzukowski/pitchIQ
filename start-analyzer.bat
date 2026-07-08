@echo off
cd /d "%~dp0analyzer"
echo Starting PitchIQ analyzer on http://localhost:8000
if exist .venv\Scripts\python.exe (
    .venv\Scripts\python.exe main.py
) else (
    python main.py
)
pause
