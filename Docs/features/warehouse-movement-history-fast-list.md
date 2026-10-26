# Швидка історія переміщень (v2) — список з БД + lazy Dilovod

Патерн такий самий, як у **оприбуткувань** (`/warehouse/surplus`) і **списань**: UI одразу отримує пагінований список з MySQL, Dilovod викликається лише для синхронізації **шапок** (за розкладом) і для **рядків документа** (on demand).

> Старий ендпоінт `GET /api/warehouse/history` (v1 переміщення) тягне повний список з Dilovod і збагачує `items` для всіх документів — для великої історії це повільно. v2 **не** використовує його для табу «Історія».

## Потік даних

```
Клієнт: GET /api/warehouse/movements/history?sync=true&page&limit&from&to
  → (опційно) sync шапок Dilovod — без getObject / tpGoods
  → listMovementHistory — Prisma warehouse_movement, items не читаються в списку
  → відповідь: шапки + порожні items/itemsNormalized; `createdAt` = `draftCreatedAt`, `movementDate` — для UI дат у акордеоні

Клієнт: lazyEnrichHistoryPage + розгортання акордеону
  → GET /api/warehouse/movements/history/:id/details
  → якщо items у БД — fromCache
  → інакше MovementHistoryService.getMovementDetails(dilovodDocId) → persist items → відповідь
```

## API

| Метод | Шлях | Опис |
|-------|------|------|
| GET | `/api/warehouse/movements/history` | Список (пагінація, фільтр дат, `status=active\|deleted`) |
| GET | `/api/warehouse/movements/history/:id/details` | Рядки документа (`?force=true` — оновити з Dilovod) |

### Query для списку

| Param | Опис |
|-------|------|
| `page`, `limit` | Пагінація (limit ≤ 100) |
| `status` | `active` (finalized, pending_receipt, active) або `deleted` |
| `dateFrom`, `dateTo` | Фільтр за датою (`dateField`: `operDate` → `movementDate` / fallback `draftCreatedAt`; `createdAt` → `draftCreatedAt`), `YYYY-MM-DD` |
| `from`, `to` | Legacy-аліаси для `dateFrom` / `dateTo` |
| `search`, `sortBy`, `sortOrder`, `dateField` | Див. [`warehouse-doc-history-filters.md`](warehouse-doc-history-filters.md) |
| `sync` | `true` — перед списком синхронізувати шапки з Dilovod |
| `forceFullList` | `true` — примусово повний список goodMoving (ігнорує «вже сьогодні») |

## Sync шапок (без рядків)

Модуль: `server/modules/Warehouse/MovementV2HistorySync.ts`.

1. **Повний список** (`documents.goodMoving`) — не частіше **1 раз на календарний день** (Europe/Kyiv), ключ `movement_history_last_full_sync` у `settings_base`. Також запускається, якщо локально 0 активних записів.
2. Глибина повного sync за замовчуванням: `WAREHOUSE_GOOD_DOC_HISTORY_SYNC_DAYS` (див. `shared/types/warehouseGoodDocument.ts`).
3. Якщо повний список сьогодні вже був — при `sync=true` синхронізуються лише **шапки документів поточної сторінки** (`getMovementHistoryPageDilovodIds` → `syncHeadersByDilovodIds`).
4. Нові записи в БД створюються без перезапису існуючих `items` (як у surplus/write-off).

Реалізація Dilovod: `MovementHistoryService.syncHeadersFromDilovod`, `syncHeadersByDilovodIds`, `fetchHeaderDocumentsFromDilovod`.

## Деталі (tpGoods)

- `loadDetails(historyId)` читає `warehouse_movement.items`.
- Якщо JSON непорожній — повертає з кешу.
- Інакше — `getMovementDetails(dilovodDocId)` (getObject + збереження `tpGoods` у `items`).

## Клієнт

- Хук: `client/pages/Warehouse/WarehouseMovementV2/useWarehouseMovementV2.ts` — `fetchHistoryPage`, `loadHistory(sync, forceFullList)`, `loadHistoryRecordDetails`, `lazyEnrichHistoryPage`.
- UI: `MovementV2HistoryTab` + `HistoryAccordionItem` (`onLoadRecord`, `detailsLoading`).
- Рядок історії переміщення: номер документу в заголовку, `MovementMobDirectionBadges` замість довгих назв складів, без іконки типу операції (див. [warehouse-movement-v2.md](./warehouse-movement-v2.md)).
- Перше відкриття табу «Історія»: `loadHistory(1, limit, true)` — sync на сервері розумний (не обовʼязково повний Dilovod).
- «Оновити»: `sync=true`, `forceFullList=true`.
- Зміна фільтрів (пошук, дати, сорт): `loadHistory(1, limit, true, false, historyFilters)`.
- Пагінація без повторного повного sync: `loadHistory(page, limit, false)`.

## Файли

| Шар | Файл |
|-----|------|
| Список | `movementV2HistoryList.ts` |
| Sync + details | `MovementV2HistorySync.ts` |
| Dilovod | `MovementHistoryService.ts` |
| Маршрути | `WarehouseController.ts` (`/movements/history`, `/movements/history/:id/details`) |
| Спільний lazy enrich | `client/pages/Warehouse/shared/lazyEnrichHistoryPage.ts` |

Еталон UX/API: `useWarehouseSurplus.ts`, `SurplusController.ts`, `WarehouseGoodDocumentHistorySync.ts`.

## Кількість одиниць у списку

`resolveHistoryItemQuantity` / `sumHistoryItemsQuantity` (`historyNormalize.ts` на client і server): для рядка документа пріоритет **`totalPortions`**, потім `portionQuantity`, потім `boxQuantity × portionsPerBox`. Інакше в шапці акордеону могло бути «0 одиниць» при непорожніх позиціях.
