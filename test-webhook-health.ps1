# Проверка работоспособности webhook endpoint

$baseUrl = "http://localhost:3001"

Write-Host "🏥 Testing webhook health..." -ForegroundColor Cyan

# Проверка основного health endpoint
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/health" -Method GET
    Write-Host "✅ Server health: OK ($($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Server health: FAILED - $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Проверка webhook health endpoint
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/webhooks/salesdrive/health" -Method GET
    Write-Host "✅ Webhook health: OK ($($response.StatusCode))" -ForegroundColor Green
    $response.Content | ConvertFrom-Json | Format-List
} catch {
    Write-Host "❌ Webhook health: FAILED - $($_.Exception.Message)" -ForegroundColor Red
}

# Проверка test endpoint
try {
    $testPayload = @{ test = "data"; timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss" }
    $jsonPayload = $testPayload | ConvertTo-Json
    $response = Invoke-WebRequest `
        -Uri "$baseUrl/api/webhooks/salesdrive/test" `
        -Method POST `
        -Body $jsonPayload `
        -ContentType "application/json"

    Write-Host "✅ Webhook test endpoint: OK ($($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Webhook test endpoint: FAILED - $($_.Exception.Message)" -ForegroundColor Red
}
