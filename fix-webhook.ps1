# Fix WhatsApp Webhook 404 Error
# This script verifies and fixes the webhook URL configuration

Write-Host "🔧 Fixing WhatsApp Webhook Configuration..." -ForegroundColor Cyan
Write-Host ""

$envFile = Join-Path $PSScriptRoot ".env"
$backendPort = "3000"
$webhookUrl = "http://localhost:$backendPort/whatsapp/webhook"

# Check if .env file exists
if (-not (Test-Path $envFile)) {
    Write-Host "⚠️  .env file not found. Creating it..." -ForegroundColor Yellow
    New-Item -Path $envFile -ItemType File -Force | Out-Null
}

# Read current .env content
$envContent = Get-Content $envFile -ErrorAction SilentlyContinue

# Check if WEBHOOK_URL exists
$webhookLine = $envContent | Where-Object { $_ -match "^WEBHOOK_URL=" }

if ($webhookLine) {
    Write-Host "📝 Current WEBHOOK_URL: $webhookLine" -ForegroundColor Yellow
    
    # Extract current URL
    $currentUrl = ($webhookLine -split "=")[1].Trim()
    
    if ($currentUrl -ne $webhookUrl) {
        Write-Host "🔄 Updating WEBHOOK_URL to: $webhookUrl" -ForegroundColor Green
        $envContent = $envContent | ForEach-Object {
            if ($_ -match "^WEBHOOK_URL=") {
                "WEBHOOK_URL=$webhookUrl"
            } else {
                $_
            }
        }
        Set-Content -Path $envFile -Value $envContent
        Write-Host "✅ WEBHOOK_URL updated!" -ForegroundColor Green
    } else {
        Write-Host "✅ WEBHOOK_URL is already correct!" -ForegroundColor Green
    }
} else {
    Write-Host "➕ Adding WEBHOOK_URL to .env file..." -ForegroundColor Green
    Add-Content -Path $envFile -Value "WEBHOOK_URL=$webhookUrl"
    Write-Host "✅ WEBHOOK_URL added!" -ForegroundColor Green
}

# Verify backend is running
Write-Host ""
Write-Host "🔍 Checking if backend is running..." -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "http://localhost:$backendPort" -Method GET -TimeoutSec 2 -ErrorAction Stop
    Write-Host "✅ Backend is running on port $backendPort" -ForegroundColor Green
} catch {
    Write-Host "❌ Backend is NOT running on port $backendPort" -ForegroundColor Red
    Write-Host "   💡 Start the backend with: cd backend && npm run start:dev" -ForegroundColor Yellow
}

# Test webhook endpoint
Write-Host ""
Write-Host "🔍 Testing webhook endpoint..." -ForegroundColor Cyan
try {
    $testBody = @{ test = "message" } | ConvertTo-Json
    $response = Invoke-WebRequest -Uri $webhookUrl -Method POST -Body $testBody -ContentType "application/json" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "✅ Webhook endpoint is accessible!" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host "❌ Webhook endpoint returned 404" -ForegroundColor Red
        Write-Host "   💡 Make sure:" -ForegroundColor Yellow
        Write-Host "      1. Backend is running (cd backend && npm run start:dev)" -ForegroundColor Yellow
        Write-Host "      2. WhatsAppModule is imported in AppModule" -ForegroundColor Yellow
        Write-Host "      3. Route is: POST /whatsapp/webhook" -ForegroundColor Yellow
    } else {
        Write-Host "❌ Could not reach webhook endpoint: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "   💡 Make sure the backend is running" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "✅ Configuration check complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Make sure backend is running: cd backend && npm run start:dev" -ForegroundColor White
Write-Host "   2. Restart WhatsApp service: cd whatsapp-service-standalone && node index.js" -ForegroundColor White
Write-Host ""
