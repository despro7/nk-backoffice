# Система управления складскими перемещениями

## Обзор

Система предназначена для учета перемещения товаров между складами с полной историей изменения остатков. Позволяет создавать документы перемещения, отслеживать статусы и строить аналитику по движению товаров.

Система включает:
- Создание и редактирование документов перемещения
- Отслеживание остатков товаров по складам
- Интеграцию с внешней системой Dilovod
- Полную историю всех операций с товарами
- Управление черновиками документов

## Структура базы данных

### Таблица `warehouse_movement`

Основная таблица для хранения документов перемещения товаров между складами:

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INT | Уникальный идентификатор (автоинкремент) |
| `draftCreatedAt` | DATETIME | Дата создания черновика |
| `draftLastEditedAt` | DATETIME | Дата последнего редактирования (обновляется автоматически) |
| `sentToDilovodAt` | DATETIME | Дата отправки в Dilovod |
| `internalDocNumber` | VARCHAR(255) | Внутренний номер документа (уникальный, формат: 00001, 00002...) |
| `dilovodDocNumber` | VARCHAR(255) | Номер документа в системе Dilovod |
| `items` | JSON | Массив товаров для перемещения |
| `deviations` | JSON | Массив отклонений (недостатки/излишки) |
| `status` | VARCHAR(255) | Статус документа: `draft`, `sent`, `confirmed`, `cancelled` |
| `sourceWarehouse` | VARCHAR(255) | Исходный склад (название или ID) |
| `destinationWarehouse` | VARCHAR(255) | Целевой склад (название или ID) |
| `notes` | TEXT | Примечания к документу |
| `createdBy` | INT | ID пользователя, создавшего документ |
| `createdAt` | DATETIME | Дата создания записи |
| `updatedAt` | DATETIME | Дата последнего обновления |

**Индексы:**
- `status`
- `draftCreatedAt`
- `sentToDilovodAt`
- `sourceWarehouse`
- `destinationWarehouse`
- `createdBy`

### Таблица `stock_movement_history`

Таблица для хранения полной истории движения остатков по всем складам:

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INT | Уникальный идентификатор (автоинкремент) |
| `productSku` | VARCHAR(255) | SKU товара |
| `warehouse` | VARCHAR(255) | Название или ID склада |
| `movementType` | VARCHAR(255) | Тип движения: `in`, `out`, `transfer_in`, `transfer_out`, `adjustment` |
| `quantity` | FLOAT | Количество товара |
| `quantityType` | VARCHAR(255) | Тип количества: `box`, `portion` |
| `batchNumber` | VARCHAR(255) | Номер партии товара |
| `referenceId` | VARCHAR(255) | ID связанного документа |
| `referenceType` | VARCHAR(255) | Тип документа: `order`, `warehouse_movement`, `adjustment` |
| `previousBalance` | FLOAT | Остаток до операции |
| `newBalance` | FLOAT | Остаток после операции |
| `movementDate` | DATETIME | Дата операции |
| `notes` | TEXT | Примечания к операции |
| `createdBy` | INT | ID пользователя, выполнившего операцию |

**Индексы:**
- `productSku`
- `warehouse`
- `movementType`
- `movementDate`
- `referenceId`
- `referenceType`

## API Endpoints

### Основные операции с документами перемещения

#### Получение документов
```http
GET /api/warehouse
```
**Параметры запроса:**
- `status` (string) - фильтр по статусу (`draft`, `sent`, `confirmed`, `cancelled`)
- `warehouse` (string) - фильтр по складу (поиск в исходном или целевом складе)
- `page` (number, default: 1) - номер страницы
- `limit` (number, default: 20) - количество записей на странице

**Ответ:**
```json
{
  "movements": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

#### Получение черновиков пользователя
```http
GET /api/warehouse/drafts
```
**Ответ:**
```json
{
  "drafts": [...]
}
```

#### Получение документа по ID
```http
GET /api/warehouse/:id
```
**Ответ:** Объект документа перемещения или ошибка 404

#### Создание нового документа
```http
POST /api/warehouse
```
**Тело запроса:**
```json
{
  "items": [
    {
      "sku": "PRODUCT-001",
      "boxQuantity": 5.0,
      "portionQuantity": 120,
      "batchNumber": "BATCH-001"
    }
  ],
  "deviations": [],
  "sourceWarehouse": "Основной склад",
  "destinationWarehouse": "Малый склад",
  "notes": "Перемещение для продажи"
}
```

#### Обновление документа
```http
PUT /api/warehouse/:id
```
**Тело запроса:**
```json
{
  "items": [...],
  "deviations": [...],
  "notes": "Обновленные примечания"
}
```

#### Отправка в Dilovod
```http
POST /api/warehouse/:id/send
```
**Действия:**
- Изменяет статус документа на `sent`
- Устанавливает `sentToDilovodAt`
- **Обновляет остатки товаров** (если они еще не были обновлены)
- Создает записи в истории движения

#### Удаление черновика
```http
DELETE /api/warehouse/:id
```
**Действия:**
- Проверяет права доступа (только автор)
- Проверяет статус документа (только `draft`)
- **Отменяет перемещение остатков** (возвращает товары обратно)
- Удаляет записи из истории движения
- Удаляет документ перемещения

### Операции с товарами

#### Получение товаров для перемещения
```http
GET /api/warehouse/products-for-movement
```
Возвращает товары с остатками на основном складе, готовые для перемещения.

**Ответ:**
```json
{
  "products": [
    {
      "id": "PRODUCT-001",
      "sku": "PRODUCT-001",
      "name": "Название товара",
      "balance": "100 / 20",
      "details": {
        "boxes": 0,
        "portions": 0,
        "forecast": 125,
        "batchNumber": ""
      },
      "stockData": {
        "mainStock": 100,
        "kyivStock": 0,
        "smallStock": 20
      }
    }
  ],
  "total": 1
}
```

### Операции с историей остатков

#### Получение истории движения
```http
GET /api/warehouse/stock/history
```
**Параметры запроса:**
- `sku` (string) - фильтр по SKU товара
- `warehouse` (string) - фильтр по складу
- `movementType` (string) - тип движения
- `startDate` (string) - начальная дата (ISO 8601)
- `endDate` (string) - конечная дата (ISO 8601)
- `page` (number, default: 1)
- `limit` (number, default: 50)

#### Получение текущих остатков
```http
GET /api/warehouse/stock/current
```
**Параметры запроса:**
- `warehouse` (string) - фильтр по складу

**Ответ:** Массив последних записей остатков по каждому товару и складу

## Структура данных

### Формат поля `items` (JSON)

Массив объектов товаров для перемещения:

```json
[
  {
    "sku": "PRODUCT-001",
    "boxQuantity": 5.0,
    "portionQuantity": 120,
    "batchNumber": "BATCH-001"
  },
  {
    "sku": "PRODUCT-002",
    "boxQuantity": 3.5,
    "portionQuantity": 84,
    "batchNumber": "BATCH-002"
  }
]
```

### Формат поля `deviations` (JSON)

Массив отклонений при перемещении (излишки/недостатки):

```json
[
  {
    "sku": "PRODUCT-001",
    "batchNumber": "BATCH-001",
    "deviation": -2.5  // отрицательное значение = недостаток, положительное = излишек
  }
]
```

## Основные возможности

### 1. Создание и управление документами перемещения

#### Создание черновика
- Выбор товаров с остатками на основном складе
- Указание количества в ящиках и порциях
- Добавление номеров партий
- Указание исходного и целевого складов
- Добавление примечаний
- **Автоматическое обновление остатков товаров при создании**

#### Редактирование черновиков
- Только автор может редактировать свой черновик
- Черновик должен иметь статус `draft`
- Автоматическое обновление `draftLastEditedAt`
- **Остатки товаров не изменяются при редактировании** (только при создании или отправке)

#### Удаление черновиков
- Только автор может удалить свой черновик
- Черновик должен иметь статус `draft`
- **Автоматическая отмена перемещения остатков** при удалении
- Удаление всех связанных записей из истории движения

#### Управление статусами
- **draft** - черновик (можно редактировать)
- **sent** - отправлен в Dilovod (нельзя редактировать)
- **confirmed** - подтвержден в Dilovod
- **cancelled** - отменен

### 2. Отслеживание остатков товаров

#### История движения
- Автоматическое создание записей при каждом перемещении
- Отслеживание предыдущего и нового остатка
- Связь с документами перемещения
- Поддержка различных типов движения

#### Типы движения остатков
- **transfer_in** - приход при перемещении
- **transfer_out** - расход при перемещении
- **in** - приход от поставщика
- **out** - расход на заказы
- **adjustment** - корректировка остатков

#### Текущие остатки
- Получение последних остатков по товарам и складам
- Группировка по SKU и складу
- Поддержка различных типов количества (ящики/порции)

#### Управление остатками
- **Ориентация на порции** - вся логика работает с порциями
- **Обновление при создании документа** - остатки изменяются в порциях
- **Откат при удалении** - товары возвращаются на исходные склады в порциях
- **Проверка достаточности** - система проверяет остатки в порциях
- **Транзакционная безопасность** - при ошибке обновления документ удаляется автоматически

#### Формат отображения остатков
- **balance**: `"4432 / 96"` означает `4432 порции / 96 порций`
- **Основной склад**: показывает общее количество порций
- **Малый склад**: показывает количество порций не в полных ящиках

#### Логика работы с порциями
- **Хранение**: Остатки хранятся в порциях для точности
- **Отображение**: Показывается как "ящики / порции" для удобства
- **Перемещение**: Всегда работает с фактическим количеством порций
- **История**: Все записи сохраняются в порциях

### 3. Интеграция с Dilovod

#### Отправка документов
- Изменение статуса на `sent`
- Установка даты отправки `sentToDilovodAt`
- Подготовка для интеграции с внешней системой

#### Синхронизация
- Хранение номера документа Dilovod (`dilovodDocNumber`)
- Отслеживание статуса синхронизации
- Возможность подтверждения документов

## Использование

### Работа с документами перемещения

#### Создание нового документа (Frontend)

```typescript
import { useWarehouse } from '@/hooks/useWarehouse';

const { createMovement } = useWarehouse();

// Создание документа
const newMovement = await createMovement({
  items: [
    {
      sku: 'PRODUCT-001',
      boxQuantity: 5.0,
      portionQuantity: 120,
      batchNumber: 'BATCH-001'
    }
  ],
  sourceWarehouse: 'Основной склад',
  destinationWarehouse: 'Малый склад',
  notes: 'Перемещение для розничной продажи'
});

console.log('Создан документ:', newMovement.id);
```

#### Получение черновиков пользователя

```typescript
const { getDrafts } = useWarehouse();

const drafts = await getDrafts();
console.log('Черновики пользователя:', drafts);
```

#### Обновление черновика

```typescript
const { updateDraft } = useWarehouse();

const updatedDraft = await updateDraft(draftId, {
  items: [...], // обновленные товары
  deviations: [...], // отклонения
  notes: 'Обновленные примечания'
});
```

#### Отправка в Dilovod

```typescript
const { sendToDilovod } = useWarehouse();

const sentMovement = await sendToDilovod(movementId);
console.log('Документ отправлен в Dilovod');
```

### Работа с товарами

#### Получение товаров для перемещения

```typescript
const { getProductsForMovement } = useWarehouse();

const products = await getProductsForMovement();
console.log('Товары с остатками:', products);
```

### Работа с историей остатков

#### Получение истории движения

```typescript
const { getStockHistory } = useWarehouse();

const history = await getStockHistory({
  sku: 'PRODUCT-001',
  warehouse: 'Основной склад',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
  page: 1,
  limit: 50
});

console.log('История движения:', history);
```

#### Получение текущих остатков

```typescript
const { getCurrentStock } = useWarehouse();

const currentStock = await getCurrentStock('Основной склад');
console.log('Текущие остатки:', currentStock);
```

### Backend использование

#### Прямой вызов API

```typescript
// Создание документа через API
const response = await fetch('/api/warehouse', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  credentials: 'include',
  body: JSON.stringify({
    items: [...],
    sourceWarehouse: 'Основной склад',
    destinationWarehouse: 'Малый склад',
    notes: 'Перемещение товаров'
  })
});

const movement = await response.json();
```

#### Получение документов с фильтрацией

```typescript
const response = await fetch('/api/warehouse?status=draft&page=1&limit=20', {
  credentials: 'include'
});

const { movements, pagination } = await response.json();
```

## Преимущества системы

1. **Полная прозрачность** - всегда видно текущие остатки на всех складах
2. **Историчность** - полная история всех операций для аналитики
3. **Гибкость** - поддержка различных типов движения и складов
4. **Интеграция** - готовность к интеграции с внешними системами
5. **Масштабируемость** - легко добавлять новые склады и типы операций

## Дальнейшее развитие

1. **Аналитика** - графики изменения остатков, отчеты по движению
2. **Уведомления** - оповещения о критически низких остатках
3. **Планирование** - планирование будущих перемещений
4. **Автоматизация** - автоматическое создание документов на основе заказов
5. **Мобильное приложение** - для работы на складе

## Тестирование

### Автоматизированное тестирование

Для тестирования системы используйте файл `server/test-warehouse-api.ts`:

```bash
# Запуск теста
npx ts-node server/test-warehouse-api.ts
```

**Что тестируется:**
- Создание документов перемещения
- Создание записей в истории движения остатков
- Получение текущих остатков
- Получение истории движения по SKU
- Обновление статуса документа
- Получение всех документов

### Ручное тестирование

#### Проверка API endpoints

```bash
# Получение всех документов
curl -X GET "http://localhost:3000/api/warehouse" \
  -H "Cookie: session=your-session-cookie"

# Создание документа
curl -X POST "http://localhost:3000/api/warehouse" \
  -H "Content-Type: application/json" \
  -H "Cookie: session=your-session-cookie" \
  -d '{
    "items": [
      {
        "sku": "TEST-001",
        "boxQuantity": 2.0,
        "portionQuantity": 48,
        "batchNumber": "BATCH-001"
      }
    ],
    "sourceWarehouse": "Основной склад",
    "destinationWarehouse": "Малый склад",
    "notes": "Тестовое перемещение"
  }'

# Получение товаров для перемещения
curl -X GET "http://localhost:3000/api/warehouse/products-for-movement" \
  -H "Cookie: session=your-session-cookie"
```

#### Проверка работы с товарами

```bash
# Получение истории движения остатков
curl -X GET "http://localhost:3000/api/warehouse/stock/history?sku=PRODUCT-001" \
  -H "Cookie: session=your-session-cookie"

# Получение текущих остатков
curl -X GET "http://localhost:3000/api/warehouse/stock/current" \
  -H "Cookie: session=your-session-cookie"
```

### Frontend тестирование

Используйте страницу Warehouse Movement (`/warehouse`) для тестирования:

1. **Создание черновика:**
   - Выберите товары из списка
   - Укажите количество
   - Сохраните черновик

2. **Редактирование:**
   - Откройте существующий черновик
   - Измените товары или количество
   - Сохраните изменения

3. **Отправка в Dilovod:**
   - Выберите готовый документ
   - Нажмите "Отправить в Dilovod"
   - **Остатки товаров будут обновлены автоматически**

4. **Удаление черновика:**
   - Выберите черновик
   - Нажмите "Удалить"
   - **Остатки товаров будут возвращены обратно**

### Мониторинг и отладка

#### Логирование

Система логирует все операции:
- Создание документов: `🏪 [Warehouse] POST / - создание нового документа...`
- Обновление черновиков: `🏪 [Warehouse] PUT /:id - обновление черновика...`
- Ошибки: `🚨 [Warehouse] Error fetching products for movement:`

#### Проверка состояния

```sql
-- Проверка документов перемещения
SELECT id, internalDocNumber, status, sourceWarehouse, destinationWarehouse
FROM warehouse_movement
ORDER BY createdAt DESC;

-- Проверка истории движения
SELECT sku, warehouse, movementType, quantity, previousBalance, newBalance
FROM stock_movement_history
ORDER BY movementDate DESC;
```

## Известные проблемы и решения

### Ошибка в API коде

**Проблема:** В `server/routes/warehouse.ts` на строке 241 используется неопределенная переменная `internalDocNumber`.

**Решение:** Переменная должна генерироваться автоматически:

```typescript
// Вместо использования external переменной
const totalCount = await prisma.warehouseMovement.count();
const nextDocNumber = (totalCount + 1).toString().padStart(5, '0');

// Использовать nextDocNumber
internalDocNumber: nextDocNumber,
```

### Склады и их идентификаторы

**Текущая структура:**
- Основной склад: ID "1"
- Киевский склад: ID "2"
- Малый склад: ID "3"

**Рекомендация:** Использовать константы для складов вместо hardcoded значений.

## Синхронизация с Dilovod

### Потенциальные конфликты с внутренней логикой перемещения

#### 1. **Гонка состояний (Race Conditions)**
**Проблема:** Документ перемещения создается и обновляет остатки, но в этот момент происходит синхронизация с Dilovod и перезаписывает остатки.

**Решение:** Внедрить механизм блокировок:
```typescript
// В функции updateProductStock добавить проверку блокировки
async function updateProductStock(sku: string, sourceWarehouse: string, destinationWarehouse: string, quantity: number) {
  // Проверяем, не заблокирован ли товар для синхронизации
  const lock = await getStockLock(sku);
  if (lock) {
    throw new Error(`Товар ${sku} заблокирован для синхронизации`);
  }

  // Устанавливаем блокировку
  await setStockLock(sku, 'internal_movement', 30000); // 30 сек

  try {
    // Выполняем обновление остатков
    // ...
  } finally {
    // Снимаем блокировку
    await releaseStockLock(sku);
  }
}
```

#### 2. **Перезапись актуальных данных**
**Проблема:** Dilovod имеет более свежие данные об остатках, которые перезаписываются внутренней логикой.

**Решение:** Сравнивать временные метки:
```typescript
async function updateProductStockSafe(sku: string, newStock: any) {
  const product = await prisma.product.findUnique({ where: { sku } });

  if (product.lastSyncAt && product.lastSyncAt > new Date(Date.now() - 5 * 60 * 1000)) {
    // Синхронизация была менее 5 минут назад - не перезаписываем
    console.warn(`⚠️ Не перезаписываем остатки ${sku} - свежая синхронизация`);
    return false;
  }

  // Обновляем остатки
  await prisma.product.update({
    where: { sku },
    data: {
      stockBalanceByStock: JSON.stringify(newStock),
      lastSyncAt: new Date()
    }
  });

  return true;
}
```

#### 3. **Конфликты типов складов**
**Проблема:** Внутренняя система использует ID складов "1", "2", "3", а Dilovod может иметь другие идентификаторы.

**Решение:** Внедрить маппинг складов:
```typescript
const WAREHOUSE_MAPPING = {
  '1': 'dilovod_warehouse_main',    // Основной склад
  '2': 'dilovod_warehouse_kyiv',    // Киевский склад
  '3': 'dilovod_warehouse_small'    // Малый склад
};

// При синхронизации с Dilovod
async function syncStockFromDilovod() {
  const dilovodStock = await dilovodApi.getStockBalance();

  for (const item of dilovodStock) {
    const internalWarehouseId = Object.keys(WAREHOUSE_MAPPING)
      .find(key => WAREHOUSE_MAPPING[key] === item.warehouseId);

    if (internalWarehouseId) {
      await updateProductStock(item.sku, internalWarehouseId, item.quantity);
    }
  }
}
```

### Стратегия синхронизации

#### 1. **Приоритет источников данных**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Dilovod API   │ => │   Sync Queue    │ => │  Local Database │
│  (Source of    │    │  (Validation &  │    │   (Internal     │
│    Truth)      │    │   Conflict      │    │   Operations)   │
│                 │    │  Resolution)   │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

#### 2. **Очередь синхронизации**
```typescript
interface SyncQueueItem {
  sku: string;
  operation: 'update_stock' | 'internal_movement';
  priority: 'high' | 'normal' | 'low';
  data: any;
  timestamp: Date;
  lockUntil?: Date;
}

class StockSyncQueue {
  async enqueue(item: SyncQueueItem): Promise<void> {
    // Добавляем в очередь с приоритетом
  }

  async processQueue(): Promise<void> {
    // Обрабатываем очередь по приоритетам
    // Dilovod sync имеет высший приоритет
    // Internal movements - нормальный
  }
}
```

#### 3. **Мониторинг конфликтов**
```typescript
interface StockConflict {
  sku: string;
  dilovodStock: number;
  internalStock: number;
  lastSyncAt: Date;
  conflictType: 'stale_data' | 'concurrent_update' | 'warehouse_mismatch';
  resolution: 'dilovod_wins' | 'internal_wins' | 'manual_review';
}

class StockConflictMonitor {
  async detectConflicts(): Promise<StockConflict[]> {
    // Находим товары с потенциальными конфликтами
    const conflicts = await prisma.product.findMany({
      where: {
        OR: [
          { lastSyncAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } },
          { stockBalanceByStock: { not: null } }
        ]
      }
    });

    return conflicts.map(product => ({
      sku: product.sku,
      // ... анализ конфликтов
    }));
  }

  async resolveConflict(conflict: StockConflict): Promise<void> {
    switch (conflict.resolution) {
      case 'dilovod_wins':
        await syncFromDilovod(conflict.sku);
        break;
      case 'internal_wins':
        // Не обновляем из Dilovod
        break;
      case 'manual_review':
        await createConflictAlert(conflict);
        break;
    }
  }
}
```

### Реализация решения

#### Шаг 1: Добавить механизм блокировок
```typescript
// Создать таблицу для блокировок
model StockLock {
  id          Int      @id @default(autoincrement())
  sku         String   @unique
  lockType    String   // 'dilovod_sync', 'internal_movement'
  lockedAt    DateTime @default(now())
  lockUntil   DateTime
  lockedBy    String   // ID пользователя или 'system'
}
```

#### Шаг 2: Модифицировать функции обновления остатков
```typescript
async function updateProductStockWithLock(sku: string, ...args: any[]) {
  const lock = await acquireLock(sku, 'internal_movement');

  try {
    return await updateProductStock(sku, ...args);
  } finally {
    await releaseLock(sku);
  }
}
```

#### Шаг 3: Добавить проверки в Dilovod синхронизацию
```typescript
// В DilovodSyncManager.updateProductStockBalance
async function updateStockFromDilovodSafe(sku: string, ...args: any[]) {
  const lock = await acquireLock(sku, 'dilovod_sync');

  try {
    // Проверяем, не было ли внутренних изменений за последние 5 минут
    const lastInternalMovement = await getLastInternalMovement(sku);

    if (lastInternalMovement && lastInternalMovement > new Date(Date.now() - 5 * 60 * 1000)) {
      console.warn(`⚠️ Пропускаем обновление ${sku} из Dilovod - недавнее внутреннее перемещение`);
      return { success: false, message: 'Recent internal movement detected' };
    }

    return await updateProductStock(sku, ...args);
  } finally {
    await releaseLock(sku);
  }
}
```

### Мониторинг и алерты

#### 1. **Метрики конфликтов**
```typescript
interface SyncMetrics {
  totalSyncs: number;
  successfulSyncs: number;
  conflictsDetected: number;
  conflictsResolved: number;
  averageSyncTime: number;
  lastSyncAt: Date;
}

class StockSyncMonitor {
  async getMetrics(): Promise<SyncMetrics> {
    // Собираем метрики из базы данных
  }

  async sendAlerts(): Promise<void> {
    const conflicts = await detectConflicts();

    if (conflicts.length > 10) {
      await sendAlert('High conflict rate detected', {
        conflictCount: conflicts.length,
        timeWindow: '1 hour'
      });
    }
  }
}
```

#### 2. **Логирование операций**
```typescript
interface StockOperationLog {
  id: string;
  sku: string;
  operation: string;
  source: 'dilovod' | 'internal';
  beforeStock: any;
  afterStock: any;
  timestamp: Date;
  userId?: string;
  conflictDetected: boolean;
  resolution?: string;
}

class StockOperationLogger {
  async log(operation: StockOperationLog): Promise<void> {
    await prisma.stockOperationLog.create({ data: operation });
  }

  async getConflictHistory(sku: string): Promise<StockOperationLog[]> {
    return await prisma.stockOperationLog.findMany({
      where: {
        sku,
        conflictDetected: true
      },
      orderBy: { timestamp: 'desc' }
    });
  }
}
```

### Заключение

Правильная интеграция внутренней логики перемещения с синхронизацией Dilovod требует:

1. **Механизма блокировок** для предотвращения одновременных обновлений
2. **Приоритизации источников данных** (Dilovod как Source of Truth)
3. **Временных проверок** для избежания перезаписи свежих данных
4. **Мониторинга конфликтов** и автоматического разрешения
5. **Логирования всех операций** для аудита и отладки

Эта архитектура обеспечит надежную синхронизацию данных без потери информации и конфликтов.

## Архитектура системы

### Backend (Node.js/Express + Prisma)

- **Routes:** `server/routes/warehouse.ts` - API endpoints для работы с перемещениями
- **Database:** Prisma ORM с MySQL
- **Models:** `WarehouseMovement`, `StockMovementHistory`
- **Services:** Бизнес-логика интегрирована в routes (рекомендуется вынести в отдельные сервисы)

### Frontend (React/TypeScript)

- **Page:** `client/pages/WarehouseMovement.tsx` - основной UI
- **Hooks:** `client/hooks/useWarehouse.ts` - API интеграция
- **Types:** `client/types/warehouse.ts` - TypeScript интерфейсы
- **Components:** Переиспользуемые UI компоненты для работы с товарами

### Ключевые компоненты

#### WarehouseMovement.tsx
- Управление состоянием черновиков
- Работа с товарами и количествами
- Интеграция с API через useWarehouse хук
- Обработка ошибок и валидация

#### useWarehouse хук
- API методы для CRUD операций
- Управление состоянием загрузки и ошибок
- Типизированные запросы и ответы

---

## Версия документации

**Версия:** 2.4  
**Дата обновления:** Декабрь 2024  
**Совместимость:** Система складских перемещений v1.0+  
**Автор обновления:** AI Assistant

### Изменения в версии 2.0

- ✅ Обновлена структура базы данных с реальными типами данных
- ✅ Добавлены все API endpoints с примерами использования
- ✅ Исправлены ошибки в API коде
- ✅ Добавлена подробная информация о тестировании
- ✅ Включены примеры использования для Frontend и Backend
- ✅ Добавлена секция известных проблем и решений

### Изменения в версии 2.1

- ✅ **Реализована логика обновления остатков товаров при создании документа**
- ✅ **Добавлена автоматическая фиксация перемещений в истории движения**
- ✅ **Добавлен функционал удаления черновиков с откатом остатков**
- ✅ **Улучшена функция отправки в Dilovod с проверкой остатков**
- ✅ **Добавлена транзакционная безопасность операций**
- ✅ **Обновлен клиентский хук useWarehouse с поддержкой удаления**
- ✅ **Обновлена документация с новыми возможностями**

### Изменения в версии 2.2

- ✅ **Добавлен подробный анализ конфликтов с Dilovod синхронизацией**
- ✅ **Разработаны стратегии разрешения конфликтов**
- ✅ **Предложена архитектура очередей синхронизации**
- ✅ **Добавлен механизм блокировок для предотвращения race conditions**
- ✅ **Внедрены метрики мониторинга конфликтов**
- ✅ **Создана система логирования операций с товарами**

### Изменения в версии 2.4

- ✅ **Исправлена логика отображения остатков - теперь показывает порции правильно**
- ✅ **Реализована полная ориентация на порции вместо ящиков**
- ✅ **Обновлена функция updateProductStock для работы с порциями**
- ✅ **Исправлена функция revertStockMovement для отмены в порциях**
- ✅ **Обновлена функция createStockMovementHistory для сохранения в порциях**
- ✅ **Исправлена отправка в Dilovod с правильной конвертацией порций**
- ✅ **Обновлена логика создания документов - пользователь работает с порциями**
