# HotspotMap 一键初始化（需管理员运行，可选）
# 功能：配置目录权限、创建 4 个计划任务（数据库 / 后端 / 前端 / 采集调度）、首次安装依赖并构建。
#
# 说明：即使不做本步骤，双击项目根目录的 run.cmd 也能直接以进程方式启动所有服务；
#       计划任务模式的优势：服务更稳定，可随时用 schtasks /run 一键拉起。
#
# 运行身份：使用 Windows 内置的非管理员服务账户 NT AUTHORITY\NetworkService。
#   不新建任何账户、不需要密码、不修改系统安全策略，任何人 clone 后开箱即用。
#   原因：Windows 版 PostgreSQL 拒绝以管理员身份运行，而该内置账户天然是非管理员。
#
# 用法：右键本文件 → 以管理员身份运行；或在「管理员」PowerShell 中：
#   powershell -ExecutionPolicy Bypass -File scripts\init-tasks.ps1

$ErrorActionPreference = "Stop"

# 必须以管理员身份运行（创建计划任务、修改目录权限需要）
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "请右键本文件选择『以管理员身份运行』" -ForegroundColor Red
  Read-Host "按回车退出"
  exit 1
}

$root = Split-Path -Parent $PSScriptRoot
# 内置非管理员服务账户（S-1-5-20），用于运行计划任务中的服务
$runAsName = "NT AUTHORITY\NetworkService"
$runAsSid = "S-1-5-20"

Write-Host "==== HotspotMap 初始化 ====" -ForegroundColor Cyan
Write-Host "项目目录: $root"
Write-Host "运行身份: $runAsName"
Write-Host ""

# 1. 目录权限：确保运行账户可读写项目
#    用 SID 授权（避免账户名含空格），可继承项会自动下传，无需 /T 递归
Write-Host "[1/4] 配置目录权限..." -ForegroundColor Green
icacls $root /grant "*${runAsSid}:(OI)(CI)RX" /Q | Out-Null
foreach ($sub in @("logs", "apps\web", ".pgdata", "tmp")) {
  $p = Join-Path $root $sub
  if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
  icacls $p /grant "*${runAsSid}:(OI)(CI)M" /Q | Out-Null
}

# 2. 安装依赖（首次）
Write-Host "[2/4] 检查依赖..." -ForegroundColor Green
$needBuild = $false
if (-not (Test-Path (Join-Path $root "node_modules"))) {
  Write-Host "     首次运行，正在安装项目依赖（约 1-2 分钟）..."
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "     未检测到 pnpm，正在全局安装..." -ForegroundColor Yellow
    npm install -g pnpm
  }
  Push-Location $root
  try { pnpm install --config.confirmModulesPurge=false } finally { Pop-Location }
  $needBuild = $true
}

# 3. 构建（首次）
Write-Host "[3/4] 检查构建产物..." -ForegroundColor Green
if ($needBuild -or -not (Test-Path (Join-Path $root "apps\api\dist\main.js"))) {
  Write-Host "     正在构建项目..."
  Push-Location $root
  try { pnpm build } finally { Pop-Location }
}

# 4. 创建 4 个计划任务（数据库 / 后端 / 前端 / 采集调度）
Write-Host "[4/4] 创建计划任务..." -ForegroundColor Green
# 采集器：本机若存在 TLS 绕过脚本则优先使用，否则用标准脚本（保证可移植）
$ingestBat = if (Test-Path (Join-Path $root "scripts\start-ingest-local.bat")) { "scripts\start-ingest-local.bat" } else { "scripts\start-ingest.bat" }
$tasks = @(
  @{ Name = "hotspot-db"; Bat = "scripts\start-db.bat" },
  @{ Name = "hotspot-api"; Bat = "scripts\start-api.bat" },
  @{ Name = "hotspot-web"; Bat = "scripts\start-web.bat" },
  @{ Name = "hotspot-ingest"; Bat = $ingestBat }
)
foreach ($t in $tasks) {
  $bat = Join-Path $root $t.Bat
  schtasks /create /tn $t.Name /tr "`"$bat`"" /sc ONCE /st 00:00 /ru $runAsName /f | Out-Null
}
Write-Host "     已创建：hotspot-db / hotspot-api / hotspot-web / hotspot-ingest" -ForegroundColor Green

Write-Host ""
Write-Host "==== 初始化完成 ====" -ForegroundColor Cyan
Write-Host "现在可双击项目根目录的 run.cmd 打开网页。"
Write-Host "也可单独运行某个任务：schtasks /run /tn hotspot-db"
Read-Host "按回车退出"
