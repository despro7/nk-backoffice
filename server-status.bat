@echo off
powershell -NoProfile -Command "$processes = Get-Process node -ErrorAction SilentlyContinue | Where-Object {$_.CommandLine -like '*server/index.js*'}; if ($processes) { $processes | Select-Object Id, ProcessName, StartTime | Format-Table } else { Write-Host 'No server processes found' }"
