# Розгортання наборів: `flatten`, `calc` і операційний кеш

Як комплектація замовлення збирає склад наборів без N+1 запитів у каталог.

## Мета

- Швидко відкривати `OrderView` (розгортання наборів не в секундах).
- Коректно показувати **динамічні моноліти**: комплект із залишком `> 0` лишається рядком набору, а не розкладається на порції.
- Не розгортати рецептуру звичайних страв (сіль, картопля) — лише вкладені **комплекти**.

## Потік

1. Клієнт: `POST /api/expand/flatten` з SKU рядків замовлення (`client/lib/orderAssemblyUtils.ts`).
2. Сервер: `ExpandService.flattenBatch` читає `catalogOpsCache` (не live-JOIN усіх BOM).
3. Відповідь: `products[sku|dilovodId]` + `calc: { sumPortionsOne, weightKgOne }`.
4. Клієнт сіє спільний кеш (`client/lib/productLookupCache.ts`) для чек-листа й `GET /api/products/:sku` більше не потрібен на прогрітому шляху.

## `CatalogOpsCache` (`server/modules/Products/CatalogOpsCache.ts`)

TTL **120 с**, один reload на процес (спільний `inflight`). Legacy-таблицю `products` **не** читає.

Завантаження: `catalogOpsLookup.listAllLeavesForOps()`, тобто всі листові `catalog_goods` з SKU (включно з архівом і смітником) + ціни, ШК, компоненти комплектів, батьківські папки. Форма значення = `catalogOpsLookup.toApiShape`. Індекс за SKU і Dilovod id (lowercase).

- `set` лише для облікової політики «комплект» (`catalog_good_components`); рецептура non-kit у `set` не потрапляє.
- Товари без SKU (сировина) у знімок не йдуть: промах добирає `catalogOpsLookup.getBySkus`.
- Архівні набори без компонентів у каталозі (склад жив лише в `products`) не розгортаються: свідомо прийнято 2026-11-20.
- `invalidate()` під час завантаження: знімок віддається запиту, але не кешується.

Попередник `ProductOpsCache` (рядки `products` + накладання з каталогу) лишився у коді без використання до видалення (`Docs/plans/legacy-products-removal.md`).

Інвалідація (`catalogOpsCache.invalidate()`):

- `CatalogOpsLookup.applyStockBalances`
- `CatalogOpsLookup.deductSmallStock`
- `CatalogOpsLookup.projectToProductsCache`

Лог: `CatalogOpsCache: goods=…, keys=…, time=…ms`. Далі `flattenBatch … time=` має бути мілісекунди, поки знімок живий.

## `GET /api/products/:sku`

Спочатку знімок (`catalogOpsCache.get`), якщо промах, `catalogOpsLookup.getBySku`. Lookup за SKU **або** Dilovod id.

## Клієнтський кеш

`productLookupCache`: ключі в lowercase (SKU і `dilovodId`). Ним користуються `orderAssemblyUtils` і `OrderChecklistItem` (склад вкладених наборів, бейдж «В наявності N компл.»), щоб не бити API на кожен рядок.

## Динамічний моноліт

У `expandProductRecursively`: якщо в товару є `set` і сума `stockBalanceByStock` `> 0` → `dynamicMonolithic`, рекурсія зупиняється. Залишок має бути з каталогу (через знімок), інакше набір помилково розкладається, хоча на ГП/МС він є.

Payload відвантаження: `Docs/features/order-assembly/dynamic-monolithic-order-payload.md`.

## `calc`

`flatten` додає агрегати для UI `displayRatio` у `OrderChecklistItem`. Клієнт `computeFlattenedComponent` бере `product.calc`, якщо він уже є.

## Перевірка

- Відкрити замовлення з комплектом на залишку → рядок набору + «В наявності», без інгредієнтів страв.
- Вкладений комплект без залишку → рекурсивне розгортання до страв, не до spec BOM.
- Лог: перше відкриття після TTL: `CatalogOpsCache`; наступні: `flattenBatch time=0…tens ms`.
