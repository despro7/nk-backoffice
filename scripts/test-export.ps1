# Тестування експорту замовлення в Dilovod
# Використання: .\test-export.ps1 9430

param(
    [Parameter(Mandatory=$false)]
    [string]$OrderId = "9430"
)

Write-Host "`n🧪 Тестування експорту замовлення $OrderId в Dilovod`n" -ForegroundColor Cyan

# Перевіряємо сесію
if (-not (Test-Path '.vscode\.api-session.xml')) {
    Write-Host "❌ Сесія не знайдена. Виконайте спочатку task 'api:login'`n" -ForegroundColor Red
    exit 1
}

$session = Import-Clixml -Path '.vscode\.api-session.xml'

try {
    Write-Host "📤 Відправлення POST запиту до /api/dilovod/salesdrive/orders/$OrderId/export..." -ForegroundColor Yellow
    
    $response = Invoke-WebRequest `
        -Uri "http://localhost:8080/api/dilovod/salesdrive/orders/$OrderId/export" `
        -Method POST `
        -WebSession $session `
        -ContentType 'application/json' `
        -ErrorAction Stop
    
    Write-Host "`n✅ SUCCESS! Status: $($response.StatusCode)`n" -ForegroundColor Green
    
    # Парсимо і форматуємо JSON
    $jsonResponse = $response.Content | ConvertFrom-Json
    
    Write-Host "📊 Результат:`n" -ForegroundColor Cyan
    $jsonResponse | ConvertTo-Json -Depth 10
    
    Write-Host "`n"
    Write-Host "📋 Метадані:" -ForegroundColor Cyan
    Write-Host "  - Document Type: $($jsonResponse.data.payload.header.id)"
    Write-Host "  - Order Number: $($jsonResponse.data.payload.header.number)"
    Write-Host "  - Total Items: $($jsonResponse.metadata.totalItems)"
    Write-Host "  - Warnings: $($jsonResponse.metadata.warningsCount)"
    
    if ($jsonResponse.data.warnings) {
        Write-Host "`n⚠️  Попередження:" -ForegroundColor Yellow
        $jsonResponse.data.warnings | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    }
    
    Write-Host "`n"
    
} catch {
    Write-Host "`n❌ ERROR: $_`n" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.BaseStream.Position = 0
        $errorBody = $reader.ReadToEnd()
        Write-Host "Response Body:" -ForegroundColor Red
        Write-Host $errorBody
    }
}
