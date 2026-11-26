# Products 2.0 — домен керування каталогом Dilovod

**Дата:** 2026-07-30 (оновлено 2026-10-21)  
**Маршрут:** `/products` (`minRole: WAREHOUSE_MANAGER`)  
**API:** `/api/catalog/`*

---

## Огляд

Новий backoffice-домен **«Товари 2.0»** для керування повним каталогом Dilovod (`catalogs.goods`): папки, товари, комплекти (BOM), ціни, штрихкоди з привʼязкою до партій (`goodPart`).


| Що                   | Рішення                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Джерело правди (SoT) | Dilovod (`catalogs.goods` + регістри цін/ШК + `tpGoods`)                                                                        |
| Локальне дзеркало    | Таблиці `catalog_*` (швидке дерево / UI)                                                                                        |
| Legacy `products`    | З 2026-11-20 **не читається й не пишеться** (комплектація через `CatalogOpsCache`, `id` в `/api/products*` = `catalog_goods.id`); чекає на видалення |
| `/product-sets`      | Без змін, співіснує в меню                                                                                                      |


Мутації: спочатку Dilovod → потім sync у `catalog_*`. UI читає з локального дзеркала; повний/частковий re-pull — `POST /api/catalog/refresh`.

Залишки в картці / таблиці: з `catalog_goods.stockBalanceByStock`. Склади залежать від гілки, див. «Залишки по складах».

---



## Локальна схема (`catalog_*`)


| Таблиця                   | Призначення                                                              |
| ------------------------- | ------------------------------------------------------------------------ |
| `catalog_goods`           | Папки (`isGroup`) і товари; PK = Dilovod `id`                            |
| `catalog_good_components` | BOM / `tpGoods` (+ `note` ↔ Dilovod `remark`; `cookingLossPercent`, `lossesJson` — лише локально) |
| `catalog_good_prices`     | Snapshot `informationRegisters.goodsPrices`                              |
| `catalog_good_barcodes`   | Snapshot `informationRegisters.barCodes` (+ `goodPart` / `goodPartName`) |
| `catalog_good_images`     | Локальні зображення товару                                               |


Ключові поля `catalog_goods`: `parentId`, `isGroup`, `delMark`, `name` (uk only), `sku` (= Dilovod `productNum`), `mainUnitId`, `packageRatio`, `weight`, `accPolicyId`, `printName` (legacy, завжди `null` — див. нижче), `description` / `fullDescription`, **`sortOrder`**, **`unitRatio`**, **`stockBalanceByStock`**, **`archivedAt`**, `syncedAt`.

Локальні ops-поля (не SoT Dilovod для порядку / порцій / залишків-дзеркала):

| Поле                  | Призначення                                                                 |
| --------------------- | --------------------------------------------------------------------------- |
| `sortOrder`           | Ручний порядок siblings у папці; інтервал **крок 10**; індекс `(parentId, sortOrder)` |
| `unitRatio`           | Коеф. порцій (Admin UI у Drawer)                                            |
| `stockBalanceByStock` | JSON залишків (формат залежить від гілки, див. «Залишки по складах»); дзеркало з Dilovod stock sync |

`catalog_good_components.note` — примітка рядка специфікації продукції ↔ Dilovod `tpGoods.remark` (varchar до 150 у gateway; у БД до 512). **Не використовується** для товарних наборів (`accPolicy` kit) у UI/save.

`catalog_good_components.cookingLossPercent` — **лише локально**: % втрат при готуванні (0–100) для рядків специфікації продукції; у Dilovod не пишеться. При sync з Dilovod існуюче значення зберігається (`ProductsLocalSync` merge). Міграція: `prisma/migrations/20260920120000_catalog_component_cooking_loss/`.

`catalog_good_components.lossesJson` — **лише локально**: розбивка втрат за типами `[{ typeId, percent }]` (типи – довідник `production_loss_types` у `settings_base`). Якщо розбивка є, `cookingLossPercent` = сума (`resolveCookingLossPercent`), тож код, що читає лише суму, працює як раніше. Розбивка входить у `componentsJson` чернетки й версії специфікації (поле `losses`) і проходить те саме затвердження. При sync з Dilovod (payload без втрат) розбивка зберігається разом із сумою; payload лише з `cookingLossPercent` скидає розбивку. Брутто: `grossFromNet` (`shared/utils/catalogLoss.ts`) за формулою з `production_loss_formula`: `additive` – нетто / (1 − Σ%), `sequential` – нетто / Π(1 − %). Міграція: `prisma/migrations/20261110120000_catalog_component_losses/`.

Константи (`shared/types/catalog.ts`):

- Trash: `1100300000001805`
- Default `mainUnit`: `1103600000000001` (шт.)
- Default currency UAH: `1101200000001001`
- `accPolicy` за замовчуванням (Продукція): `1201200000001001`
- `accPolicy` комплект (Товарні набори): `1201200000001031`
- Гілка **«Готова продукція»** (корінь `CATALOG_FINISHED_PRODUCTS_FOLDER_ID` = `1100300000001026`): порівняння з WooCommerce у pull/sync; поза гілкою WC-порівняння вимкнено (`wcCompareEnabled: false`), Dilovod ↔ BO — для всіх товарів з SKU

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
  ProductsCatalogService.ts   # orchestration + getDictionaries + reorder + скидання ops-знімка
  ProductsDilovodGateway.ts   # Dilovod + fetchCachedDict + remark↔note
  ProductsLocalSync.ts        # catalog_* (+ preserve local ops; merge note)
  CatalogMediaService.ts      # зображення товару
  catalogDilovodPreview.ts    # preview/apply полів з Dilovod для tri-source sync
  catalogFinishedProductsFolder.ts  # піддерево «Готова продукція» (WC compare gate)
  ProductsTypes.ts            # + isArchiveFolderName, extractUkName
  CatalogOpsLookup.ts         # ops-форма legacy `products` з `catalog_*`
  CatalogOpsCache.ts          # in-memory знімок для комплектації з catalog_* (TTL 2 хв)
  skuUtils.ts                 # allocateNextSku + race-safe retry
  barcodeUtils.ts             # EAN-13 серія 22… + check digit + allocateNextEan13
```

Підключення: `server/routes/catalog.ts` → `server/index.ts` (`/api/catalog`).

### Операційний знімок для комплектації (`CatalogOpsCache`)

Гарячий шлях відкриття замовлення **не** ходить у `catalog_*` по кожному SKU.

| Шар | Роль |
| --- | --- |
| `catalog_*` | SoT назв, BOM комплектів (`accPolicy` kit), залишків |
| `CatalogOpsCache` | Знімок у памʼяті на **120 с**: усі листові `catalog_goods` з SKU у ops-формі `toApiShape`; `set` лише для облікової політики «комплект» |

Рецептура звичайного товару (`spec` / BOM страви) **не** є `set` і не розгортається в чек-листі. `POST /api/expand/flatten` і `GET /api/products/:sku` читають знімок. Інвалідація: `applyStockBalances`, `deductSmallStock`, `refreshOpsSnapshot`, зміни картки (див. «Скидання ops-знімка після змін»).

Деталі: `Docs/features/expand-flatten-calc.md`.

### API (мін. роль `WAREHOUSE_MANAGER`)


| Method | Path                   | Опис                                                                             |
| ------ | ---------------------- | -------------------------------------------------------------------------------- |
| GET    | `/tree`                | Дерево папок (без смітника за замовчуванням)                                     |
| GET    | `/folder/:id/children` | Діти папки для таблиці (`id=root` → `parentId` null/`"0"`/`""`)                  |
| GET    | `/search?q=`           | Глобальний пошук (включно з архівом / смітником, крім самої папки-смітника)      |
| GET    | `/sku/next`            | Наступний вільний SKU у папці (`?parentId=&excludeId=`)                           |
| GET    | `/barcode/next`        | Наступний вільний внутрішній EAN-13 (серія `22…`) з Dilovod `barCodes`           |
| GET    | `/goods/:id`           | Картка (header + BOM + prices + barcodes + stock RO); за замовч. `livePull=true`; UI drawer часто `?livePull=false` (локальне дзеркало) |
| GET    | `/goods/:id/dilovod-preview` | Порівняння полів BO vs live Dilovod (name, weight, price, `packageRatio`); без запису |
| POST   | `/goods/:id/dilovod-apply` | Застосувати вибрані поля з Dilovod (`applyAll` або `fields[]`) |
| GET    | `/goods/:id/used-in`   | Зворотний BOM: `?scope=products` (страви) або `kits` (комплекти); ACL на батьків |
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
| POST   | `/refresh`             | Full; partial (`ids`); гілка `{ folderId, recursive?, maxDepth? }`               |


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

### `printName` (не використовуємо)

У metadata `catalogs.goods` поле **`printName`** — `varchar(1000)`, не multilang. Раніше backoffice помилково відправляв `{ uk, ru }` → `saveObject`: `cant set value of header.printName`.

Політика (оновлено 2026-10-23):

- **Dilovod SoT:** `ProductsDilovodGateway.saveObject` **не включає** `header.printName` у payload (поле відсутнє в `getObject` для частини номенклатури, зокрема зі специфікацією `tpGoods`; явна передача `''` давала ту саму помилку).
- **Локальне дзеркало:** create/update/sync не зберігають значення (`printName: null`); колонка лишається для сумісності / пошуку старих рядків.
- **UI:** окреме поле «Назва для друку» прибрано з drawer; лейбли та split title — лише з `name`.

Деталі metadata: [`dilovod-metadata.md`](../integrations/dilovod-metadata.md) → `catalogs.goods.printName`.

### BOM (`catalog_good_components`)

- `mapObjectToLocal` парсить `tableParts.tpGoods` (вкл. `remark` → `note`).
- Live-pull картки (`syncGoodFromDilovodLive`) **передає** `mapped.components` у `productsLocalSync.syncGood`.
- Create/update пишуть `tpGoods` у Dilovod (з `remark` з `note`, slice 150) і замінюють локальний BOM.
- `ProductsLocalSync`: якщо sync payload **без** `note`, існуючі локальні примітки зберігаються (merge).

### Перевірка збереження специфікації (2026-11-25)

`CatalogSpecService.applyContent` (затвердження чернетки, відкат версії):

- Після `updateGood` склад перечитується з БД і порівнюється із запитаним (id + кількість, `specQty`). Одиниці й втрати не порівнюються: `updateGood` підставляє типові значення.
- При розбіжності: лог `[catalog-spec] applyContent: saved spec differs from requested`, помилка 500 затверджувачу, версія і сповіщення не створюються, чернетка лишається.
- Версія пишеться з реально збереженого складу, а не із запитаного.
- Першопричина випадків 03001, 03004, 01006 (2026-11-26): коробкові ШК перезаписувались як порційні, unique-помилка відкочувала локальний sync разом зі складом. `updateGood` і `replaceBarcodes` тепер коробкові рядки не чіпають.

### Дублі в складі комплекту (2026-11-25)

Лише для комплектів (`CATALOG_ACC_POLICY_KIT`). У специфікації товару один інгредієнт на різних етапах техкарти допустимий.

- `shared/utils/catalogKitDuplicates.ts`: `findKitDuplicateComponents` (за id, інакше за SKU) і всі тексти повідомлень.
- Картка: товар, який уже є в складі, у пошуку неактивний з міткою «вже додано», повторне додавання відхиляється тостом. Рядки-дублі підсвічуються, під «Склад комплекту» показується «У складі є дублі: … Обʼєднайте рядки».
- Сервер: `createGood` / `updateGood` не зберігають комплект із дублями (`assertNoKitDuplicateComponents`). `updateGood` перевіряє лише при явній зміні складу, щоб інші правки наявного кривого комплекту не блокувались.
- Синхронізація з Dilovod (`ProductsLocalSync`) дублі не блокує, лише віддзеркалює дані.
- Каталог: мітка уваги «Склад комплекту: дублі (SKU)» (`computeKitDuplicateSkusByGoodId` у `catalogListAttentionEnrichment.ts`, поле `kitDuplicateSkus`).
- Комплектування такого набору заблоковано з поясненням: `Docs/features/warehouse-release-sets.md` → «Дублі в складі набору».

### Зворотний BOM (`GET /goods/:id/used-in`)

- Запит по `componentGoodId` у `catalog_good_components`; відповідь — `CatalogGoodUsedInDto[]` (унікальні батьки, `qty` = сума рядків, `rowCount`).
- `scope=products` — батьки з `accPolicy` продукції (`CATALOG_ACC_POLICY_GOOD`); `scope=kits` — комплекти (`CATALOG_ACC_POLICY_KIT`).
- Виключаються групи, `delMark`, елементи в смітнику; ACL — `canViewCatalogItem` на кожного батька.
- UI: `UsedInSection` (lazy `useQuery`), не входить у `getGoodDetail`.

### Скидання ops-знімка після змін

З 2026-11-20 Products 2.0 у `products` **не** пише. Замість dual-write `ProductsCatalogService.invalidateOpsSnapshot()` скидає `CatalogOpsCache` після `createGood`, `updateGood`, `applyDilovodPull`, `reorderSibling`, архівації / відновлення (`setArchivedAt`), `refreshFromDilovod` і `refreshFolderFromDilovod`. PUT `/api/products/:id/*` скидають знімок напряму. Решта змін (ШК коробок, партії) підхоплюється через TTL 120 с.

## Межі відповідальності vs legacy


| Домен                       | Відповідальність                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| Products 2.0                | Каталог Dilovod → `catalog_*`, CRUD/дерево/ШК; ops-знімок комплектації (`CatalogOpsCache`) |
| Legacy `products`           | **Не читається й не пишеться** (2026-11-20). Таблиця чекає на видалення (`Docs/plans/legacy-products-removal.md`) |
| SettingsProductSets         | Як раніше (`/product-sets`), але працює поверх `catalog_*` через `/api/products`                         |

### Legacy-синхронізація (історія)

- **Legacy Update** (`POST /api/products/sync-manual`): кнопки прибрано з UI 2026-11-16; з 2026-11-20 endpoint лише скидає ops-знімок (`catalogOpsLookup.refreshOpsSnapshot`), без запису в `products`. Архівні SKU відкидаються.
- **TEMP після «Синхронізувати гілку»**: прибрано 2026-11-20. Відповідь `POST /api/catalog/refresh` з `folderId` ще містить `legacySkuCount` / `legacyOutdatedCount` / `legacySync` / `legacyError` (нулі / `null`) для сумісності клієнта.
- `syncProductsWithDilovod` (`/api/products/sync`, `/sync-and-export`, `/stock/balance?sync=true`) теж лише скидає знімок. Cron «sync products» і `/api/goods-cache` видалено.

«Синхронізувати з Діловодом» по `ids` і «Синхронізувати гілку» оновлюють лише `catalog_*` (гілка: structure-refresh з вибором глибини).

---



## Типові операції

1. Перший запуск UI без даних → **Refresh Dilovod** (`POST /api/catalog/refresh`); довідники — `/settings/dilovod` «Оновити все» або перший `GET /dictionaries`.
2. Створення/редагування → Dilovod `saveObject` (+ регістри) → `ProductsLocalSync.syncGood` → скидання ops-знімка.
3. Відкриття картки → live-pull header + prices + barcodes + **BOM** (з `remark`/`note`); зворотний BOM — окремий lazy `GET /goods/:id/used-in` у `UsedInSection`.
4. Archive / Trash → зміна `parent` + `setDelMark`.
5. Restore з архіву → батьківська папка архіву + `delMark: 0`; зі смітника → move picker.
6. DnD: drop на папку = move; між siblings = `POST /reorder`.
7. Навігація: дерево (іконка архіву), breadcrumbs або open папки з таблиці; у пошуку — restore за `parentId` рядка. URL hash: `folder` / `q` / `good`.
8. Пошук → категорія / «В замовленнях» → модалка замовлень товару.

---



## Повʼязані файли


| Шар       | Файли                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| Schema    | `prisma/schema.prisma`, migrations `20260727010000_*`, `20260803090000_catalog_ops_fields_and_sort`           |
| Shared    | `shared/types/catalog.ts` (+ `CatalogGoodUsedInDto`, `imagePreviewUrls`), `shared/types/dilovod.ts`, `shared/utils/catalogSortOrder.ts`, `catalogHtmlCompare.ts`, `catalogImageThumbUrl.ts`, `resolveCatalogMediaAbsoluteUrl.ts`, `storefrontDescriptionDocDiff.ts`, `textInlineDiff.ts` |
| Server    | `server/modules/Products/*` (`listSkusInFolderSubtree`, `partitionCatalogSkusByArchive`, `catalogDilovodPreview`, `catalogFinishedProductsFolder`, TEMP legacy після refresh гілки), `server/modules/Storefront/WooCommerceSyncService.ts` (pull preview/apply, `wcCompareEnabled`), `server/routes/catalog.ts`, `server/routes/products.ts` (`sync-manual` + archive→`isOutdated`), `server/lib/utils.ts` (HMR-safe `prisma`), `DilovodService` / `DilovodSyncManager` / `DilovodCacheService` |
| Client    | `client/pages/Products/**` (`catalogApi.ts`, `CatalogTable`, `CatalogImagePreviewPopover`, `CatalogImageGalleryLightbox`, drawer sync modal), `client/lib/photoswipeOverlay.ts`, `client/lib/staleChunkRecovery.ts`, `client/hooks/useUrlHashSync.ts`, `client/components/modals/ProductOrdersModal.tsx`, `ReportsShipment` (спільна модалка), `DilovodCacheManager.tsx`, `routes.config.tsx` |
| Nav badge | `NavBadge` / `isNavBadgeVisible` у `routes.config.tsx`, рендер у `Sidebar.tsx`                                 |
