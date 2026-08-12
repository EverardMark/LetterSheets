@echo off
setlocal
title LetterSheets Time Clock - Fingerprint Setup
echo.
echo   LetterSheets Time Clock - fingerprint bridge setup
echo   (one-time vendor step; clients never run this)
echo.
echo   Pulling files...
tailscale file get "%USERPROFILE%\Downloads" >nul 2>&1
echo   Building and launching the reader bridge...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fpsetup.ps1"
echo.
echo   ------------------------------------------------------------
echo    Finished. Copy ALL the text above and send it to Claude.
echo   ------------------------------------------------------------
echo.
pause
endlocal
