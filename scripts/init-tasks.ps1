# HotspotMap 一键初始化（需管理员运行，可选）
# 可选功能：创建专用运行账户、授权目录、授予批处理登录权限、创建 4 个计划任务。
# 说明：即使不做本步骤，双击 一键启动.cmd 也能直接运行（直接以进程方式启动服务）。
#       计划任务模式的优势：服务更稳定、开机后无需手动启动。
# 用法：右键以管理员身份运行本文件；可通过参数指定运行账户密码：
#   powershell -File init-tasks.ps1 -Password "你的密码"
param([string]$Password = "")

$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "请右键本文件选择『以管理员身份运行』" -ForegroundColor Red
  Read-Host "按回车退出"
  exit 1
}

$root = Split-Path -Parent $PSScriptRoot
$user = "hotspotpg"

# 未指定密码时生成随机强密码（仅用于计划任务配置，一般无需记下）
if ($Password -eq "") {
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $bytes = New-Object byte[] 12
  $rng.GetBytes($bytes)
  $Password = "HP" + ([Convert]::ToBase64String($bytes).TrimEnd('=') -replace '[+/]', 'x') + "!a1"
  $rng.Dispose()
  Write-Host "已生成运行账户随机密码（用于计划任务，无需保存）" -ForegroundColor DarkGray
}
$pw = ConvertTo-SecureString $Password -AsPlainText -Force

Write-Host "==== HotspotMap 初始化 ====" -ForegroundColor Cyan
Write-Host "项目目录: $root"
Write-Host ""

# 1. 创建专用账户（若不存在）
if (-not (Get-LocalUser -Name $user -ErrorAction SilentlyContinue)) {
  New-LocalUser -Name $user -Password $pw -PasswordNeverExpires -AccountNeverExpires | Out-Null
  Write-Host "[1/5] 已创建运行账户 $user" -ForegroundColor Green
} else {
  Write-Host "[1/5] 运行账户 $user 已存在" -ForegroundColor Green
}

# 2. 授予"作为批处理作业登录"权限（SeBatchLogonRight）
$sid = (New-Object System.Security.Principal.NTAccount($user)).Translate([System.Security.Principal.SecurityIdentifier]).Value
$tmpCfg = Join-Path $env:TEMP "secpol-export.cfg"
$newCfg = Join-Path $env:TEMP "secpol-new.cfg"
secedit /export /cfg $tmpCfg | Out-Null
$cfg = Get-Content $tmpCfg
$updated = $cfg | ForEach-Object {
  if ($_ -match "^SeBatchLogonRight") { "$_*$sid" } else { $_ }
}
$updated | Set-Content $newCfg -Encoding Unicode
secedit /configure /db (Join-Path $env:TEMP "secedit.sdb") /cfg $newCfg /areas USER_RIGHTS /quiet | Out-Null
Write-Host "[2/5] 已授予批处理登录权限" -ForegroundColor Green

# 3. 目录权限（运行账户读写项目）
icacls $root /grant "${user}:(OI)(CI)RX" /T /Q | Out-Null
icacls (Join-Path $root "logs") /grant "${user}:(OI)(CI)M" /T /Q | Out-Null
icacls (Join-Path $root "apps\web") /grant "${user}:(OI)(CI)M" /T /Q | Out-Null
icacls (Join-Path $root ".pgdata") /grant "${user}:(OI)(CI)M" /T /Q | Out-Null
Write-Host "[3/5] 目录权限已配置" -ForegroundColor Green

# 4. 创建计划任务（数据库 / API / 前端 / 采集调度）
$tasks = @(
  @{ Name = "hotspot-db"; Bat = "scripts\start-db.bat" },
  @{ Name = "hotspot-api"; Bat = "scripts\start-api.bat" },
  @{ Name = "hotspot-web"; Bat = "scripts\start-web.bat" },
  @{ Name = "hotspot-ingest"; Bat = "scripts\start-ingest.bat" }
)
foreach ($t in $tasks) {
  $bat = Join-Path $root $t.Bat
  schtasks /create /tn $t.Name /tr "`"$bat`"" /sc ONCE /st 00:00 /ru $user /rp $Password /f | Out-Null
}
Write-Host "[4/5] 计划任务已创建（hotspot-db / api / web / ingest）" -ForegroundColor Green

# 5. 安装依赖（如尚未安装）
if (-not (Test-Path (Join-Path $root "node_modules"))) {
  Write-Host "[5/5] 安装项目依赖（首次约 1-2 分钟）..."
  Push-Location $root
  try {
    & pnpm install --config.confirmModulesPurge=false
  } catch {
    Write-Host "pnpm 不可用，请先安装：npm install -g pnpm" -ForegroundColor Yellow
  }
  Pop-Location
} else {
  Write-Host "[5/5] 依赖已存在" -ForegroundColor Green
}

Write-Host ""
Write-Host "==== 初始化完成 ====" -ForegroundColor Cyan
Write-Host "现在可以双击项目根目录的『一键启动.cmd』打开网页。"
Read-Host "按回车退出"
