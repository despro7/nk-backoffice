# Склад: фільтри вкладки «Історія» (Dilovod-документи)

Єдиний UX для історії операцій, що синхронізуються з Dilovod:

| Розділ | Шлях |
|--------|------|
| Комплектація / розукомплектування | `/warehouse/releases` |
| Повернення | `/warehouse/returns` |
| Списання | `/warehouse/writeoff` |
| Оприбуткування | `/warehouse/surplus` |
| Переміщення v2 | `/warehouse/movement-v2` |

## UI

- **Перший рядок (біля табів):** `WarehouseDocHistoryToolbarFilters` — пошук (№, SKU, партія…), поле дати (`operDate` / `createdAt`), `ReportDateRangeFilter`.
- **Другий рядок (над списком):** сортування (`operDate`, `createdAt`, `docNumber`), «Оновити», «Скинути фільтри» (якщо є активні фільтри).

Комплектація додатково: мультиселект типів операцій (`ReleaseHistoryOperationTypesSelect`) — лише в `ReleaseHistoryToolbarFilters` / `ReleaseHistoryTab`.

## Query (спільний контракт)

Парсинг: `shared/utils/warehouseDocHistoryListQuery.ts` (`parseWarehouseDocHistoryListQuery`).

| Param | Опис |
|-------|------|
| `page`, `limit` | Пагінація (limit ≤ 100) |
| `search` | Підрядок у номері документа, SKU, коментарі, JSON `items` |
| `dateFrom`, `dateTo` | `YYYY-MM-DD`, межі дня Europe/Kyiv |
| `dateField` | `operDate` (дата операції в БД) або `createdAt` |
| `sortBy` | `operDate` \| `createdAt` \| `docNumber` |
| `sortOrder` | `asc` \| `desc` (default `desc`) |

Legacy для переміщень: `from` / `to` еквівалентні `dateFrom` / `dateTo`.

Клієнт: `fetchWarehouseDocHistoryPage`, стан фільтрів `WarehouseDocHistoryFilters` / `DEFAULT_WAREHOUSE_DOC_HISTORY_FILTERS`.

## Backend

| Домен | Модуль / маршрут |
|-------|------------------|
| Списання / оприбуткування | `warehouseGoodDocumentHistoryList.ts` |
| Повернення | `returnsHistoryList.ts`, `GET /api/warehouse/returns/history` |
| Переміщення v2 | `movementV2HistoryList.ts`, `GET /api/warehouse/movements/history` |
| Комплектація | `releaseHistoryListQuery.ts` + `WarehouseReleaseHistoryListService` (окремі `operationTypes`) |

Sync шапок Dilovod (write-off, surplus, movement) використовує той самий `listQuery`, щоб оновлювати лише поточну сторінку.

## Файли (клієнт)

- `client/pages/Warehouse/shared/WarehouseDocHistoryToolbarFilters.tsx`
- `client/pages/Warehouse/shared/fetchWarehouseDocHistoryPage.ts`
- `client/pages/Warehouse/shared/WarehouseGoodDocumentHistoryTab.tsx`
- Хуки: `useWarehouseWriteOff`, `useWarehouseSurplus`, `useWarehouseMovementV2`; повернення — `WarehouseReturns/index.tsx` + `ReturnsHistoryService`
