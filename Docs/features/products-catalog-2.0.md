# Products 2.0 — домен керування каталогом Dilovod

**Дата:** 2026-07-30  
**Маршрут:** `/products` (`minRole: WAREHOUSE_MANAGER`)  
**API:** `/api/catalog/*`

---

## Огляд

Новий backoffice-домен **«Товари 2.0»** для керування повним каталогом Dilovod (`catalogs.goods`): папки, товари, комплекти (BOM), ціни, штрихкоди з привʼязкою до партій (`goodPart`).

| Що | Рішення |
|----|---------|
| Джерело правди (SoT) | Dilovod (`catalogs.goods` + регістри цін/ШК + `tpGoods`) |
| Локальне дзеркало | Таблиці `catalog_*` (швидке дерево / UI) |
| Legacy `products` | **Не змінюється** Products 2.0; лишається для Orders / Warehouse / Reports і sync Dilovod |
| `/product-sets` | Без змін, співіснує в меню |

Мутації: спочатку Dilovod → потім sync у `catalog_*`. UI читає з локального дзеркала; повний/частковий re-pull — `POST /api/catalog/refresh`.

Залишки в картці товару — **read-only** join з legacy `products.stockBalanceByStock` (якщо запис є).

---

## Локальна схема (`catalog_*`)

| Таблиця | Призначення |
|---------|-------------|
| `catalog_goods` | Папки (`isGroup`) і товари; PK = Dilovod `id` |
| `catalog_good_components` | BOM / `tpGoods` |
| `catalog_good_prices` | Snapshot `informationRegisters.goodsPrices` |
| `catalog_good_barcodes` | Snapshot `informationRegisters.barCodes` (+ `goodPart` / `goodPartName`) |

Ключові поля `catalog_goods`: `parentId`, `isGroup`, `delMark`, `name` (uk only), `sku` (= Dilovod `productNum`), `mainUnitId`, `packageRatio`, `weight`, `accPolicyId`, `printName`, `description`, `syncedAt`.

Константи (`shared/types/catalog.ts`):

- Trash: `1100300000001805`
- Default `mainUnit`: `1103600000000001` (шт.)
- `accPolicy` товар: `1201200000001001`
- `accPolicy` комплект: `1201200000001031`

Hard-delete не робимо: archive/trash → `setDelMark` + зміна `parent`; локально `delMark=true`.

ШК: кілька записів на товар; unique `[goodId, code, goodPart]` (`goodPart = ""` — без партії).

Міграція: `prisma/migrations/20260727010000_add_catalog_tables/`.

---

## Backend структура

```
server/modules/Products/
  ProductsController.ts       # Express routes /api/catalog/*
  ProductsCatalogService.ts   # orchestration
  ProductsDilovodGateway.ts   # Dilovod request/getObject/saveObject/setDelMark, prices, barcodes
  ProductsLocalSync.ts        # лише catalog_* (без write у products)
  ProductsTypes.ts
  skuUtils.ts                 # allocateNextSku + race-safe retry
```

Підключення: `server/routes/catalog.ts` → `server/index.ts` (`/api/catalog`).

### API (мін. роль `WAREHOUSE_MANAGER`)

| Method | Path | Опис |
|--------|------|------|
| GET | `/tree` | Дерево папок (без смітника за замовчуванням) |
| GET | `/folder/:id/children` | Діти папки для таблиці (`id=root` → `parentId` null/`"0"`/`""`) |
| GET | `/search?q=` | Глобальний пошук |
| GET | `/goods/:id` | Картка (header + BOM + prices + barcodes + stock RO) |
| POST | `/goods` | Створити товар/папку |
| PUT | `/goods/:id` | Оновити (вкл. BOM, ціни, ШК) |
| POST | `/goods/:id/duplicate` | Дублікат (новий SKU, ШК лише якщо вільні) |
| POST | `/goods/move` | Bulk move (DnD / масово) |
| POST | `/goods/archive` | Bulk: папка «Архів – {parent}» + `setDelMark` |
| POST | `/goods/trash` | Bulk: parent = смітник + `setDelMark` |
| GET | `/trash` | Вміст смітника |
| GET | `/units` | Довідник одиниць |
| POST | `/refresh` | Full або partial (`ids`) re-pull з Dilovod |

### Sync і пагінація Dilovod

- `fetchAllGoods`: `limit: { offset, count }` (окремий top-level `offset` Dilovod ігнорує).
- Дедуп по `id` + safety-cap сторінок — захист від зациклення.
- `ProductsLocalSync.syncGoodsBatch`: чанки по 10, timeout tx 60s (повний refresh ~700+ рядків).
- ШК з `goodPart` тягне **окремий** запит gateway; legacy `getBarCodesByObjectIds` не змінюється.

### SKU

`skuUtils.allocateNextSku` + retry при колізії в Dilovod (`saveGoodWithSkuRetry`).

---

## Frontend

```
client/pages/Products/
  index.tsx
  useProductsCatalog.ts
  ProductsTypes.ts
  ProductsUtils.ts              # buildTreeItems, buildFolderBreadcrumbs, createCatalogDragPreview
  components/
    CatalogTree.tsx             # @headless-tree nested UI (canReorder: false)
    CatalogTable.tsx
    CatalogBreadcrumbs.tsx      # шлях + навігація над таблицею
    CatalogToolbar.tsx
    ProductDrawer.tsx           # CRUD, BOM, prices, barcodes, stock RO
    ArchiveConfirmModal.tsx
    TrashDrawer.tsx
```

Маршрут у `client/routes.config.tsx`: `/products`, nav «Товари 2.0», опційний `navBadge: { label: 'NEW', color: 'danger', until: '…' }`.

Залежності UI: `@headless-tree/core`, `@headless-tree/react`.

### UI: дерево, таблиця, breadcrumbs

**Дерево (`CatalogTree`)** — nested-рендер через `tree.getRootItem()`:

- Root «Каталог» завжди видимий і **завжди розгорнутий** (без chevron / без collapse / без DnD drag).
- Chevron лише у папок із дочірніми папками.
- Клік по **неактивній** папці → select + expand (якщо згорнута); **згортання** — лише клік по вже активній папці або по chevron.
- Клік по **chevron** → лише expand/collapse, **без** зміни `selectedFolderId` і без reload таблиці.
- Vertical lines (`border-l`) — для вкладених рівнів; у дітей root лінії немає.
- Плавне розкриття: CSS `grid-template-rows` + `transition`.

**Breadcrumbs (`CatalogBreadcrumbs`)** — над таблицею:

- Шлях від root до `selectedFolderId` (`buildFolderBreadcrumbs`).
- Клік по крошці → навігація в цю папку (скидає selection і пошук).
- У режимі пошуку додається крок `Пошук: «…»`.

**Таблиця** — діти поточної папки (`GET /folder/:id/children`); у root також папки + товари з кореня.

### UI: DnD і підтвердження

- DnD лише зміна `parent` (`canReorder: false`). Root **не** можна тягнути (`canDrag` + `draggable={false}`).
- Drop на папку / root дозволений (з дерева або з таблиці via `application/x-catalog-ids`).
- Drag preview: `createCatalogDragPreview` — кастомний `setDragImage`, кілька елементів стовпчиком.
- Перед мутаціями — confirm:
  - move (після drop) → `ConfirmModal`
  - archive → `ArchiveConfirmModal`
  - trash / duplicate → `ConfirmModal`

### Корінь каталогу Dilovod (`parentId`)

У Dilovod елементи кореня мають `parent = "0"`. Локально:

- `ProductsDilovodGateway.mapObjectToLocal`: `"0"` / `""` → `null`.
- `GET /folder/root/children` і `getFolderChildren(null)` шукають `parentId IN (null, "0", "")`.
- `buildTreeItems` також мапить `"0"` / відсутній parent → `CATALOG_ROOT_ID`.

---

## Межі відповідальності vs legacy

| Домен | Відповідальність |
|-------|------------------|
| Products 2.0 | Каталог Dilovod → `catalog_*`, CRUD/дерево/ШК з партіями |
| Legacy Dilovod product sync | Єдиний власник таблиці `products` (ціни, `set[]`, barcode, stock sync) |
| SettingsProductSets | Як раніше (`/product-sets`) |

⚠️ Products 2.0 **не** робить write-through у `products`. Раніший write-through затирав `set` у комплектів і ламав hash-skip legacy sync — прибрано.

---

## Типові операції

1. Перший запуск UI без даних → **Refresh Dilovod** (`POST /api/catalog/refresh`).
2. Створення/редагування → Dilovod `saveObject` (+ регістри) → `ProductsLocalSync.syncGood`.
3. Archive / Trash → зміна `parent` + `setDelMark`.
4. DnD / bulk move → confirm → лише зміна parent (без reorder siblings у дереві).
5. Навігація: дерево, breadcrumbs або double-open папки з таблиці.

---

## Повʼязані файли

| Шар | Файли |
|-----|--------|
| Schema | `prisma/schema.prisma`, migration `20260727010000_add_catalog_tables` |
| Shared | `shared/types/catalog.ts` |
| Server | `server/modules/Products/*`, `server/routes/catalog.ts` |
| Client | `client/pages/Products/**`, `client/routes.config.tsx` |
| Nav badge | `NavBadge` / `isNavBadgeVisible` у `routes.config.tsx`, рендер у `Sidebar.tsx` |
