# Проверяем, слушает ли порт 3001 какой-то процесс
$connections = netstat -ano | Select-String ":3001" | Select-String "LISTENING"

if ($connections) {
    Write-Host "Server is running and listening on port 3001"
    # Пытаемся получить информацию о процессах node
    $nodeProcesses = Get-Process node -ErrorAction SilentlyContinue
    if ($nodeProcesses) {
        Write-Host "Node processes found: $($nodeProcesses.Count)"
        foreach ($proc in $nodeProcesses) {
            Write-Host "  PID: $($proc.Id), Start Time: $($proc.StartTime)"
        }
    }
} else {
    Write-Host "No server found listening on port 3001"
}
