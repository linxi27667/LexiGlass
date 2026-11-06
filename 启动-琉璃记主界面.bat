@echo off
chcp 65001 >nul
set "APP_URL=file:///%~dp0ui/index.html"
set "APP_URL=%APP_URL:\=/%"

if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="%APP_URL%" --window-size=1240,800
    exit /b 0
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app="%APP_URL%" --window-size=1240,800
    exit /b 0
)
start "" "%~dp0ui\index.html"
