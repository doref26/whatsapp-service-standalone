# Update webhook URL via API
$body = @{
    url = "http://localhost:3000/whatsapp/webhook"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3002/api/webhook" -Method POST -Body $body -ContentType "application/json"

Write-Host "✅ Webhook URL updated to: http://localhost:3000/whatsapp/webhook"
