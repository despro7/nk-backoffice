# Команды для тестирования API в Windows PowerShell

## 1. Запуск сервера
```bash
npm run dev:server
```

## 2. Тестирование API endpoints

### Вариант 1: Использование Invoke-WebRequest (рекомендуется)
```powershell
# Получение настроек синхронизации
Invoke-WebRequest -Uri "http://localhost:8080/api/orders/sync/settings" -Method GET

# Получение статистики кеша
Invoke-WebRequest -Uri "http://localhost:8080/api/orders/cache/stats" -Method GET

# Получение логов синхронизации
Invoke-WebRequest -Uri "http://localhost:8080/api/orders/sync/logs" -Method GET
```

### Вариант 2: Использование curl.exe
```powershell
# Получение настроек синхронизации
curl.exe -X GET http://localhost:8080/api/orders/sync/settings

# Получение статистики кеша
curl.exe -X GET http://localhost:8080/api/orders/cache/stats

# Получение логов синхронизации
curl.exe -X GET http://localhost:8080/api/orders/sync/logs
```

### Вариант 3: Использование браузера
Откройте в браузере:
- http://localhost:8080/api/orders/sync/settings
- http://localhost:8080/api/orders/cache/stats
- http://localhost:8080/api/orders/sync/logs

## 3. Запуск тестов

```bash
# Тест сервиса настроек синхронизации
npx tsx test-sync-service.js

# Тест интеграции SalesDrive
npx tsx test-salesdrive-settings-integration.js
```

## 4. Ошибки и их исправления

### Ошибка: "ERR_MODULE_NOT_FOUND"
**Причина:** Node.js не может найти модули TypeScript
**Решение:** Используйте `npx tsx` вместо `node` для запуска тестов

### Ошибка: "Invoke-WebRequest : Не удается найти параметр"
**Причина:** Неправильный синтаксис curl в PowerShell
**Решение:** Используйте `Invoke-WebRequest` или `curl.exe`

### Ошибка: "Cannot read properties of undefined"
**Причина:** Неправильная структура данных в тестах
**Решение:** Проверьте структуру данных в тестовых файлах
