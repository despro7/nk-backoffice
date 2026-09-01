# Dilovod Service — модульна архітектура

## Огляд

Сервіс для роботи з Dilovod API розділений на логічні модулі для покращення читабельності, тестованості та підтримки коду.

## Структура модулів

```
dilovod/
├── index.ts                    # Головний експорт усіх модулів
├── DilovodService.ts          # Основний клас-координатор
├── DilovodApiClient.ts        # Клієнт для роботи з Dilovod API
├── DilovodMetadataService.ts  # listMetadata / getMetadata, форма регістрів
├── DilovodDataProcessor.ts    # Обробка та трансформація даних
├── DilovodSyncManager.ts      # Керування синхронізацією з БД
├── DilovodCacheManager.ts     # Керування кешем SKU товарів
├── DilovodTypes.ts            # Типи та інтерфейси
├── DilovodUtils.ts            # Утиліти та хелпери
└── README.md                  # Ця документація
```

## Опис модулів

### 1. DilovodTypes.ts
Містить усі типи та інтерфейси для роботи з Dilovod API:
- `DilovodProduct` — структура товару
- `DilovodSyncResult` — результат синхронізації
- `DilovodApiRequest` — запит до API
- та інші типи...

### 2. DilovodUtils.ts
Утиліти та хелпери:
- `getPriceTypeNameById()` — отримання назви типу ціни
- `formatDateForDilovod()` — форматування дати для API
- `validateDilovodConfig()` — валідація конфігурації
- `handleDilovodApiError()` — обробка помилок API
- `logWithTimestamp()` — логування з часовими мітками

### 3. DilovodApiClient.ts
Клієнт для роботи з Dilovod API:
- `makeRequest()` — основний метод для запитів
- `listMetadata()` / `getMetadataByName()` / `getMetadataById()` — метадані об'єктів API
- `getGoodsWithPrices()` — отримання товарів з цінами
- `getGoodsFromCatalog()` — отримання товарів з каталогу
- `getBarCodesByObjectIds()` — отримання штрих-кодів з регістру barCodes
- `getObject()` — отримання детальної інформації про об'єкт
- `testConnection()` — тест підключення

### 4. DilovodCacheManager.ts
SKU для legacy sync / goods cache:
- `fetchFreshSkusFromCatalog()` — активні SKU з `catalog_goods` (піддерево «Готова продукція»)
- `getCacheStats()` — кількість SKU з каталогу
- `forceRefreshCache()` — повторне читання SKU з каталогу

### 5. DilovodDataProcessor.ts
Обробка та трансформація даних:
- `processGoodsWithSets()` — обробка товарів з комплектами
- `createIdToSkuMapping()` — створення мапінгу ID -> SKU
- `buildFinalProducts()` — формування фінальних товарів
- `processStockBalance()` — обробка залишків

### 6. DilovodSyncManager.ts
Керування синхронізацією з базою даних:
- `syncProductsToDatabase()` — синхронізація товарів з БД (хеш включає `barcode`)
- `getSyncStats()` — статистика синхронізації
- `getProducts()` — отримання товарів за фільтрами
- `cleanupOldProducts()` — очищення старих товарів

### 7. DilovodService.ts
Основний клас-координатор, який використовує всі модулі:
- `syncProductsWithDilovod()` — повна синхронізація
- `getGoodsInfoWithSetsOptimized()` — отримання товарів з комплектами + штрих-коди з `barCodes`
- `logSyncError()` — запис помилок sync у `meta_logs` (у т.ч. `missing_barcode`)
- `testSetsOnly()` — тест отримання комплектів
- керування всіма аспектами роботи з Dilovod

Документація з синхронізації ШК: `Docs/features/dilovod-product-barcode-sync.md`.

### DilovodMetadataService.ts

Опис схеми Dilovod без хардкоду полів регістрів:

- `getList({ q, forceRefresh })` — `listMetadata`, фільтр за ім'ям / presentation
- `getObject(objectName)` — `getMetadata`; коротке ім'я (`goods`) резолвиться в регістр, не в каталог
- `getRegisterShape(objectName)` — виміри / ресурси / атрибути
- `virtualBatFields(resourceName)` — `qtyStart` / `qtyReceipt` / `qtyExpense` / `qtyFinal`

Кеш 24 год: memory + `settings_base` (`dilovod.meta.*`). HTTP: `GET /api/dilovod/metadata`. Повна документація: `Docs/integrations/dilovod-metadata.md`.

## Використання

### Базове використання
```typescript
import { DilovodService } from '../services/dilovod';

const dilovodService = new DilovodService();

// Синхронізація товарів
const result = await dilovodService.syncProductsWithDilovod();

// Тест комплектів
const testResult = await dilovodService.testSetsOnly();

// Отримання статистики
const stats = await dilovodService.getSyncStats();
```

### Використання окремих модулів
```typescript
import { DilovodApiClient, DilovodCacheManager } from '../services/dilovod';

const apiClient = new DilovodApiClient();
const cacheManager = new DilovodCacheManager();

const isConnected = await apiClient.testConnection();
const skus = await cacheManager.fetchFreshSkusFromCatalog();
```

## Конфігурація

Конфігурація за замовчуванням знаходиться в `DilovodUtils.ts`:

```typescript
export const DEFAULT_DILOVOD_CONFIG: DilovodConfig = {
  apiUrl: process.env.DILOVOD_API_URL || '',
  apiKey: process.env.DILOVOD_API_KEY || '',
  mainPriceType: "1101300000001001", // Роздріб (Інтернет-магазин)
  categoriesMap: {
    "Перші страви": 1,
    "Другі страви": 2,
    "Набори продукції": 3
  }
};
```

## Переваги нової архітектури

1. **Модульність** — кожен файл відповідає за одну область
2. **Тестованість** — легше писати unit-тести для кожного модуля
3. **Читабельність** — простіше знайти потрібну функціональність
4. **Повторне використання** — модулі можна використовувати незалежно
5. **Підтримка** — легше вносити зміни та виправлення
6. **Розділення відповідальності** — кожен клас має чітку роль

## Міграція зі старого коду

Старий `dilovodService.ts` замінено на нову модульну структуру. Усі наявні виклики мають працювати без змін, оскільки основний клас `DilovodService` зберігає той самий інтерфейс.

## Логування

Усі модулі використовують єдину систему логування через `logWithTimestamp()`:
- часові мітки для кожного повідомлення
- структуровані логи для налагодження
- єдиний формат для всіх модулів

## Обробка помилок

Централізована обробка помилок через `handleDilovodApiError()`:
- HTTP-помилки з детальним описом
- помилки мережі
- валідація конфігурації
- логування всіх помилок

### Форматування помилок для NotificationBell

Дивіться `../../Docs/architecture/dilovod-error-formatting.md` для детальної документації за функціями:
- `cleanDilovodErrorMessageShort()` — коротка версія для UI
- `cleanDilovodErrorMessageFull()` — повна версія для логів

Ці функції видаляють HTML-теги та переформатовують помилки Dilovod для читабельності.

## Банківські виписки

Окремий модуль (не частина coordinator-потоку замовлень):

- `BankStatementImportService.ts` — парсинг Excel
- `BankStatementExportBuilder.ts` — `cashOut` / `cashIn`
- `BankStatementTemplateService.ts` — шаблони в `settings_base`

Документація фічі: `Docs/features/bank-statement-import.md`.
