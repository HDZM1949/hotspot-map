@echo off
rem HotspotMap 数据库启动脚本（嵌入式 PostgreSQL，无需安装）
rem 数据目录默认 <项目根>/.pgdata，可通过环境变量 DB_DATA_DIR 覆盖
setlocal
set "ROOT=%~dp0.."
node "%ROOT%\scripts\db.mjs" >> "%ROOT%\logs\hotspot-db.log" 2>&1
