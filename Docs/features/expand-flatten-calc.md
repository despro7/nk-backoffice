# Розгортання наборів: `flatten`, `calc` і операційний кеш

Як комплектація замовлення збирає склад наборів без N+1 запитів у каталог.

## Мета

- Швидко відкривати `OrderView` (розгортання наборів не в секундах).
- Коректно показувати **динамічні моноліти**: комплект із залишком `> 0` лишається рядком набору, а не розкладається на порції.
- Не розгортати рецептуру звичайних страв (сіль, картопля) — лише вкладені **комплекти**.

## Потік

1. Клієнт: `POST /api/expand/flatten` з SKU рядків замовлення (`client/lib/orderAssemblyUtils.ts`).
2. Сервер: `ExpandService.flattenBatch` читає `productOpsCache` (не live-JOIN усіх BOM).
3. Відповідь: `products[sku|dilovodId]` + `calc: { sumPortionsOne, weightKgOne }`.
4. Клієнт сіє спільний кеш (`client/lib/productLookupCache.ts`) для чек-листа й `GET /api/products/:sku` більше не потрібен на прогрітому шляху.

## `ProductOpsCache` (`server/modules/Products/ProductOpsCache.ts`)

TTL **120 с**, один reload на процес (спільний `inflight`).

Завантаження:

1. Усі рядки `products` (ops-поля: вага, `unitRatio`, barcode, JSON `set` як fallback).
2. Паралельно:
   - `catalog_goods.stockBalanceByStock` по `dilovodId` товарів;
   - комплекти (`accPolicyId = CATALOG_ACC_POLICY_KIT`) з `catalog_good_components`.

Накладання: залишок і `set` комплектів — з каталогу (актуальні). Рецептура non-kit у `set` не потрапляє.

Інвалідація (`productOpsCache.invalidate()`):

- `CatalogOpsLookup.applyStockBalances`
- `CatalogOpsLookup.deductSmallStock`
- `CatalogOpsLookup.projectToProductsCache`

Лог: `ProductOpsCache: products=…, kits=…, keys=…, time=…ms`. Далі `flattenBatch … time=` має бути мілісекунди, поки знімок живий.

## `GET /api/products/:sku`

Спочатку знімок (`productOpsCache.get`), якщо промах — `catalogOpsLookup.getBySku`. Lookup за SKU **або** Dilovod id.

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
- Лог: перше відкриття після TTL — `ProductOpsCache`; наступні — `flattenBatch time=0…tens ms`.
