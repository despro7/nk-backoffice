# Переміщення між складами v2 (`/warehouse/movement-v2`)

Сторінка для формування `documents.goodMoving` з підбором партій, залишками на дату переміщення та швидкою історією в БД.

**Права:** `page.warehouse.movementV2` (`shared/constants/permissions.ts`).  
**Маршрут:** `client/routes.config.tsx` — заголовок H1 з Layout (`title: «Переміщення між складами»`).

## Вкладки

| Вкладка | Опис |
|--------|------|
| Переміщення | Напрям (склади + дата/час), реєстр позицій, summary, відправка в Dilovod |
| Історія | Пагінований список + фільтр дат — [швидкий список](./warehouse-movement-history-fast-list.md) |
| Архів | Видалені записи (admin) |

## Форма переміщення

- **Напрям:** `MovementDirectionDetails` — вибір складів, swap, `DateTimePicker`; у dropdown — `StockBadge` (ГП/МС).
- **Реєстр:** `MovementRegisterPanel` + `WarehouseProductBatchesPanel` (винесено з release sets) — партії, GP/MS залишки під назвою, confirm на видалення позиції.
- **Пошук товарів:** `WarehouseProductSearch` + `useWarehouseProductSearch` — індекс `GET /api/catalog/warehouse-search-index`, партії `GET /api/warehouse/search-by-batch`, залишки `GET /api/warehouse/stock-snapshot`.
- **Summary:** `MovementSummaryPanel` — `MovementMobDirectionBadges` (короткі бейджі складів) + таблиця позицій.
- **Відправка:** `useMovementV2SendFlow` → `WarehousePayloadBuilder` / goodMoving (аналог v1).

### Пошук товарів (спільний компонент)

| Поведінка | Деталі |
|-----------|--------|
| Архів | Товар у папці «Архів – …» або `delMark`/`isOutdated` — `isWarehouseProductArchived()` (`shared/types/warehouseProductSearch.ts`). Без перемикача «Показувати архівні» — приховані; з перемикачем — жовта іконка archive біля назви. |
| Залишки | Один запит snapshot для **усіх** SKU поточної сторінки результатів (до `limit`, за замовч. 25), не обрізання 15. |
| UI мета | Папка з іконкою folder; GP/MS badges; `updatedAt` (картка) vs `asOfDate` (залишки); напівпрозорість при нульовому/від’ємному залишку. |
| Клавіатура | Listbox скролиться лише при ArrowUp/Down, не при hover. |
| endContent | Оновити + очистити (окремі tooltip). |

Перемикач архіву: `MovementRegisterPanel` → `filters.includeArchived`.

## Історія (UI)

Спільний `HistoryAccordionItem` з `recordType="movement"`:

- Заголовок рядка — **номер документу** (`internalDocNumber` / `docNumber`), не слово «Переміщення».
- Без круглої іконки `arrow-left-right`.
- Напрям — `MovementMobDirectionBadges` (ГП → МС), не повні назви складів у chip.
- Кількість одиниць — `sumHistoryItemsQuantity` / `resolveHistoryItemQuantity` (`totalPortions` пріоритетніше за `portionQuantity`) — `historyNormalize.ts` (client + server).

Редагування документа Dilovod: drawer `WarehouseDocumentEditDrawer` (`features/warehouse-document-edit`).

## Drawer / HMR

Кontext split для стабільності Vite HMR (pattern `.shared.ts` + dev noop):

- `ProductMovementsDrawerContext`
- `WarehouseDocumentEditDrawerContext`

Resizable drawer: `ResizableAppDrawer`, `useResizableDrawerWidth`, `drawerStacking.ts`.

## Ключові файли

| Область | Шлях |
|---------|------|
| Сторінка | `client/pages/Warehouse/WarehouseMovementV2/` |
| Пошук | `client/components/warehouse/` |
| Історія API | `server/modules/Warehouse/movementV2HistoryList.ts`, `MovementV2HistorySync.ts` |
| Індекс каталогу | `ProductsCatalogService.listWarehouseSearchIndex()` |
| v1 refactor | `MovementEditorView`, `useMovementSendFlow` — v1 сторінка тонша |

## Пов’язана документація

- [Швидка історія v2](./warehouse-movement-history-fast-list.md)
- [Кеш історії v1](./warehouse-movement-history-cache.md)
- [Movement mob (мобільний потік)](./warehouse-movement-mob.md)
