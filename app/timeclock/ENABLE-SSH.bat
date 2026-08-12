@echo off
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting administrator rights...
  powershell -Command "Start-Process cmd -ArgumentList '/c \"%~f0\"' -Verb RunAs"
  exit /b
)
title Enable SSH for Claude
echo.
echo   Turning on Windows SSH so Claude can manage this kiosk directly...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0enable-ssh.ps1"
echo.
pause
