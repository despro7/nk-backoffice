# Скрипт для остановки сервера
# Проверяем, слушает ли порт 3001 какой-то процесс
$connections = netstat -ano | Select-String ":3001" | Select-String "LISTENING"

if ($connections) {
    Write-Host "Stopping server on port 3001..."

    # Получаем PID процесса, который слушает порт 3001
    $pidLine = $connections | ForEach-Object { $_.ToString().Split()[-1] }
    $serverPid = $pidLine

    if ($serverPid -and $serverPid -match '^\d+$') {
        Write-Host "Found process PID: $serverPid"
        try {
            Stop-Process -Id $serverPid -Force
            Write-Host "Server stopped successfully"
        } catch {
            Write-Host "Failed to stop server process: $($_.Exception.Message)"
        }
    } else {
        Write-Host "Could not determine server process PID"
    }
} else {
    Write-Host "No server found listening on port 3001"
}
