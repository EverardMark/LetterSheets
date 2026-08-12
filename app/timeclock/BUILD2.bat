@echo off
setlocal
title LetterSheets Time Clock - Build (v2)
echo.
echo   Building the fingerprint bridge (cleaning junk, then compiling)...
echo.
tailscale file get "%USERPROFILE%\Downloads" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fpbuild2.ps1"
echo.
echo   ------------------------------------------------------------
echo    Finished. Copy ALL the text above and send it to Claude.
echo   ------------------------------------------------------------
echo.
pause
endlocal
