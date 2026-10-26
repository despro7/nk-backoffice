# Переміщення між складами v2 (`/warehouse/movement-v2`)

Сторінка для формування `documents.goodMoving` з підбором партій, залишками на дату переміщення та швидкою історією в БД.

**Права:** `page.warehouse.movementV2` (`shared/constants/permissions.ts`).  
**Маршрут:** `client/routes.config.tsx` — заголовок H1 з Layout (`title: «Переміщення між складами»`).

## Вкладки

| Вкладка | Опис |
|--------|------|
| Переміщення | Напрям (склади + дата/час), реєстр позицій, summary, відправка в Dilovod |
| Історія | Пагінований список + [фільтри історії](./warehouse-doc-history-filters.md) — [швидкий список](./warehouse-movement-history-fast-list.md) |
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
| Dropdown | За замовч. `dropdownPlacement="portal"` (fixed на `body`); у drawer редагування — `inline` |
| UI мета | Папка з іконкою folder; GP/MS badges; `updatedAt` (картка) vs `asOfDate` (залишки); напівпрозорість при нульовому/від’ємному залишку. |
| Клавіатура | Listbox скролиться лише при ArrowUp/Down, не при hover. |
| endContent | Оновити + очистити (окремі tooltip). |

Перемикач архіву: `MovementRegisterPanel` → `filters.includeArchived`.

При додаванні з пошуку `dilovodId` рядка береться з `catalogGoodId` індексу (архівні SKU не проходять через `GET /api/products` без `showOutdated`). Перед відправкою сервер дозаповнює відсутній `dilovodId` з каталогу (`WarehousePayloadBuilder.enrichSummaryItemsDilovodIds`).

**Набори (комплекти):** для рядка визначається `isSet` з каталогу (`shared/utils/productIsSet.ts`, `movementV2Catalog.ts`); у payload `accGood` = рахунок комплектів, не ГП (`WarehousePayloadBuilder.buildPayload`).

### Партії в реєстрі v2

Реєстр використовує `WarehouseProductBatchesPanel` з режимом **`movementBatchPicker`** (не `goodUnKit`):

| Поведінка | Деталі |
|-----------|--------|
| API | `includeNegativeQty=true` на `GET /api/warehouse/batch-numbers` — balance з qty≠0, **без** каталожних нульових партій (на відміну від `includeNonPositiveQty` для розукомплектування) |
| UI picker | Показуються лише партії з qty≠0; **мінусові** видно, але не обираються (бейдж «Мінус — не для переміщення») |
| Bulk | `skipExpiration=true` як і в release sets |

## Історія (UI)

Спільний `HistoryAccordionItem` з `recordType="movement"`:

- Заголовок рядка — **номер документу** (`internalDocNumber` / `docNumber`), не слово «Переміщення».
- Без круглої іконки `arrow-left-right`.
- Напрям — `MovementMobDirectionBadges` (ГП → МС), не повні назви складів у chip.
- Кількість одиниць — `sumHistoryItemsQuantity` / `resolveHistoryItemQuantity` (`totalPortions` пріоритетніше за `portionQuantity`) — `historyNormalize.ts` (client + server).
- **Дати:** «Дата створення» = `draftCreatedAt` (у списку API також поле `createdAt`); якщо `movementDate` відрізняється — жовтий блок **«Дата операції»** (як у комплектації/списаннях), логіка в `HistoryAccordionItem`.
- **Видалення:** кнопка «Видалити» → `DELETE /api/warehouse/:id` (delMark у Dilovod за наявності `dilovodDocId`); право `ACTION_WAREHOUSE_HISTORY_DELETE` + override `ACTION_WAREHOUSE_MOVEMENT_DELETE` для не-чернеток.

Редагування документа Dilovod: drawer `WarehouseDocumentEditDrawer` — UI **v2**, не v1 `MovementEditorView`.

### Drawer редагування goodMoving

| Аспект | Реалізація |
|--------|------------|
| Компонент | `MovementV2DilovodEditDrawer` — власний `ResizableAppDrawer` (`stackLevel={1}`) |
| Форма | `MovementV2EditorPanel` + `useWarehouseMovementV2.loadFromDilovodDocument` / `movementV2Adapters.linesFromGoodMovingDetails` |
| Завантаження | `GET /api/warehouse/details/:id?forEdit=true` (Dilovod-first) |
| Footer | **Скасувати** → `onClose` (без збереження); **Зберегти та відправити** → `useMovementV2SendFlow` |
| UX drawer | Без «Параметри переміщення»; `compactSummarySpacing` + `hideInlineActions` → компактні відступи реєстру/summary (`compactLayout` у `MovementV2EditorPanel`); дії лише в footer |
| Пошук товару | У drawer — `WarehouseProductSearch` з `dropdownPlacement="inline"` (список під полем, не portal на `body`), щоб клік по результату не закривав `ResizableAppDrawer` (HeroUI dismiss «outside») |
| Права | `ACTION_WAREHOUSE_MOVEMENT_EDIT` |
| Документи mob | Якщо запис зі скану (`linkedMobScan` / mob-`items`), drawer показує підказку; збереження не затирає ШК/partію — див. [mob — збереження полів скану](./warehouse-movement-mob.md#збереження-полів-скану-при-правках-v2). Strip `remark` з Dilovod: опційно `(сканування)` у regex. |

Точки входу: `ProductMovementsTable`, історія v1/v2 (`openDocumentEdit`).

### Вкладені drawer і z-index

`drawerStacking.ts`: рівень 0 — `z-[50]` / backdrop `z-[45]`; рівень 1 — document edit. Picker партії: `drawerChildOverlayClassName(parent)` + `overlayZClassName` через `WarehouseProductBatchesPanel`.

### Партії в реєстрі (freeQuantityMode)

| Дія | Умова |
|-----|--------|
| **max** | Залишок партії > обраної кількості |
| **Замінити партію** | Є інші партії на складі |
| **Додати партію** | Disabled, якщо немає невибраних доступних |
| **Додати всі партії** | Лише при `availableSkuBatches.length > 1` |

## Drawer / HMR

Context split для стабільності Vite HMR (pattern `.shared.ts` + dev noop):

- `ProductMovementsDrawerContext`
- `WarehouseDocumentEditDrawerContext`

Resizable drawer: `ResizableAppDrawer`, `useResizableDrawerWidth`, `drawerStacking.ts`.

## Ключові файли

| Область | Шлях |
|---------|------|
| Сторінка | `client/pages/Warehouse/WarehouseMovementV2/` (`MovementV2EditorPanel` — спільна форма сторінки та drawer) |
| Drawer edit | `client/features/warehouse-document-edit/` (`MovementV2DilovodEditDrawer.tsx`) |
| Пошук | `client/components/warehouse/` |
| Історія API | `server/modules/Warehouse/movementV2HistoryList.ts`, `MovementV2HistorySync.ts` |
| Індекс каталогу | `ProductsCatalogService.listWarehouseSearchIndex()` |
| v1 refactor | `MovementEditorView`, `useMovementSendFlow` — v1 сторінка тонша |

## Пов’язана документація

- [Швидка історія v2](./warehouse-movement-history-fast-list.md)
- [Кеш історії v1](./warehouse-movement-history-cache.md)
- [Movement mob (мобільний потік)](./warehouse-movement-mob.md)
