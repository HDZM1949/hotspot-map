@echo off
rem ============================================================
rem  HotspotMap 世界热点地图 - 一键启动
rem  双击本文件：自动检查环境、启动服务、打开网页
rem  首次运行会自动安装依赖并构建（需要几分钟，请耐心等待）
rem  * 请以普通方式双击运行（不要选“以管理员身份运行”），
rem     PostgreSQL 无法以管理员权限启动。
rem ============================================================
setlocal
chcp 65001 >nul
title HotspotMap 一键启动
color 0A
cd /d "%~dp0"

echo ============================================
echo    HotspotMap 世界热点地图 - 一键启动
echo ============================================
echo.

rem ---------- 1. 检查 Node.js ----------
where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未检测到 Node.js。请先安装 Node.js 20 及以上版本：
  echo        https://nodejs.org/
  pause
  exit /b 1
)

rem ---------- 2. 首次运行：安装依赖 ----------
if not exist "node_modules" (
  echo [首次运行] 正在安装依赖，可能需要几分钟，请耐心等待...
  where pnpm >nul 2>&1
  if errorlevel 1 (
    echo [首次运行] 正在安装 pnpm ...
    call npm install -g pnpm
  )
  call pnpm install --config.confirmModulesPurge=false
  if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
  echo [完成] 依赖安装完成
  echo.
)

rem ---------- 3. 首次运行：构建后端 ----------
if not exist "apps\api\dist\main.js" (
  echo [首次运行] 正在构建后端，请稍候...
  call pnpm build
  if errorlevel 1 (
    echo [错误] 构建失败，请查看上方错误信息。
    pause
    exit /b 1
  )
  echo [完成] 构建完成
  echo.
)

rem ---------- 4. 启动服务（数据库 / 后端 / 前端） ----------
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-services.ps1"
if errorlevel 1 (
  echo.
  echo [错误] 服务启动失败，请查看上方提示。
  pause
  exit /b 1
)

rem ---------- 5. 等待后端就绪（最长 90 秒） ----------
echo.
echo 正在等待服务就绪...
set /a tries=0
:wait_api
set /a tries+=1
if %tries% gtr 45 (
  echo [错误] 后端启动超时。请查看 logs\ 目录下的日志文件。
  pause
  exit /b 1
)
curl -s -o nul -m 2 http://localhost:3000/readyz >nul 2>&1
if errorlevel 1 (
  timeout /t 2 /nobreak >nul
  goto wait_api
)
echo [就绪] 后端已就绪

rem ---------- 6. 等待前端就绪，然后打开浏览器 ----------
set /a tries=0
:wait_web
set /a tries+=1
if %tries% gtr 20 (
  echo [提示] 前端尚未完全就绪，稍后会自动打开浏览器...
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
echo 提示：关闭本窗口不影响服务运行。以后随时双击本文件即可。
echo 页面打不开时，再双击一次本文件即可自动修复。
echo.
pause
exit /b 0
