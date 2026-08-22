@echo off
rem 本机专用采集启动包装（已 gitignore，不随项目发布）
rem 用途：本机网络 HTTPS 被拦截，需要跳过证书校验（INGEST_TLS_BYPASS=1）
rem 用法：计划任务 hotspot-ingest 指向本文件（由本机配置，勿提交到仓库）
set INGEST_TLS_BYPASS=1
call "%~dp0start-ingest.bat"
