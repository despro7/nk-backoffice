# Dilovod Service - Модульная архитектура

## Обзор

Сервис для работы с Dilovod API разделен на логические модули для улучшения читаемости, тестируемости и поддержки кода.

## Структура модулей

```
dilovod/
├── index.ts                    # Главный экспорт всех модулей
├── DilovodService.ts          # Основной класс-координатор
├── DilovodApiClient.ts        # Клиент для работы с Dilovod API
├── DilovodDataProcessor.ts    # Обработка и трансформация данных
├── DilovodSyncManager.ts      # Управление синхронизацией с БД
├── DilovodCacheManager.ts     # Управление кешем SKU товаров
├── DilovodTypes.ts            # Типы и интерфейсы
├── DilovodUtils.ts            # Утилиты и хелперы
└── README.md                  # Эта документация
```

## Описание модулей

### 1. DilovodTypes.ts
Содержит все типы и интерфейсы для работы с Dilovod API:
- `DilovodProduct` - структура товара
- `DilovodSyncResult` - результат синхронизации
- `DilovodApiRequest` - запрос к API
- И другие типы...

### 2. DilovodUtils.ts
Утилиты и хелперы:
- `getPriceTypeNameById()` - получение названия типа цены
- `formatDateForDilovod()` - форматирование даты для API
- `validateDilovodConfig()` - валидация конфигурации
- `handleDilovodApiError()` - обработка ошибок API
- `logWithTimestamp()` - логирование с временными метками

### 3. DilovodApiClient.ts
Клиент для работы с Dilovod API:
- `makeRequest()` - основной метод для запросов
- `getGoodsWithPrices()` - получение товаров с ценами
- `getGoodsFromCatalog()` - получение товаров из каталога
- `getObject()` - получение детальной информации об объекте
- `testConnection()` - тест подключения

### 4. DilovodCacheManager.ts
Управление кешем SKU товаров:
- `getInStockSkusFromWordPress()` - получение SKU из WordPress
- `getCachedSkus()` - получение кешированных SKU
- `clearSkuCache()` - очистка кеша
- `getCacheStats()` - статистика кеша

### 5. DilovodDataProcessor.ts
Обработка и трансформация данных:
- `processGoodsWithSets()` - обработка товаров с комплектами
- `createIdToSkuMapping()` - создание маппинга ID -> SKU
- `buildFinalProducts()` - формирование финальных товаров
- `processStockBalance()` - обработка остатков

### 6. DilovodSyncManager.ts
Управление синхронизацией с базой данных:
- `syncProductsToDatabase()` - синхронизация товаров с БД
- `getSyncStats()` - статистика синхронизации
- `getProducts()` - получение товаров по фильтрам
- `cleanupOldProducts()` - очистка старых товаров

### 7. DilovodService.ts
Основной класс-координатор, который использует все модули:
- `syncProductsWithDilovod()` - полная синхронизация
- `getGoodsInfoWithSetsOptimized()` - получение товаров с комплектами
- `testSetsOnly()` - тест получения комплектов
- Управление всеми аспектами работы с Dilovod

## Использование

### Базовое использование
```typescript
import { DilovodService } from '../services/dilovod';

const dilovodService = new DilovodService();

// Синхронизация товаров
const result = await dilovodService.syncProductsWithDilovod();

// Тест комплектов
const testResult = await dilovodService.testSetsOnly();

// Получение статистики
const stats = await dilovodService.getSyncStats();
```

### Использование отдельных модулей
```typescript
import { DilovodApiClient, DilovodCacheManager } from '../services/dilovod';

const apiClient = new DilovodApiClient();
const cacheManager = new DilovodCacheManager();

// Тест подключения
const isConnected = await apiClient.testConnection();

// Очистка кеша
await cacheManager.clearSkuCache();
```

## Конфигурация

Конфигурация по умолчанию находится в `DilovodUtils.ts`:

```typescript
export const DEFAULT_DILOVOD_CONFIG: DilovodConfig = {
  apiUrl: process.env.DILOVOD_API_URL || '',
  apiKey: process.env.DILOVOD_API_KEY || '',
  setParentId: "1100300000001315", // ID группы-комплектов
  mainPriceType: "1101300000001001", // Роздріб (Інтернет-магазин)
  categoriesMap: {
    "Перші страви": 1,
    "Другі страви": 2,
    "Набори продукції": 3
  }
};
```

## Преимущества новой архитектуры

1. **Модульность** - каждый файл отвечает за одну область
2. **Тестируемость** - легче писать unit-тесты для каждого модуля
3. **Читаемость** - проще найти нужную функциональность
4. **Переиспользование** - модули можно использовать независимо
5. **Поддержка** - легче вносить изменения и исправления
6. **Разделение ответственности** - каждый класс имеет четкую роль

## Миграция с старого кода

Старый `dilovodService.ts` заменен на новую модульную структуру. Все существующие вызовы должны работать без изменений, так как основной класс `DilovodService` сохраняет тот же интерфейс.

## Логирование

Все модули используют единую систему логирования через `logWithTimestamp()`:
- Временные метки для каждого сообщения
- Структурированные логи для отладки
- Единый формат для всех модулей

## Обработка ошибок

Централизованная обработка ошибок через `handleDilovodApiError()`:
- HTTP ошибки с детальным описанием
- Ошибки сети
- Валидация конфигурации
- Логирование всех ошибок
