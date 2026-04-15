# Відправка переміщень між складами до Діловода

## Огляд

Реалізовано повний цикл формування та відправки документа переміщення між складами до Діловода: налаштування параметрів, серверна побудова payload, dry-run перегляд (адмін), фактична відправка.

## Архітектура

```
UI (index.tsx)
  ├── handleSendToDilovod()   → POST /api/warehouse/movements/send  { dryRun: false }
  └── handleShowPayload()     → POST /api/warehouse/movements/send  { dryRun: true }
                                       ↓
                          WarehouseController
                                       ↓
                          WarehousePayloadBuilder
                            ├── loadSettings()        ← settings_base (category='warehouse_movement')
                            ├── getAuthorDilovodId()  ← users.dilovodUserId
                            ├── generateDocumentNumber()
                            ├── validateDilovodIds()
                            └── buildPayload()
                                       ↓
                          DilovodService.exportOrderToDilovod()  (якщо dryRun=false)
```

## Ендпоінт

**`POST /api/warehouse/movements/send`**

```json
// Запит
{
  "draftId": 10,
  "summaryItems": [...],
  "movementDate": "2026-04-11T10:00:00.000Z",
  "dryRun": true
}

// Відповідь dry-run
{ "success": true, "dryRun": true, "payload": { "header": {...}, "tableParts": { "tpGoods": [...] } } }

// Відповідь реальна
{ "success": true, "dryRun": false, "dilovodDocId": "...", "docNumber": "..." }
```

## Налаштування (settings_base, category='warehouse_movement')

| Ключ | Опис | Дефолт |
|---|---|---|
| `wm_numberGeneration` | `dilovod` або `server` | `dilovod` |
| `wm_numberTemplate` | Шаблон номера (якщо server) | `WM-{YYYY}{MM}{DD}-{###}` |
| `wm_firmId` | ID підприємства | fallback → `dilovod_default_firm_id` |
| `wm_storageFrom` | Склад-донор | fallback → `dilovod_main_storage_id` |
| `wm_storageTo` | Склад-реципієнт | fallback → `dilovod_small_storage_id` |
| `wm_docMode` | Режим документа | `1004000000000409` |
| `wm_unitId` | Одиниця виміру | `1103600000000001` |
| `wm_accountId` | Рахунок обліку | `1119000000001076` |

Керуються через UI: `/settings/warehouse-movement` (тільки ADMIN).

## Схема БД

```prisma
model WarehouseMovement {
  // Видалено: createdAt, updatedAt
  // Додано:
  docNumber     String?   // Номер документа після відправки
  dilovodDocId  String?   // ID документа в Діловоді
}

model User {
  dilovodUserId String?   // ID користувача в Діловоді (для поля author у payload)
}
```

## UI

- **«Завершити переміщення»** — пряма відправка `dryRun=false`
- **«Показати payload»** — видима тільки адміністраторам, викликає `dryRun=true`, відкриває `PayloadPreviewModal` з можливістю відправити звідти
