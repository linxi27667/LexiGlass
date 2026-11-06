@echo off
chcp 65001 >nul
set "BUBBLE_URL=file:///%~dp0ui/bubble.html"
set "BUBBLE_URL=%BUBBLE_URL:\=/%"

if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="%BUBBLE_URL%" --window-size=365,450 --window-position=1520,560
    exit /b 0
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app="%BUBBLE_URL%" --window-size=365,450 --window-position=1520,560
    exit /b 0
)
start "" "%~dp0ui\bubble.html"
