# Синхронізація штрих-кодів товарів з Dilovod

## Огляд

Під час синхронізації товарів з Dilovod штрих-коди (`Product.barcode`) підтягуються **окремим** запитом до регістру `barCodes`. Вони не приходять разом із каталогом/цінами.

`barcode` входить до `dilovodDataHash`: зміна ШК в Dilovod призводить до оновлення запису в БД. Dilovod — джерело правди для цього поля (ручні правки через `PUT /api/products/:id/barcode` перезапишуться наступним sync).

## Потік синхронізації

1. `DilovodService.syncProductsWithDilovod()` збирає SKU (WordPress + whitelist при full).
2. `getGoodsInfoWithSetsOptimized()`:
   - `getGoodsWithPrices` + `getGoodsFromCatalog`
   - `processGoodsWithSets` → список `DilovodProduct`
   - **`getBarCodesByObjectIds(dilovodIds)`** → мапінг `object → code`
   - товари без активного ШК отримують `barcode: null` і логуються в `meta_logs`
3. `DilovodSyncManager.syncProductsToDatabase()` порівнює SHA-256 хеш і робить `create` / `update` / skip.

```
Dilovod API
  ├─ goodsPrices / catalogs.goods  → name, sku, price, set, …
  └─ barCodes (sliceLast)          → code по object (dilovodId)
                ↓
         DilovodProduct.barcode
                ↓
     calculateDataHash(+ barcode) → products.barcode + dilovodDataHash
```

## Запит barCodes

`DilovodApiClient.getBarCodesByObjectIds(objectIds, signal?)`:

- `from`: `{ type: "sliceLast", register: "barCodes" }`
- поля: `id`, `object`, `code`, `activity`
- фільтр: `object IL […dilovodIds…]`
- чанки по 50 ID

Приклад відповіді:

```json
[
  {
    "id": "1103500000001172",
    "object": "1100300000001723",
    "object__pr": "Картопля тушкована, 300г",
    "code": "2200000000392",
    "activity": "1"
  }
]
```

### Правила мапінгу (`mapBarCodesByObjectId`)

| `activity` | Поведінка |
|---|---|
| `"1"` | беремо `code` (перший активний на `object`) |
| `"0"` | ігноруємо |
| товар відсутній у відповіді | немає активного ШК → `barcode = null` |

## Хеш і оновлення БД

У `calculateDataHash` входять (серед іншого): `name`, `costPerItem`, `currency`, категорія, `set`, `portionsPerBox`, `additionalPrices`, `dilovodId`, **`barcode`**.

Не входять (локальні): `weight`, `manualOrder`, `unitRatio`.

- Якщо запит barCodes **впав** → `barcode` лишається `undefined`, поле в БД **не** чіпається і не впливає на хеш.
- Якщо запит **успішний**, а ШК немає → `barcode: null` (очищення) + сповіщення.

⚠️ Після деплою **перший sync** оновить більшість товарів через зміну формули хеша.

## Сповіщення (NotificationBell)

Для кожного товару без активного ШК:

- `category`: `product_sync`
- `title`: `Товар без штрих-коду`
- `status`: `error`
- `errorType`: `missing_barcode`
- повідомлення з назвою і SKU

Запис іде через `DilovodService.logSyncError()` у `meta_logs` — той самий канал, що й «Товар без ціни». Sync **не зупиняється**.

## Детальний звіт (MetaLogs → «Інші помилки»)

`useMetaLogs` включає категорію `product_sync` (і заголовки на кшталт «Товар без…» / «штрих-код») у вкладку **Інші помилки**.

`OtherMetaLogTable` показує:

| Колонка | Зміст |
|---|---|
| Дата | relative + tooltip з точною датою |
| Помилка | title (+ короткий raw message) |
| Товар / документ | `productName` або назва документа (автофінал) |
| Артикул | SKU |
| Ініціатор | system / cron / user |
| Спроб | злиті спроби з tooltip |
| Дії | «Вирішено», «Log» |

Парсинг бере `data.sku`, `data.productData.name` і fallback з тексту `(SKU: …)`.

## Ключові файли

| Файл | Роль |
|---|---|
| `server/services/dilovod/DilovodApiClient.ts` | `getBarCodesByObjectIds` |
| `server/services/dilovod/DilovodUtils.ts` | `isDilovodBarcodeActive`, `mapBarCodesByObjectId` |
| `server/services/dilovod/DilovodTypes.ts` | `DilovodProduct.barcode`, `DilovodBarCodeResponse` |
| `server/services/dilovod/DilovodService.ts` | збагачення ШК, `logSyncError(missing_barcode)` |
| `server/services/dilovod/DilovodSyncManager.ts` | хеш + `prepareProductData.barcode` |
| `client/components/NotificationBell.tsx` | title «Товар без штрих-коду» |
| `client/pages/MetaLogs/hooks/useMetaLogs.ts` | фільтр `product_sync` → other |
| `client/pages/MetaLogs/components/OtherMetaLogTable.tsx` | UI звіту |

## Пов’язане

- Ручне встановлення ШК: `PUT /api/products/:id/barcode` (перезаписується sync).
- Модульний огляд Dilovod: `server/services/dilovod/README.md`.
