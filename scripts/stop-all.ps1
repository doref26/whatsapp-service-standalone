# Stops webhook backend and WhatsApp service by port.

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

function Stop-PortListener {
    param([int]$Port, [string]$Label)
    $matches = netstat -ano | Select-String "127\.0\.0\.1:$Port\s+.*LISTENING"
    if (-not $matches) {
        $matches = netstat -ano | Select-String "0\.0\.0\.0:$Port\s+.*LISTENING"
    }
    if (-not $matches) {
        Write-Host "$Label (port $Port): not running"
        return
    }
    $processId = [int](($matches[0] -split '\s+')[-1])
    Write-Host "Stopping $Label on port $Port (PID $processId)..."
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

$BackendPort = [int](Read-EnvValue "BACKEND_PORT" "3000")
$ApiPort = [int](Read-EnvValue "API_PORT" "3003")

Stop-PortListener -Port $BackendPort -Label "Webhook backend"
Stop-PortListener -Port $ApiPort -Label "WhatsApp service"
Write-Host "Done."
