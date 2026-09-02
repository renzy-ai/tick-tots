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

echo Starting TickTots server...
echo URL: http://localhost:3010/
echo (Closing this window will NOT stop the server. To stop it, end the node process in Task Manager.)
start "" "%NODE%" server/index.js
timeout /t 2 >nul
echo Done. Open http://localhost:3010/ in your browser.
