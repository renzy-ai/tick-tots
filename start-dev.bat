@echo off
cd /d "%~dp0"

REM 优先用 PATH 中的 node；否则用脚本同目录下的 node.exe；都没有则提示安装
where node >nul 2>nul
if %errorlevel%==0 (
  set "NODE=node"
) else (
  if exist "%~dp0node.exe" (
    set "NODE=%~dp0node.exe"
  ) else (
    echo [错误] 未找到 Node.js。请安装 Node.js 并加入 PATH，或将 node.exe 放在本脚本同目录。
    pause
    exit /b 1
  )
)

echo Starting TickTots dev environment...
echo   Server (API + static) : http://localhost:3010/
echo   Vite dev (hot-reload) : http://localhost:5173/
start "TickTots-Server" "%NODE%" server/index.js
start "TickTots-Dev" "%NODE%" node_modules/vite/bin/vite.js --host 0.0.0.0 --port 5173
timeout /t 3 >nul
echo Done. Use http://localhost:5173/ for development (auto reload on save).
