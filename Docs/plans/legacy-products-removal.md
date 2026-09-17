# План повного звільнення від legacy `products` з переходом на `catalog_goods`

## Поточний стан (що вже зроблено / що лишилось)

### ✅ Вже на `catalog_goods`

- **Products 2.0** (`/products`) — `/api/catalog/*`, `ProductsCatalogService`
- **Операційні модулі** — склад, повернення, списання, комплектація, експорт Dilovod: `catalogOpsLookup`
- **`/api/products` GET** — список, batch, search, stats → `catalogOpsLookup`
- **`syncProductsWithDilovod`** — уже **не** тягне з Dilovod напряму, а лише викликає `projectToProductsCache`

### ❌ Що ще тримає legacy `products`

| Шар | Що робить |
|-----|-----------|
| `projectToProductsCache` | Проекція `catalog_goods → products` (основний dual-write) |
| `ProductOpsCache` | Читає `prisma.product.findMany()`, збагачує з catalog |
| `applyStockBalances` / `deductSmallStock` | Dual-write залишків у обидві таблиці |
| PUT `/api/products/:id/*` | Пише в `catalog_good`, потім `projectGood()` → знову в `products` |
| `CatalogOpsProduct.id` | Numeric `products.id` для сумісності API |
| `resolveCatalogGoodId` | Резолвить numeric id через `products` |
| `DilovodGoodsCacheManager` | Рядок «Товари» в кеші Dilovod = проекція в `products` |
| `SettingsProductSets` (`/product-sets`) | Legacy UI синхронізації/експорту (~2500 рядків) |
| `DilovodSyncManager.syncProductsToDatabase` | **Мертвий код** (ніде не викликається) |
| Cron `sync-products` | Назва legacy, фактично — `projectToProductsCache` |

**Важливо:** у Prisma **немає FK на `products`** — таблиця ізольована, її можна прибрати після міграції читачів/писачів.

---

## Цільова архітектура

```
Dilovod (SoT) → catalog_* (локальне дзеркало) → catalogOpsLookup / CatalogOpsCache
                                                      ↓
                              замовлення, склад, експорт, комплектація
```

- **Єдине джерело:** `catalog_goods` + `catalog_good_components` + `catalog_good_prices` + `catalog_good_barcodes`
- **Єдиний ops-шар:** `catalogOpsLookup` (або `CatalogOpsCache` для hot-path)
- **`/api/products`** — або thin facade над catalog (тимчасово), або deprecation → `/api/catalog/ops/*`

---

## Фази міграції

### Фаза 0 — Аудит і freeze (1–2 дні)

**Мета:** зафіксувати scope і не плодити нові залежності.

1. **Інвентаризація читачів** `/api/products` і `prisma.product`:
   - `orderAssemblyUtils`, `OrderView`, `OrderChecklistItem`
   - склад: Movement, Returns, WriteOff, ReleaseSets
   - `expandService`, `ResultDrawer`, `Dashboard`
   - `SettingsProductSets`, `useProductsCatalog`
2. **Заморозити** нові dual-write в `products` (правило в PR).
3. **Метрики:** логувати cache hit/miss `ProductOpsCache` vs `catalogOpsLookup` (1 тиждень на prod/staging).

**Критерій виходу:** повний список файлів + підтвердження, що жоден модуль не пише в `products` напряму (окрім `CatalogOpsLookup`).

---

### Фаза 1 — Заміна `ProductOpsCache` (2–3 дні)

**Мета:** прибрати головний hot-path reader з `products`.

1. Створити **`CatalogOpsCache`** — той самий TTL-snapshot, але `reload()` з `catalogOpsLookup.listFinishedProducts()` (без `prisma.product`).
2. Перевести:
   - `expandService.flattenBatch` → `CatalogOpsCache`
   - `GET /api/products/:sku` → прибрати fast-path через `productOpsCache`
3. Видалити `ProductOpsCache.ts`.

**Критерій:** order assembly і expand працюють без `prisma.product`; perf не гірше ±10%.

---

### Фаза 2 — Прибрати dual-write (2–3 дні)

**Мета:** перестати писати в `products`.

1. **`applyStockBalances` / `deductSmallStock`** — лише `catalog_good.stockBalanceByStock`.
2. **PUT `/api/products/:id/*`** (weight, manual-order, unit-ratio, barcode, portions-per-box):
   - писати тільки в `catalog_*`
   - прибрати `projectGood()` після кожного PUT
3. **`ProductsCatalogService`** — прибрати `projectGood` / `markLegacyProductsOutdatedBySku` після catalog refresh.
4. **`syncProductsWithDilovod`** — перейменувати в `refreshOpsSnapshot` або видалити; **не** викликати `projectToProductsCache`.
5. **Cron** `sync-products` — або видалити, або замінити no-op / invalidate cache.

**Критерій:** у логах/коді **нуль** `prisma.product.create|update|delete`.

---

### Фаза 3 — API contract: `id` → `goodId` (3–5 днів)

**Мета:** прибрати numeric `products.id` з контракту.

1. **`CatalogOpsProduct`**:
   - `id` → `goodId: string` (Dilovod id)
   - optional `legacyId?: number` (тимчасово, deprecated)
2. **`resolveCatalogGoodId`** — приймає `goodId | sku`, без lookup у `products`.
3. **`toApiShape`** — повертає `goodId` як primary identifier.
4. **Client migration** (по модулях):
   - складові search/batch → `goodId` або `sku`
   - `SettingsProductSets` PUT → `/api/catalog/goods/:goodId` (або новий ops endpoint)
5. **Backward compat** (1 реліз): `/api/products/:id` приймає і numeric legacy id, і goodId — з deprecation header.

**Критерій:** жоден client-файл не використовує `product.id` як numeric для API calls.

---

### Фаза 4 — Консолідація UI (3–5 днів)

**Мета:** прибрати дубль «Товари (кеш)».

1. **`SettingsProductSets` (`/product-sets`)** — розкласти функції:

   | Функція | Куди |
   |---------|------|
   | Синхронізація з Dilovod | Products 2.0 → «Оновити з Dilovod» (вже є `/api/catalog/refresh`) |
   | Експорт SalesDrive | Settings → Dilovod або окрема сторінка експорту |
   | Статистика товарів | Dashboard → `catalogOpsLookup.getStats()` |
   | Inline edit weight/barcode/order | Products 2.0 drawer |
   | Тестові кнопки Dilovod | Settings Dilovod (dev-only) |

2. **DilovodCacheManager** — прибрати рядок «Товари» / goods cache (або перейменувати в «Ops snapshot» без проекції).
3. **Sidebar** — прибрати `/product-sets`, виправити Dashboard link (`/settings/product-sets` → мертвий URL).

**Критерій:** одна сторінка «Товари» (`/products`), без legacy cache UI.

---

### Фаза 5 — Cleanup backend (2–3 дні)

**Мета:** видалити мертвий код.

Видалити:

- `projectToProductsCache`, `projectGood`
- `DilovodGoodsCacheManager` (або спростити до stats-only)
- `DilovodSyncManager`: `syncProductsToDatabase`, `getProducts`, `getSyncStats`, `cleanupOldProducts` + wrappers у `DilovodService`
- `routes/goods-cache.ts` (якщо не потрібен)
- коментарі «dual-write → products» у schema

**Залишити `/api/products`** як thin read-only facade (batch/search by sku) **або** deprecate з redirect на `/api/catalog/ops/batch`.

---

### Фаза 6 — Drop `products` table (1 день + міграція)

**Мета:** фізично прибрати таблицю.

1. Prisma migration: `DROP TABLE products`
2. Видалити `model Product` з schema
3. Прибрати `CatalogOpsLookup.hydrate` lookup `cacheIdBySku` з `products`
4. Оновити коментарі в `catalog_goods` (прибрати «дзеркало products»)

**Критерій:** `grep prisma.product` → 0 результатів.

---

## Мапінг полів legacy → catalog

| Legacy `products` | `catalog_goods` / related |
|-------------------|---------------------------|
| `sku`, `name`, `weight` | `sku`, `name`, `weight` |
| `manualOrder` | `sortOrder` |
| `unitRatio` | `unitRatio` |
| `portionsPerBox` | `packageRatio` |
| `stockBalanceByStock` | `stockBalanceByStock` |
| `set` (JSON) | `catalog_good_components` (kits) |
| `additionalPrices` | `catalog_good_prices` |
| `barcode` | `catalog_good_barcodes` |
| `categoryName` / `isOutdated` | derived від `parentId` (папка/архів) |
| `costPerItem` | `catalog_good_prices` (retail type) |
| `dilovodId` | `id` |
| `dilovodDataHash` | **не потрібен** (hash на рівні catalog sync) |
| numeric `id` | **`catalog_goods.id`** (string) |

---

## Ризики і як їх зняти

| Ризик | Мітигація |
|-------|-----------|
| Perf order assembly (`expandService`) | `CatalogOpsCache` з тим самим TTL 120s |
| Зламані PUT з numeric id | Фаза 3 backward compat на 1 реліз |
| SalesDrive export через `/api/products` | Перенести на `productExportHelper` + `catalogOpsLookup` (вже майже так) |
| Cron «sync products» хтось чекає | Перейменувати job + повідомлення в SyncHistory |
| Regression на складі | Smoke: movement, returns, write-off, release sets |

---

## Рекомендований порядок PR (маленькі, reviewable)

1. `CatalogOpsCache` + migrate `expandService`
2. Remove dual-write in stock methods
3. Remove `projectGood` from PUT handlers
4. API `goodId` + client warehouse modules
5. API `goodId` + order assembly
6. Deprecate `/product-sets` UI
7. Remove `projectToProductsCache` + cron cleanup
8. Drop `products` table

**Орієнтовно:** 2–3 тижні при поетапних PR, або 1 інтенсивний тиждень якщо warehouse + orders в одному спринті.

---

## Quick wins (можна зробити вже зараз)

1. Видалити **мертвий** `DilovodSyncManager.syncProductsToDatabase` (+ `getProducts`/`getSyncStats`/`cleanupOldProducts` якщо ніде не викликаються з UI).
2. Перейменувати cron job і SyncHistory запис — «Проекція products» → «Оновлення ops-кешу каталогу».
3. Прибрати рядок «Товари» з `DilovodCacheManager` або позначити deprecated.
4. Виправити Dashboard link `/settings/product-sets` → `/product-sets` або прибрати.

---

## Ключові файли

| Область | Файли |
|---------|-------|
| Ops lookup | `server/modules/Products/CatalogOpsLookup.ts` |
| Legacy cache | `server/modules/Products/ProductOpsCache.ts` |
| Products API | `server/routes/products.ts` |
| Catalog API | `server/modules/Products/ProductsController.ts`, `server/routes/catalog.ts` |
| Sync / projection | `server/services/dilovod/DilovodService.ts`, `DilovodGoodsCacheManager.ts`, `DilovodSyncManager.ts` |
| Expand (order assembly) | `server/services/expandService.ts` |
| Legacy UI | `client/pages/SettingsProductSets.tsx` |
| Cache UI | `client/components/DilovodCacheManager.tsx` |
| Schema | `prisma/schema.prisma` (`Product`, `CatalogGood`) |
