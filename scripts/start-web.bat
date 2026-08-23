@echo off
rem HotspotMap ǰ������ű���Vite ������������
setlocal
set "ROOT=%~dp0.."
node "%ROOT%\apps\web\node_modules\vite\bin\vite.js" "%ROOT%\apps\web" >> "%ROOT%\logs\hotspot-web.log" 2>&1
