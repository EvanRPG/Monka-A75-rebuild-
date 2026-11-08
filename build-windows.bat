@echo off
rem Builds the Monka A75 driver installer on this PC.
rem Needs Node.js and Rust (rustup), which are already installed here.
cd /d "%~dp0app"
echo.
echo [1/2] Installing packages...
call npm ci
if errorlevel 1 goto fail
echo.
echo [2/2] Building. The first time takes 5-15 minutes, please wait...
call npx tauri build
if errorlevel 1 goto fail
echo.
echo DONE. The installer is in the folder that just opened.
explorer "%~dp0app\src-tauri\target\release\bundle\nsis"
pause
exit /b 0
:fail
echo.
echo BUILD FAILED. Please take a screenshot of this window and send it to Claude.
pause
exit /b 1
