@echo off
rem HotspotMap 后端启动脚本
rem 数据库连接串默认使用本地嵌入式库，可通过环境变量 DATABASE_URL 覆盖
setlocal
set "ROOT=%~dp0.."
set "DATABASE_URL=postgres://hotspot:hotspot@localhost:5432/hotspot_map"
node "%ROOT%\apps\api\dist\main.js" >> "%ROOT%\logs\hotspot-api.log" 2>&1
