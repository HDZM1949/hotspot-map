@echo off
rem HotspotMap 采集调度器（常驻）：GDELT 15min / USGS 5min / EONET 10min
rem
rem 安全说明：若你的网络 HTTPS 流量被拦截导致数据源证书校验失败，
rem 可设置环境变量 INGEST_TLS_BYPASS=1 跳过证书校验（仅限受信任的本地网络）。
rem 正常网络环境无需设置。
setlocal
if "%INGEST_TLS_BYPASS%"=="1" set "NODE_TLS_REJECT_UNAUTHORIZED=0"
set "ROOT=%~dp0.."
set "DATABASE_URL=postgres://hotspot:hotspot@localhost:5432/hotspot_map"
node "%ROOT%\packages\ingesters\node_modules\tsx\dist\cli.mjs" "%ROOT%\packages\ingesters\src\scheduler.ts" >> "%ROOT%\logs\hotspot-ingest.log" 2>&1
