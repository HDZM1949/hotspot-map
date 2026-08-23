@echo off
rem HotspotMap ���ݿ�����ű���Ƕ��ʽ PostgreSQL�����谲װ��
rem ����Ŀ¼Ĭ�� <��Ŀ��>/.pgdata����ͨ���������� DB_DATA_DIR ����
setlocal
set "ROOT=%~dp0.."
node "%ROOT%\scripts\db.mjs" >> "%ROOT%\logs\hotspot-db.log" 2>&1
