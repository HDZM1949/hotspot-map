@echo off
chcp 65001 >nul
title HotspotMap 一键初始化
echo ============================================
echo    HotspotMap 一键初始化（首次配置）
echo ============================================
echo.
echo 本操作需要管理员权限，请确认本窗口标题栏
echo 没有显示"管理员"，否则请关闭后右键本文件
echo 选择"以管理员身份运行"。
echo.
pause
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0init-tasks.ps1"
