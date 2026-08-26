# Products 2.0 — домен керування каталогом Dilovod

**Дата:** 2026-07-30 (оновлено 2026-08-17)  
**Маршрут:** `/products` (`minRole: WAREHOUSE_MANAGER`)  
**API:** `/api/catalog/`*

---

## Огляд

Новий backoffice-домен **«Товари 2.0»** для керування повним каталогом Dilovod (`catalogs.goods`): папки, товари, комплекти (BOM), ціни, штрихкоди з привʼязкою до партій (`goodPart`).


| Що                   | Рішення                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Джерело правди (SoT) | Dilovod (`catalogs.goods` + регістри цін/ШК + `tpGoods`)                                                                        |
| Локальне дзеркало    | Таблиці `catalog_*` (швидке дерево / UI)                                                                                        |
| Legacy `products`    | Читається Orders / Warehouse / Reports; Products 2.0: **вузький dual-write** ops + явний **Legacy Update** + **TEMP** Legacy після «Синхронізувати гілку» |
| `/product-sets`      | Без змін, співіснує в меню                                                                                                      |


Мутації: спочатку Dilovod → потім sync у `catalog_*`. UI читає з локального дзеркала; повний/частковий re-pull — `POST /api/catalog/refresh`.

Залишки в картці / таблиці — з `catalog_goods.stockBalanceByStock` (дзеркало JSON `{"1":ГП,"2":МС}`); при create/update також dual-write у `products`.

---



## Локальна схема (`catalog_*`)


| Таблиця                   | Призначення                                                              |
| ------------------------- | ------------------------------------------------------------------------ |
| `catalog_goods`           | Папки (`isGroup`) і товари; PK = Dilovod `id`                            |
| `catalog_good_components` | BOM / `tpGoods` (+ `note` ↔ Dilovod `remark`)                            |
| `catalog_good_prices`     | Snapshot `informationRegisters.goodsPrices`                              |
| `catalog_good_barcodes`   | Snapshot `informationRegisters.barCodes` (+ `goodPart` / `goodPartName`) |
| `catalog_good_images`     | Локальні зображення товару                                               |


Ключові поля `catalog_goods`: `parentId`, `isGroup`, `delMark`, `name` (uk only), `sku` (= Dilovod `productNum`), `mainUnitId`, `packageRatio`, `weight`, `accPolicyId`, `printName`, `description` / `fullDescription`, **`sortOrder`**, **`unitRatio`**, **`stockBalanceByStock`**, `syncedAt`.

Локальні ops-поля (не SoT Dilovod для порядку / порцій / залишків-дзеркала):

| Поле                  | Призначення                                                                 |
| --------------------- | --------------------------------------------------------------------------- |
| `sortOrder`           | Ручний порядок siblings у папці; інтервал **крок 10**; індекс `(parentId, sortOrder)` |
| `unitRatio`           | Коеф. порцій; dual-write → `products.unitRatio` (Admin UI у Drawer)         |
| `stockBalanceByStock` | JSON залишків; дзеркало з Dilovod stock sync + dual-write у `products`      |

`catalog_good_components.note` — примітка рядка специфікації продукції ↔ Dilovod `tpGoods.remark` (varchar до 150 у gateway; у БД до 512). **Не використовується** для товарних наборів (`accPolicy` kit) у UI/save.

Константи (`shared/types/catalog.ts`):

- Trash: `1100300000001805`
- Default `mainUnit`: `1103600000000001` (шт.)
- Default currency UAH: `1101200000001001`
- `accPolicy` за замовчуванням (Продукція): `1201200000001001`
- `accPolicy` комплект (Товарні набори): `1201200000001031`

Hard-delete не робимо: archive/trash → `setDelMark` + зміна `parent`; локально `delMark=true`. Зняття позначки (restore / вихід з архіву) → `saveObject` з `delMark: 0`.

ШК: кілька записів на товар; unique `[goodId, code, goodPart]` (`goodPart = ""` — без партії).

Міграції:

- `prisma/migrations/20260727010000_add_catalog_tables/`
- `prisma/migrations/20260803090000_catalog_ops_fields_and_sort/` — `sortOrder` / `unitRatio` / `stockBalanceByStock` / `note` + backfill

Хелпер сортування: `shared/utils/catalogSortOrder.ts` (`computeIntervalSortOrder`, `rebalanceSortOrders`, крок `CATALOG_SORT_ORDER_STEP = 10`).

---



## Backend структура

```
server/modules/Products/
  ProductsController.ts       # Express routes /api/catalog/*
  ProductsCatalogService.ts   # orchestration + getDictionaries + reorder + dual-write ops
  ProductsDilovodGateway.ts   # Dilovod + fetchCachedDict + remark↔note
  ProductsLocalSync.ts        # catalog_* (+ preserve local ops; merge note)
  CatalogMediaService.ts      # зображення товару
  ProductsTypes.ts            # + isArchiveFolderName, extractUkName
  skuUtils.ts                 # allocateNextSku + race-safe retry
  barcodeUtils.ts             # EAN-13 серія 22… + check digit + allocateNextEan13
```

Підключення: `server/routes/catalog.ts` → `server/index.ts` (`/api/catalog`).

### API (мін. роль `WAREHOUSE_MANAGER`)


| Method | Path                   | Опис                                                                             |
| ------ | ---------------------- | -------------------------------------------------------------------------------- |
| GET    | `/tree`                | Дерево папок (без смітника за замовчуванням)                                     |
| GET    | `/folder/:id/children` | Діти папки для таблиці (`id=root` → `parentId` null/`"0"`/`""`)                  |
| GET    | `/search?q=`           | Глобальний пошук (включно з архівом / смітником, крім самої папки-смітника)      |
| GET    | `/sku/next`            | Наступний вільний SKU у папці (`?parentId=&excludeId=`)                           |
| GET    | `/barcode/next`        | Наступний вільний внутрішній EAN-13 (серія `22…`) з Dilovod `barCodes`           |
| GET    | `/goods/:id`           | Картка (header + BOM + prices + barcodes + stock RO); live-pull з Dilovod        |
| POST   | `/goods`               | Створити товар/папку                                                             |
| PUT    | `/goods/:id`           | Оновити (вкл. BOM, ціни, ШК)                                                     |
| POST   | `/goods/:id/duplicate` | Дублікат (новий SKU, ШК лише якщо вільні)                                        |
| POST   | `/goods/move`          | Bulk move; якщо ціль — архів → також `setDelMark`; вихід з архіву → `delMark: 0` |
| POST   | `/goods/archive`       | Bulk: папка «Архів – {parent}» + `setDelMark`                                    |
| POST   | `/goods/restore`       | Bulk: parent = батько архіву + `delMark: 0`                                      |
| POST   | `/goods/trash`         | Bulk: parent = смітник + `setDelMark`                                            |
| POST   | `/reorder`             | Sibling reorder: `{ parentId, id, beforeId?, afterId? }` → інтервальний `sortOrder` |
| GET    | `/trash`               | Вміст смітника                                                                   |
| GET    | `/units`               | Довідник одиниць (thin-wrapper над кешем)                                        |
| GET    | `/dictionaries`        | `{ units, priceTypes, currencies, accPolicies }` з кешу Dilovod                  |
| POST   | `/refresh`             | Full або partial (`ids`) re-pull з Dilovod                                       |


### Кешовані довідники Dilovod

Патерн як у фірм/складів: `DilovodCacheService` → `settings_base` ключі `dilovod.cache.{type}` + `.lastUpdate`, TTL **24h**.


| CacheType     | Dilovod `from`              | Призначення                                    |
| ------------- | --------------------------- | ---------------------------------------------- |
| `units`       | `catalogs.units`            | `catalog_goods.mainUnitId`                     |
| `priceTypes`  | `catalogs.priceTypes`       | `catalog_good_prices.priceType`                |
| `currency`    | `catalogs.currency`         | `catalog_good_prices.currency`                 |
| `accPolicies` | `catalogs.goodsAccPolicies` | `catalog_goods.accPolicyId` (тип номенклатури) |


- Fetch: `ProductsDilovodGateway.fetchCachedDict(type, forceRefresh?)`.
- Refresh усіх (вкл. старі firms/accounts/… + нові): `DilovodService.refreshAllDirectoriesCache` → `POST /api/dilovod/cache/refresh`.
- UI статусу: `/settings/dilovod` → `DilovodCacheManager` (картки + «Переглянути записи»).
- `GET /api/dilovod/directories` також віддає `units` / `priceTypes` / `currencies` / `accPolicies`.

`accPolicy` у metadata `catalogs.goods` має `valueType: catalogs.goodsAccPolicies` (idPrefix `12012`). Приклади назв: `…1001` = «Продукція», `…1031` = «Товарні набори».

### Description (multilang + HTML)

Dilovod повертає `description: { uk, ru }`. Раніше `String(obj)` давав `[object Object]` у локальному дзеркалі.

- Read (`mapObjectToLocal`): `extractUkName(header.description)`.
- Write (create/update): `header.description = { uk: html, ru: html }`.
- UI: TipTap (`DescriptionEditor`) — bold / italic / lists / link; зберігається HTML у полі uk.

### BOM (`catalog_good_components`)

- `mapObjectToLocal` парсить `tableParts.tpGoods` (вкл. `remark` → `note`).
- Live-pull картки (`syncGoodFromDilovodLive`) **передає** `mapped.components` у `productsLocalSync.syncGood`.
- Create/update пишуть `tpGoods` у Dilovod (з `remark` з `note`, slice 150) і замінюють локальний BOM.
- `ProductsLocalSync`: якщо sync payload **без** `note`, існуючі локальні примітки зберігаються (merge).

### Dual-write ops → `products`

`ProductsCatalogService.syncCatalogOpsFieldsToProducts(goodId)` після create/update/reorder (для не-груп):

| catalog_goods        | products            |
| -------------------- | ------------------- |
| `unitRatio`          | `unitRatio`         |
| `weight` (кг→г)      | `weight`            |
| `packageRatio`       | `portionsPerBox`    |
| `sortOrder`          | `manualOrder`       |
| `stockBalanceByStock`| `stockBalanceByStock` |

Match: `dilovodId = catalog id` або `sku`. **Не** чіпає `set`, `dilovodDataHash`, ціни тощо.

### Інтервальне сортування (`POST /reorder`)

- Siblings у межах одного `parentId` (root = `null`/`"0"`/`""`).
- Тіло: `{ parentId, id, beforeId?, afterId? }`.
- Алгоритм: `computeIntervalSortOrder(prev, next)`; якщо щілини немає → `rebalanceSortOrders` усіх siblings кроком 10.
- UI: DnD папок у дереві; DnD товарів у таблиці (grip); кнопка «Ручний порядок» скидає column-sort.

### Архів і `delMark`

Папка архіву визначається за іменем: `/^Архів\s*[–-]/` (`isArchiveFolderName`).


| Операція                                | Parent                       | Dilovod                                      | Локально                            |
| --------------------------------------- | ---------------------------- | -------------------------------------------- | ----------------------------------- |
| «В архів» (`/goods/archive`)            | папка «Архів – {parentName}» | `saveObject` + `setDelMark`                  | `parentId` + `delMark=true`         |
| Move **в** архів (`/goods/move`)        | обрана архівна папка         | `saveObject` + `setDelMark`                  | те саме                             |
| Move **з** архіву в звичайну папку      | нова папка                   | `saveObject` з `delMark: 0`                  | `delMark=false`                     |
| «Відновити з архіву» (`/goods/restore`) | батько папки-архіву          | `clearDelMark` = `saveObject` з `delMark: 0` | `parentId` батька + `delMark=false` |
| Trash                                   | `CATALOG_TRASH_ID`           | `setDelMark`                                 | `delMark=true`                      |


`ProductsDilovodGateway.clearDelMark(params)` — обгортка над `saveObject` із примусовим `header.delMark = 0`.

### Sync і пагінація Dilovod

- `fetchAllGoods`: `limit: { offset, count }` (окремий top-level `offset` Dilovod ігнорує).
- Дедуп по `id` + safety-cap сторінок — захист від зациклення.
- `ProductsLocalSync.syncGoodsBatch`: чанки по 10, timeout tx 60s (повний refresh ~700+ рядків).
- ШК з `goodPart` тягне **окремий** запит gateway; legacy `getBarCodesByObjectIds` не змінюється.



### SKU

`skuUtils.allocateNextSku` + retry при колізії в Dilovod (`saveGoodWithSkuRetry`).

UI: кнопка `dices` у полі SKU → `GET /api/catalog/sku/next?parentId=&excludeId=`.

### Штрихкоди (EAN-13 серія `22…`)

Внутрішні коди формату **`22XXXXXXXXXXC`** (приклад: `2200000000224`). Остання цифра — GS1 check digit.

Алгоритм `GET /api/catalog/barcode/next`:

1. `ProductsDilovodGateway.fetchAllBarcodeCodes` — пагінація `sliceLast` / `barCodes` (лише `activity !== "0"`).
2. `pickLatestEan13` — max серед кодів з префіксом **`22`** (зовнішні EAN на кшталт `482…` ігноруються).
3. Body (12 цифр) + 1 → `ean13CheckDigit` → повний код.
4. `isBarcodeTaken` + in-process mutex / retry (`barcodeUtils.allocateNextEan13`).
5. Якщо серії `22…` ще немає — seed body `220000000000` → `2200000000002`.

UI у `ProductDrawer` (секція «Штрихкоди»):

- Поле **Код**: `endContent`-кнопка генерації (жовтий фон при loading, tooltip «Генерувати ШК»).
- Якщо поле вже заповнене → `ConfirmModal` «Замінити?» перед запитом.
- Поле **Номер партії**: read-only; клік відкриває `BatchNumbersAutocomplete` через `useBatchNumbers` → `GET /api/warehouse/batch-numbers/:sku?includeSmallStorage=true` (ГП + малий склад, `qty > 0`); у кожному рядку — помітка складу зберігання (`storageDisplayName`).
- Потрібен непорожній `form.sku`; інакше toast.
- `onSelect`: `goodPart = batchId`, `goodPartName = batchNumber`.
- Окремого Input «Партія (ID)» немає; у **debug mode** (`useDebug`) ID показується маленьким бейджем у полі номера партії.

---



## Frontend

```
client/pages/Products/
  index.tsx
  useProductsCatalog.ts         # treeItems + treeItemsFull, dictionariesQuery, restore/reorder/legacySync mutations
  ProductsTypes.ts              # CatalogTreeItemData.archiveChildId + dict re-exports
  ProductsUtils.ts              # buildTreeItems, resolveCatalogItemLocation, goodTypeLabel, …
  components/
    CatalogTree.tsx             # DnD move + sibling reorder (лінія вставки)
    CatalogTable.tsx            # GP-колонки, пошук: категорія + «В замовленнях», SortDescriptor, goods DnD grip
    CatalogBreadcrumbs.tsx      # у пошуку: лише Каталог > Пошук
    CatalogToolbar.tsx          # Синхронізувати гілку (+ TEMP Legacy), вибірковий Legacy, archive/trash
    CatalogContextMenu.tsx      # Legacy Update, fromTrash / fromArchive (і в пошуку)
    MoveToFolderModal.tsx
    ProductDrawer.tsx           # футер: Оновити Legacy; Tabs kind, BOM note, unitRatio Admin, …
    DescriptionEditor.tsx
    ArchiveConfirmModal.tsx
    TrashDrawer.tsx             # ПКМ → context menu «Відновити»
```

Маршрут у `client/routes.config.tsx`: `/products`, nav «Товари 2.0», опційний `navBadge: { label: 'NEW', color: 'danger', until: '…' }`.

Залежності UI: `@headless-tree/core`, `@headless-tree/react`, `@tiptap/react` (+ starter-kit, extension-link).

### UI: ProductDrawer

- Тип обʼєкта: Tabs **Продукція / Товарні набори / Група / Інший** (`DrawerObjectKind` ↔ `accPolicyId` / `isGroup`).
- BOM:
  - **Продукція** — «Специфікація товару»; qty через `NumberInputFromNumber` (див. `Docs/architecture/number-input.md`); **примітка** (Chip + Popover, Dilovod remark); мікро-конфірм видалення примітки (іконка → «Видалити?» → clear).
  - **Товарні набори** — «Склад комплекту»; qty `StepperInput`; **без** примітки (`note: null` у save).
- `unitRatio` — поле лише для Admin (продукція).
- Одиниці / типи цін / валюти — Select з `GET /dictionaries`.
- Опис — `DescriptionEditor` (не name/printName).
- ШК: генерація EAN-13 (`/barcode/next`) + вибір партії (reuse Movement `BatchNumbersAutocomplete`); див. секцію «Штрихкоди» вище.
- Unsaved: snapshot form+BOM+prices+barcodes → `isDirty` → `useUnsavedGuard` + `UnsavedChangesModal` при закритті Drawer / навігації / beforeunload.
- Смітник у картці: `parentId === CATALOG_TRASH_ID` → кнопка «Відновити» (move picker).
- Футер (edit, є SKU): зліва **Оновити Legacy** → той самий confirm / `legacySyncMutation`, що в toolbar і context menu.

### UI: тип у таблиці

`goodTypeLabel(item, accPolicies?)`:

- папка → «Група» / «Архів»;
- інакше назва з довідника `accPolicies` за `accPolicyId`;
- fallback без довідника: `…1001` → «Продукція», kit/`…1031` → «Товарні набори», інакше «Товар».

### UI: дерево, таблиця, breadcrumbs

**Дерево (**`CatalogTree`**)** — nested-рендер через `tree.getRootItem()`:

- Root «Каталог» завжди видимий і **завжди розгорнутий** (без chevron / без collapse / без DnD drag).
- Chevron лише у папок із дочірніми папками.
- Клік по **неактивній** папці → select + expand (якщо згорнута); **згортання** — лише клік по вже активній папці або по chevron.
- Клік по **chevron** → лише expand/collapse, **без** зміни `selectedFolderId` і без reload таблиці.
- Vertical lines (`border-l`) — для вкладених рівнів; у дітей root лінії немає.
- Плавне розкриття: CSS `grid-template-rows` + `transition`.
- **DnD:** drop на папку/root = **move** (`requestMove`); drop між siblings (лінія above/below) = **reorder** (`POST /reorder`).

**Архіви в sidebar-дереві:**

- `buildTreeItems(nodes)` за замовчуванням `hideArchives: true`: папки «Архів – …» лишаються в map (для breadcrumbs / lookup), але знімаються з `children`; id пишеться в `archiveChildId` батька.
- У пункті меню батька — іконка `archive` + Tooltip «Відкрити архів» → `onSelectFolder(archiveChildId)`.
- `treeItemsFull` = `buildTreeItems(nodes, { hideArchives: false })` — для picker / перевірок `isArchiveFolderId`.

**Таблиця** — діти поточної папки; рядки-папки з іменем архіву **приховані** (доступ лише через іконку в дереві або breadcrumbs).

- Гілка «Готова продукція»: колонки weight, packageRatio, unitRatio (Admin), ГП/МС, «В замовленнях»; stats з `/api/orders/products/stats?status=1|2|9&splitMonolithic=true`.
- **«В замовленнях»:** комплекти (`products.set`) — кількість наборів з рядків замовлення; звичайні товари — порції з `processedItems` мінус компоненти наборів (та сама логіка, що звіт відвантажень, але без `payload.shipment.bySku`).
- **Пошук** (`q` ≥ 2): колонки **Категорія** (`parentName`, клік → папка) і **В замовленнях** (навіть поза гілкою ГП). Клік по сумі або кольоровій цифрі відкриває модалку замовлень.
- Column `SortDescriptor`; кнопка **«Ручний порядок»** біля breadcrumbs скидає на `sortOrder`.
- **DnD товарів:** grip поза кнопкою назви; `stopPropagation` на pointerDown; reorder siblings через `/reorder` (у пошуку вимкнено).

**Breadcrumbs**

- Звичайний режим: шлях від root до `selectedFolderId` (крошка «Архів – …» видима всередині архіву).
- **Пошук:** лише `Каталог > Пошук: «…»` (без шляху поточної папки); клік по «Каталог» скидає пошук через `navigateToFolder`.

### UI: архів / смітник / відновлення / move picker

Розташування елемента: `resolveCatalogItemLocation(row, treeItems)` → `trash` | `archive` | `normal` (за `parentId` / імʼям батька).

- Усередині архівної папки **або** коли всі обрані — архівні (у т.ч. з **пошуку**): toolbar/context menu → **«Відновити з архіву»** замість «В архів».
- Елементи зі смітника (ПКМ у таблиці/пошуку/`TrashDrawer`, toolbar): **«Відновити»** замість «Видалити» → `MoveToFolderModal` (`isRestore`, дерево без архівів).
- Context menu: **«Перемістити в…»** → `MoveToFolderModal` з **повним** деревом (архіви як окремі папки); blocked = обрані ids + нащадки. Зі смітника move також іде через restore-picker.
- Confirm перед move (DnD) попереджає про деактивацію, якщо ціль — архів.
- Restore з архіву → confirm → `POST /goods/restore`.

### UI: ProductOrdersModal

Спільна модалка: `client/components/modals/ProductOrdersModal.tsx` (таби конфігуруються пропом `tabs`).

| Контекст | Таби |
| --- | --- |
| Каталог `/products` | Всі \| Нові \| Підтверджені \| На утриманні; `GET /api/orders/products/orders?sku=&status=1,2,9&splitMonolithic=true` (для наборів — кількість комплектів) |
| Звіт відвантажень | Звичайні порції \| У складі монолітних наборів (`hideTabs` для плоского монолітного списку) |

Навігація між товарами: контрол у хедері **перед SKU** (↑/↓ + `n / total`); стрілки клавіатури лишаються. Футера немає.

### UI: DnD і підтвердження

- **Move:** drop на папку / root (з дерева або таблиці via `application/x-catalog-ids`). Root **не** можна тягнути.
- **Reorder:** siblings у дереві (папки) і таблиці (товари); `POST /reorder`.
- Drag preview: `createCatalogDragPreview` — кастомний `setDragImage`, кілька елементів стовпчиком.
- Перед мутаціями — confirm:
  - move (після drop) → `ConfirmModal` (+ текст про деактивацію, якщо ціль архів)
  - move via picker → одразу `moveMutation` з попередженням у модалці
  - archive → `ArchiveConfirmModal`
  - restore → `ConfirmModal`
  - trash / duplicate → `ConfirmModal`



### Корінь каталогу Dilovod (`parentId`)

У Dilovod елементи кореня мають `parent = "0"`. Локально:

- `ProductsDilovodGateway.mapObjectToLocal`: `"0"` / `""` → `null`.
- `GET /folder/root/children` і `getFolderChildren(null)` шукають `parentId IN (null, "0", "")`.
- `buildTreeItems` також мапить `"0"` / відсутній parent → `CATALOG_ROOT_ID`.

---



## Межі відповідальності vs legacy


| Домен                       | Відповідальність                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| Products 2.0                | Каталог Dilovod → `catalog_*`, CRUD/дерево/ШК; **вузький dual-write** ops у `products`; **Legacy Update** (див. нижче) |
| Legacy Dilovod product sync | Основний власник таблиці `products` (ціни, `set[]`, barcode, stock sync); звичайний sync **не** force     |
| SettingsProductSets         | Як раніше (`/product-sets`); Phase 2 — поступовий cutover споживачів на `catalog_*`                      |


⚠️ Автоматичний write-through усієї картки з Products 2.0 у `products` **заборонений** (раніше затирав `set` у комплектів). Дозволені лише:

1. `syncCatalogOpsFieldsToProducts` (ops після create/update/reorder);
2. явна дія користувача **Legacy Update** → `POST /api/products/sync-manual`;
3. **TEMP:** після «Синхронізувати гілку» (`POST /api/catalog/refresh` з `folderId`) — Legacy Update активних SKU гілки. Прибрати після відмови від `products`.

### Legacy Update (Products 2.0 → `products`)

Явне (або TEMP після refresh гілки) оновлення legacy через Dilovod product sync (не dual-write картки).

| Що | Деталі |
| --- | --- |
| UI вибірково | Toolbar (обрані з SKU), context menu, кнопка **Оновити Legacy** у футері `ProductDrawer` |
| Confirm | Список обраних з SKU; папки / без SKU пропускаються |
| Клієнт | `legacySyncMutation` → `POST /api/products/sync-manual` з `{ skus, force: true }` |
| Сервер (вибірково) | `partitionCatalogSkusByArchive` → архівні: `products.isOutdated = true`; активні: `dilovodService.syncProductsWithDilovod('manual', …, { force })` |
| **TEMP гілка** | Після `refreshFolderFromDilovod`: `listSkusInFolderSubtree` → ті самі правила; відповідь містить `legacySkuCount`, `legacyOutdatedCount`, `legacySync` |
| Force | Ігнорує `dilovodDataHash` — завжди `update` / `create` |
| Поля sync | name, ціни, category, `set`, `portionsPerBox`, barcode, hash, `lastSyncAt`; weight при force через `determineWeightByCategory` |
| Архів | **Без** Dilovod: лише `isOutdated`, щоб не ловити зайві помилки API |

«Синхронізувати з Діловодом» по `ids` як і раніше оновлює лише `catalog_*`. «Синхронізувати гілку» = structure-refresh `catalog_*` **плюс TEMP Legacy**.

---



## Типові операції

1. Перший запуск UI без даних → **Refresh Dilovod** (`POST /api/catalog/refresh`); довідники — `/settings/dilovod` «Оновити все» або перший `GET /dictionaries`.
2. Створення/редагування → Dilovod `saveObject` (+ регістри) → `ProductsLocalSync.syncGood` → dual-write ops у `products`.
3. Відкриття картки → live-pull header + prices + barcodes + **BOM** (з `remark`/`note`).
4. Archive / Trash → зміна `parent` + `setDelMark`.
5. Restore з архіву → батьківська папка архіву + `delMark: 0`; зі смітника → move picker.
6. DnD: drop на папку = move; між siblings = `POST /reorder`.
7. Навігація: дерево (іконка архіву), breadcrumbs або open папки з таблиці; у пошуку — restore за `parentId` рядка.
8. **Legacy Update** (вибірково або TEMP після sync гілки) → активні SKU → `sync-manual` force; архівні → `products.isOutdated`.
9. Пошук → категорія / «В замовленнях» → модалка замовлень товару.

---



## Повʼязані файли


| Шар       | Файли                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| Schema    | `prisma/schema.prisma`, migrations `20260727010000_*`, `20260803090000_catalog_ops_fields_and_sort`           |
| Shared    | `shared/types/catalog.ts`, `shared/types/dilovod.ts`, `shared/utils/catalogSortOrder.ts`                       |
| Server    | `server/modules/Products/*` (`listSkusInFolderSubtree`, `partitionCatalogSkusByArchive`, TEMP legacy після refresh гілки), `server/routes/catalog.ts`, `server/routes/products.ts` (`sync-manual` + archive→`isOutdated`), `server/lib/utils.ts` (HMR-safe `prisma`), `DilovodService` / `DilovodSyncManager` / `DilovodCacheService` |
| Client    | `client/pages/Products/**`, `client/components/modals/ProductOrdersModal.tsx`, `ReportsShipment` (спільна модалка), `DilovodCacheManager.tsx`, `routes.config.tsx` |
| Nav badge | `NavBadge` / `isNavBadgeVisible` у `routes.config.tsx`, рендер у `Sidebar.tsx`                                 |
