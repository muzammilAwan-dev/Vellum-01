@echo off
setlocal
title Dev Server Launcher

:: 1. Ensure we are running from the directory where the .bat file is located (the root folder)
cd /d "%~dp0"

:: 2. Check if package.json exists to prevent errors if run in the wrong place
if not exist "package.json" (
    echo [ERROR] package.json not found in this directory!
    echo Please place this script in your project's root folder.
    pause
    exit /b 1
)

echo [1/3] Launching development server...

:: 3. Start the dev server in a separate persistent window so you can see logs
start "Dev Server" cmd /k "npm run dev"
echo ========================================================
echo  Success! Dev server is running and browser has been opened.
echo ========================================================
endlocal
exit