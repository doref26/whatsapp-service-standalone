# Starts all services required for the WhatsApp gateway stack:
#   1. Webhook backend (port 3000) - receives messages, sends replies
#   2. WhatsApp service (API_PORT from .env, default 3003) - connects to WhatsApp
#
# Usage:
#   .\scripts\start-all.ps1
#   npm run start:all

$ErrorActionPreference = "Continue"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $ProjectRoot ".env"

function Read-EnvValue {
    param([string]$Name, [string]$Default)
    if (-not (Test-Path $EnvFile)) { return $Default }
    foreach ($line in Get-Content $EnvFile) {
        if ($line -match "^\s*$Name=(.+)$") {
            return $matches[1].Trim()
        }
    }
    return $Default
}

function Get-ListenerPid {
    param([int]$Port)
    $netMatches = netstat -ano | Select-String "127\.0\.0\.1:$Port\s+.*LISTENING"
    if (-not $netMatches) {
        $netMatches = netstat -ano | Select-String "0\.0\.0\.0:$Port\s+.*LISTENING"
    }
    if ($netMatches) {
        return [int](($netMatches[0] -split '\s+')[-1])
    }
    return $null
}

function Stop-PortListener {
    param([int]$Port, [string]$Label)
    $processId = Get-ListenerPid -Port $Port
    if (-not $processId) { return }
    Write-Host "Stopping $Label on port $Port (PID $processId)..."
    try {
        Stop-Process -Id $processId -Force -ErrorAction Stop
        Start-Sleep -Seconds 1
    } catch {
        Write-Warning "Could not stop PID $processId on port $Port - close it manually in Task Manager."
    }
}

function Test-PortReady {
    param([int]$Port, [string]$Path = "/health")
    try {
        $null = Invoke-WebRequest -Uri "http://127.0.0.1:$Port$Path" -TimeoutSec 2 -UseBasicParsing
        return $true
    } catch {
        return $false
    }
}

$BackendPort = [int](Read-EnvValue "BACKEND_PORT" "3000")
$ApiPort = [int](Read-EnvValue "API_PORT" "3003")
$WebhookUrl = Read-EnvValue "WEBHOOK_URL" "http://127.0.0.1:$BackendPort/whatsapp/webhook"

Write-Host ""
Write-Host "========================================"
Write-Host "  WhatsApp Service - Start All"
Write-Host "========================================"
Write-Host "Project:  $ProjectRoot"
Write-Host "Backend:  http://127.0.0.1:$BackendPort/whatsapp/webhook"
Write-Host "WhatsApp: http://127.0.0.1:$ApiPort"
Write-Host ""

$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')

Set-Location $ProjectRoot

if (-not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
    Write-Host "Installing npm dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

Stop-PortListener -Port $BackendPort -Label "webhook backend"
Stop-PortListener -Port $ApiPort -Label "WhatsApp service"

$backendScript = Join-Path $ProjectRoot "integrations\example-backend.js"
$backendLaunch = "cd '$ProjectRoot'; `$env:PORT='$BackendPort'; `$env:WHATSAPP_API_URL='http://127.0.0.1:$ApiPort'; Write-Host '=== Webhook Backend (port $BackendPort) ===' -ForegroundColor Cyan; node '$backendScript'"

Write-Host "Starting webhook backend on port $BackendPort..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendLaunch

$deadline = (Get-Date).AddSeconds(15)
while ((Get-Date) -lt $deadline) {
    if (Test-PortReady -Port $BackendPort) { break }
    Start-Sleep -Milliseconds 500
}

if (-not (Test-PortReady -Port $BackendPort)) {
    Write-Warning "Backend did not respond on port $BackendPort yet - WhatsApp service will retry failed webhooks."
} else {
    Write-Host "Backend is ready on port $BackendPort."
}

$whatsappLaunch = "cd '$ProjectRoot'; Write-Host '=== WhatsApp Service (port $ApiPort) ===' -ForegroundColor Green; npm start"

Write-Host "Starting WhatsApp service on port $ApiPort..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", $whatsappLaunch

Write-Host ""
Write-Host "Both services launched in separate windows."
Write-Host "  QR code:  http://127.0.0.1:$ApiPort/api/qr"
Write-Host "  Status:   http://127.0.0.1:$ApiPort/api/status"
Write-Host "  Webhook:  $WebhookUrl"
Write-Host ""
