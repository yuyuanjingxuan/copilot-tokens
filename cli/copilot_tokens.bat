@echo off
rem Double-click to run: Copilot token usage for the last 7 days
rem Extra args: copilot_tokens.bat --all / --days 30 / --json --out usage.json
python "%~dp0copilot_tokens.py" %*
echo.
pause
