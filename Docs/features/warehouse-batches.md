# Партії готової продукції

**Маршрут:** `/warehouse/batches`  
**API:** `GET /api/warehouse/batches`

---

## Огляд

Список партій папки «Готова продукція»: реальні (`catalogs.goodParts`) і віртуальні (document-id з балансу Dilovod, не `11122…`). Клік по номеру партії відкриває глобальний drawer **Рухи по товару** (`ProductMovementsDrawer`, `autoGenerate`).

---

## Фільтри

| Фільтр | Дефолт | Поведінка |
|--------|--------|-----------|
| Типи партій (multi) | Товари + Комплекти | `product` / `kit` / `virtualProduct` / `virtualKit` |
| Мінуси (select) | Всі | `without` \| `only` \| `all` |
| Лише з залишками | увімкнено | разом із «Мінуси»: `all` → `qty ≠ 0`; `without` → `qty > 0`; `only` → `qty < 0` |

Клієнт робить **один** широкий запит (усі типи, `negativeMode=all`, без відсікання нулів) і фільтрує локально — зміна Switch/Select не б’є Dilovod повторно.

---

## Backend

| Файл | Роль |
|------|------|
| `WarehouseBatchesService.ts` | Зріз goodParts + balance; класифікація `isKit` / `isVirtual`; кеш 5 хв + **singleflight** |
| `WarehouseController.ts` | Query: `onlyWithStock`, `negativeMode`, `batchKinds`, `limit`, `force` |
| `shared/types/warehouse.ts` | `WarehouseBatchKind`, `WarehouseBatchNegativeMode`, поля рядка |

**Не** додавати `goodPart__pr` у `fields` balance-запиту — Dilovod відхиляє/порожніє відповідь; `__pr` інколи приходить у відповіді сам.

Віртуальні рядки: `batchId` не з `catalogs.goodParts`, дата/ШК можуть бути порожні, бейдж «Віртуальна».
