@echo off
setlocal
chcp 936 >nul
title HotspotMap 一键启动
color 0A
cd /d "%~dp0"

REM =====自动定位项目根目录（兼容目录嵌套）=====
if exist "package.json" goto :root_ok
for /d %%D in (*) do (
  if exist "%%D\package.json" (
    cd /d "%%D"
    goto :root_ok
  )
)
echo [错误] 未找到 package.json，请确认项目文件完整。
pause
exit /b 1
:root_ok

echo ============================================
echo   HotspotMap 世界热点地图 - 一键启动
echo ============================================
echo.

REM 检查 Node.js
where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装 Node.js 20 或更高版本。
  echo 下载地址: https://nodejs.org/
  pause
  exit /b 1
)

REM 安装依赖（首次）
if not exist "node_modules" (
  echo [首次运行] 正在安装依赖，可能需要几分钟...
  where pnpm >nul 2>&1
  if errorlevel 1 (
    echo [首次运行] 正在安装 pnpm...
    call npm install -g pnpm
  )
  call pnpm install --config.confirmModulesPurge=false
  if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
  echo [完成] 依赖安装完成
)

REM 构建后端（首次）
if not exist "apps\api\dist\main.js" (
  echo [首次运行] 正在构建后端...
  call pnpm build
  if errorlevel 1 (
    echo [错误] 构建失败。
    pause
    exit /b 1
  )
  echo [完成] 构建完成
)

REM 启动服务（优先计划任务，否则直接启动进程）
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-services.ps1"

echo.
echo 正在等待服务就绪...
set /a tries=0
:wait_api
set /a tries+=1
if %tries% gtr 45 (
  echo [错误] 服务启动超时，请查看 logs 目录下的日志文件。
  pause
  exit /b 1
)
curl -s -o nul -m 2 http://localhost:3000/readyz >nul 2>&1
if errorlevel 1 (
  timeout /t 2 /nobreak >nul
  goto wait_api
)
echo [就绪] 后端服务已就绪
set /a tries=0
:wait_web
set /a tries+=1
if %tries% gtr 20 (
  echo [提示] 前端尚未就绪，稍后自动打开浏览器...
  goto open
)
curl -s -o nul -m 2 http://localhost:5173/ >nul 2>&1
if errorlevel 1 (
  timeout /t 2 /nobreak >nul
  goto wait_web
)
:open
echo [完成] 正在打开浏览器...
start "" "http://localhost:5173"
echo.
echo 提示：关闭本窗口不影响服务运行。网页打不开时再次双击本文件即可。
echo.
pause
exit /b 0
