@echo off
setlocal
title LetterSheets Time Clock - Build Fingerprint Bridge
echo.
echo   Building the fingerprint bridge (one-time vendor step)...
echo.
tailscale file get "%USERPROFILE%\Downloads" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fpbuild.ps1"
echo.
echo   ------------------------------------------------------------
echo    Finished. Copy ALL the text above and send it to Claude.
echo   ------------------------------------------------------------
echo.
pause
endlocal
