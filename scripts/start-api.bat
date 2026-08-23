@echo off
rem HotspotMap �������ű�
rem ���ݿ����Ӵ�Ĭ��ʹ�ñ���Ƕ��ʽ�⣬��ͨ���������� DATABASE_URL ����
setlocal
set "ROOT=%~dp0.."
set "DATABASE_URL=postgres://hotspot:hotspot@localhost:5432/hotspot_map"
node "%ROOT%\apps\api\dist\main.js" >> "%ROOT%\logs\hotspot-api.log" 2>&1
