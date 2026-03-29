# META_LOGS API

## Структура таблиці `meta_logs`

| Поле | Тип | Обов'язкове | Опис |
|---|---|---|---|
| `id` | `Int` | ✅ | PK, autoincrement |
| `datetime` | `DateTime` | ✅ | Час запису, default: `now()` |
| `category` | `String(32)` | ✅ | Категорія логу, напр. `"dilovod"` |
| `title` | `String(255)` | ❌ | Короткий заголовок для швидкого читання |
| `status` | `String(16)` | ✅ | `"success"` або `"error"` |
| `message` | `String` | ❌ | Текстовий опис події |
| `data` | `Json` | ❌ | Raw-дані: payload, warnings, response, тощо |
| `orderNumber` | `String(128)` | ❌ | Номер замовлення (індексовано для швидкого фільтрування) |
| `readBy` | `Json` | ❌ | `{ [userId]: "ISO", "_all": "ISO" }` — хто і коли прочитав |
| `hiddenBy` | `Json` | ❌ | `{ [userId]: "ISO", "_all": "ISO" }` — хто і коли приховав |
| `initiatedBy` | `String(128)` | ❌ | Ініціатор: `"42"` (userId), `"cron:назва"`, `"webhook:назва"`, `"system:назва"` |

**Індекси:** `orderNumber`, `initiatedBy`

## Використання

Запис логу через `dilovodService.logMetaDilovodExport()`:

```typescript
await dilovodService.logMetaDilovodExport({
  title: 'Export order SD-456',
  status: 'success',
  message: 'Dilovod export completed',
  initiatedBy: '42',           // userId або "cron:dilovod-sync"
  data: {
    payload: { ... },
    warnings: [...],
    orderNumber: 'SD-456',     // автоматично копіюється в колонку orderNumber
    response: { ... }
  }
});
```

> `orderNumber` з `data` автоматично зберігається в окрему колонку — це дозволяє DB-фільтрування замість повільної JS-фільтрації по JSON.

## API ендпоінти

- `GET /api/meta-logs` — список логів (фільтри: `category`, `status`, `orderNumber`, `initiatedBy`, пагінація)
- `GET /api/meta-logs/count` — кількість логів за фільтрами
- `POST /api/meta-logs` — створити запис вручну (для адмін-панелі)
