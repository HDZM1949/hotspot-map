@echo off
rem HotspotMap 前端启动脚本（Vite 开发服务器）
setlocal
set "ROOT=%~dp0.."
node "%ROOT%\apps\web\node_modules\vite\bin\vite.js" "%ROOT%\apps\web" >> "%ROOT%\logs\hotspot-web.log" 2>&1
