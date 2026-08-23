@echo off
rem HotspotMap �ɼ�����������פ����GDELT 15min / USGS 5min / EONET 10min
rem
rem ��ȫ˵������������� HTTPS ���������ص�������Դ֤��У��ʧ�ܣ�
rem �����û������� INGEST_TLS_BYPASS=1 ����֤��У�飨���������εı������磩��
rem �������绷���������á�
setlocal
if "%INGEST_TLS_BYPASS%"=="1" set "NODE_TLS_REJECT_UNAUTHORIZED=0"
set "ROOT=%~dp0.."
set "DATABASE_URL=postgres://hotspot:hotspot@localhost:5432/hotspot_map"
node "%ROOT%\packages\ingesters\node_modules\tsx\dist\cli.mjs" "%ROOT%\packages\ingesters\src\scheduler.ts" >> "%ROOT%\logs\hotspot-ingest.log" 2>&1
