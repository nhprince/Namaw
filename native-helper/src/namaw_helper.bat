@echo off
set "PY=py"
where py >nul 2>nul
if errorlevel 1 set "PY=python"
"%PY%" -u "%~dp0namaw_helper.py" %*
