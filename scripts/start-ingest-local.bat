@echo off
rem ����ר�òɼ������װ���� gitignore��������Ŀ������
rem ��;���������� HTTPS �����أ���Ҫ����֤��У�飨INGEST_TLS_BYPASS=1��
rem �÷����ƻ����� hotspot-ingest ָ���ļ����ɱ������ã����ύ���ֿ⣩
set INGEST_TLS_BYPASS=1
call "%~dp0start-ingest.bat"
