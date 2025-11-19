# META_LOGS API Logging

## Структура таблиці `meta_logs`
- `id` (Int, PK)
- `datetime` (DateTime)
- `category` (String, e.g. "dilovod")
 - `title` (String, optional) — короткий заголовок логу для швидкого читання
- `status` (String, "success"/"error")
- `message` (String)
 - `message` (String)
- `data` (JSON) — весь raw data (payload, warnings, response, orderId, orderNumber, etc)
 - `orderNumber` (String, optional) — нове колонка для швидкого фільтрування/підрахунку логів по номеру замовлення
 - `data` (JSON) — весь raw data (payload, warnings, response, orderId, orderNumber, etc)

## Використання
- Всі raw-дані (payload, warnings, response, orderId, orderNumber) кладемо в поле `data` (тип JSON).
- Поле `metadata` видалено — для всіх додаткових даних використовуйте `data`.
- Запис логу через `DilovodService.logMetaDilovodExport({ status, message, data })`.

## Переваги типу JSON
- Зручно зберігати будь-яку структуру (object, array, string)
- Можна фільтрувати, шукати, діставати частину даних через SQL/Prisma
- Не потрібно парсити/серіалізувати вручну

## Приклад запису
```js
await dilovodService.logMetaDilovodExport({
  status: 'success',
  message: 'Dilovod export completed',
  data: {
    payload: {...},
    warnings: [...],
    orderId: '123',
    orderNumber: 'SD-456',
    response: {...}
  }
});

### Примітки
- Після додавання `orderNumber` в схему ви зможете використовувати `GET /api/meta-logs?orderNumber=...` та `GET /api/meta-logs/count?orderNumber=...` для прямого DB-фільтрування — це значно швидше, ніж JS-фільтрація JSON.
```
