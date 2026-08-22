# HotspotMap 服务启动器（通用版，被 一键启动.cmd / start-all.mjs 调用）
# 优先使用本机计划任务（若已配置）；否则直接以隐藏进程方式启动服务。
# 以普通用户权限运行（PostgreSQL 无法以管理员权限启动）。

$Root = Split-Path -Parent $PSScriptRoot
$Logs = Join-Path $Root "logs"
if (-not (Test-Path $Logs)) { New-Item -ItemType Directory -Path $Logs -Force | Out-Null }

function Start-ViaTask([string]$Name, [string]$Label) {
  schtasks /query /tn $Name 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    schtasks /run /tn $Name 2>$null | Out-Null
    Write-Host "[启动] $Label：计划任务 $Name"
    return $true
  }
  return $false
}

# 数据库（嵌入式 PostgreSQL，不能以管理员运行）
if (-not (Start-ViaTask "hotspot-db" "数据库")) {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if ($isAdmin) {
    Write-Host "[错误] 当前为管理员权限，PostgreSQL 无法启动。" -ForegroundColor Red
    Write-Host "        请关闭窗口后，以普通方式（双击，不要选“以管理员身份运行”）重新打开一键启动。" -ForegroundColor Yellow
    exit 1
  }
  $p = Start-Process node -ArgumentList @("`"$(Join-Path $Root 'scripts\db.mjs')`"") -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Logs 'db-out.log') -RedirectStandardError (Join-Path $Logs 'db-err.log') -PassThru
  Write-Host "[启动] 数据库：直接进程 PID $($p.Id)"
}

# 后端 API
if (-not (Start-ViaTask "hotspot-api" "后端")) {
  $env:DATABASE_URL = "postgres://hotspot:hotspot@localhost:5432/hotspot_map"
  $p = Start-Process node -ArgumentList @("`"$(Join-Path $Root 'apps\api\dist\main.js')`"") -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Logs 'api-out.log') -RedirectStandardError (Join-Path $Logs 'api-err.log') -PassThru
  Write-Host "[启动] 后端：直接进程 PID $($p.Id)"
}

# 前端（Vite 开发服务器）
if (-not (Start-ViaTask "hotspot-web" "前端")) {
  $p = Start-Process node -ArgumentList @("`"$(Join-Path $Root 'apps\web\node_modules\vite\bin\vite.js')`"", "`"$(Join-Path $Root 'apps\web')`"") -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Logs 'web-out.log') -RedirectStandardError (Join-Path $Logs 'web-err.log') -PassThru
  Write-Host "[启动] 前端：直接进程 PID $($p.Id)"
}

# 采集调度器（GDELT / USGS / EONET）
if (-not (Start-ViaTask "hotspot-ingest" "采集")) {
  $env:DATABASE_URL = "postgres://hotspot:hotspot@localhost:5432/hotspot_map"
  $p = Start-Process node -ArgumentList @("`"$(Join-Path $Root 'packages\ingesters\node_modules\tsx\dist\cli.mjs')`"", "`"$(Join-Path $Root 'packages\ingesters\src\scheduler.ts')`"") -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Logs 'ingest-out.log') -RedirectStandardError (Join-Path $Logs 'ingest-err.log') -PassThru
  Write-Host "[启动] 采集：直接进程 PID $($p.Id)"
}
