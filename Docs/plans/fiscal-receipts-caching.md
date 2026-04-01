# План оптимізації запитів фіскальних чеків

## 🔍 Поточна ситуація

### Проблеми
1. **Надмірні запити до Dilovod API** (~2 запити на замовлення):
   - `GET /api/orders/:id/fiscal-receipts/list` — отримати список чеків
   - `GET /api/orders/:id/fiscal-receipt?index=0` — отримати конкретний чек

2. **Частота запитів** (з логів):
   - 4 замовлення на 15 секунд = ~1 запит на 2 секунди × 2 = **~1 запит/сек на Dilovod**
   - Для 100+ замовлень в таблиці це може бути **50+ запитів/сек** 🔴

3. **Вісцинаме викликають запити**:
   - `OrderViewHeader.tsx` при завантаженні замовлення (line 35: `useEffect(() => { loadReceiptsList() }, [order.dilovodDocId])`)
   - Це спрацьовує для **кожного** замовлення в таблиці (batch load)

4. **Немає кешування** — одні й ті самі чеки запитуються повторно

---

## 📋 План реалізації

### **ФАЗА 1: Серверне кешування чеків** (1-2 дні)

#### 1.1 Розширити модель `Order` в Prisma
```typescript
// prisma/schema.prisma
model Order {
  // ... існуючі поля ...
  
  // Нові поля для кешування чеків
  fiscalReceiptsCachedAt   DateTime?         @db.DateTime(3)
  fiscalReceiptsCache      String?           @db.LongText  // JSON: { receiptsList, receipts }
  fiscalReceiptsCacheHash  String?           // MD5 hash для виявлення змін
}
```

**Міграція**: `prisma/migrations/YYYYMMDD_cache_fiscal_receipts`

#### 1.2 Сервісний клас `FiscalReceiptsCacheService`
Новий файл: `server/services/FiscalReceiptsCacheService.ts`

**Відповідальність**:
- Запис/читання кешу з БД
- Управління TTL (час життя) — кеш на 24 години
- Валідація стану замовлення перед кешуванням (тільки для `exported` статусу)
- Інвалідація кешу при зміні `dilovodDocId` або статусу

**Методи**:
```typescript
class FiscalReceiptsCacheService {
  // Отримати чеки (з кешу або API)
  async getReceiptsList(orderId: number, forceRefresh?: boolean): Promise<...>
  
  // Отримати конкретний чек (з кешу або API)
  async getReceipt(orderId: number, index: number, forceRefresh?: boolean): Promise<...>
  
  // Мануальне кешування результату
  async cacheReceiptsList(orderId: number, data: any): Promise<void>
  
  // Інвалідувати кеш
  async invalidateCache(orderId: number): Promise<void>
  
  // Очистити застарілий кеш (cron job)
  async cleanExpiredCache(): Promise<void>
}
```

---

### **ФАЗА 2: Батч-завантаження на бекенді** (1 день)

#### 2.1 Новий endpoint: Батч-запит чеків
```typescript
// server/routes/orders.ts

/**
 * POST /api/orders/fiscal-receipts/batch
 * Отримати чеки для набору замовлень одним запитом
 * 
 * Body: { orderIds: [1, 2, 3, ...], includeReceipts?: boolean }
 * Response: { [orderId]: { receiptsList, receipts: {} } }
 */
router.post('/fiscal-receipts/batch', authenticateToken, async (req, res) => {
  // ... реалізація
})
```

**Логіка**:
1. Отримуємо array `orderIds` з body
2. Паралельно (або з контролюванням concurrency) отримуємо чеки для кожного замовлення
3. Кешуємо результати
4. Повертаємо { orderId → data } object (для зручності на фронтенді)

**Контроль параллелізму**: макс 3-5 одночасних запитів до Dilovod (так як Dilovod не подобаються паралельні запити)

---

### **ФАЗА 3: Оптимізація на фронтенді** (1-2 дні)

#### 3.1 Новий сервіс на клієнті: `FiscalReceiptsCacheService`
Файл: `client/services/FiscalReceiptsCacheService.ts`

**Відповідальність**:
- Управління in-memory кешем на фронтенді (Map<orderId, cachedData>)
- Управління TTL за допомогою `useEffect` cleanup
- Відслідковування "pending" запитів (щоб не робити duplicate запити)

```typescript
class FiscalReceiptsCacheService {
  private cache = new Map<number, { data: any; timestamp: number; expiresAt: number }>();
  private pendingRequests = new Map<number, Promise<...>>();
  private TTL_MS = 30 * 60 * 1000; // 30 хвилин на фронтенді
  
  async getReceiptsList(orderId: number, api: ApiCallFn): Promise<...>
  async getReceipts(orderIds: number[], api: ApiCallFn): Promise<...> // батч
  invalidateCache(orderId: number): void
  clearAll(): void
}

// Export singleton
export const fiscalReceiptsCacheService = new FiscalReceiptsCacheService();
```

#### 3.2 Рефакторинг `OrderViewHeader.tsx`
```typescript
// До (поточна реалізація):
useEffect(() => {
  if (order.dilovodDocId) {
    loadReceiptsList(); // Запит до /api/orders/:id/fiscal-receipts/list
  }
}, [order.dilovodDocId]);

// Після (оптимізована):
useEffect(() => {
  if (order.dilovodDocId && order.id) {
    // Спочатку спробуємо отримати з in-memory кешу
    fiscalReceiptsCacheService.getReceiptsList(order.id, apiCall)
      .then(data => setReceiptsList(data))
      .catch(err => console.error(err));
  }
}, [order.dilovodDocId]);
```

#### 3.3 Батч-завантаження для таблиці замовлень
Компонент `SalesDriveOrdersTable.tsx` — коли таблиця завантажується:

```typescript
// Після завантаження orders в таблиці
useEffect(() => {
  if (orders.length > 0) {
    // Отримуємо ID замовлень з експортованими документами
    const orderIdsForBatch = orders
      .filter(o => o.dilovodDocId)
      .map(o => o.id);
    
    if (orderIdsForBatch.length > 0) {
      // Один батч-запит замість 20+ окремих
      fiscalReceiptsCacheService.getReceipts(orderIdsForBatch, apiCall)
        .catch(err => console.error('Batch fetch failed:', err));
    }
  }
}, [orders]);
```

---

### **ФАЗА 4: Fallback для ручного запиту** (1 день)

#### 4.1 Кнопка "Перевилучити чек" в `OrderViewHeader.tsx`

```typescript
const handleRefreshReceipt = async () => {
  try {
    setLoadingReceipt(true);
    
    // Спочатку інвалідуємо кеш
    fiscalReceiptsCacheService.invalidateCache(order.id);
    
    // Потім запитуємо заново без кешу
    const receiptIndex = parseInt(Array.from(selectedReceiptIndex)[0]);
    const response = await apiCall(
      `/api/orders/${order.id}/fiscal-receipt?index=${receiptIndex}&forceRefresh=true`
    );
    
    // ... решта логіки ...
  } finally {
    setLoadingReceipt(false);
  }
};
```

#### 4.2 Параметр `forceRefresh` на бекенді
```typescript
// server/routes/orders.ts
router.get('/:id/fiscal-receipt', authenticateToken, async (req, res) => {
  const forceRefresh = req.query.forceRefresh === 'true';
  
  if (forceRefresh) {
    // Пропускаємо кеш, запитуємо напряму з Dilovod
    await fiscalReceiptsCacheService.invalidateCache(parseInt(id));
  }
  
  // ... решта логіки ...
});
```

---

## 🗄️ Стратегія зберігання результатів

### **Варіант 1: В кожному замовленні (рекомендується)** ✅

**Переваги**:
- Простіше реалізувати
- Кеш автоматично видаляється з замовленням
- Легко синхронізувати (одна таблиця)
- Можна запитати чеки для 1 замовлення без контексту інших

**Реалізація**:
```typescript
// Поле в Order:
fiscalReceiptsCachedAt: DateTime
fiscalReceiptsCache: String (JSON)

// Приклад вмісту:
{
  "receiptsList": [...],
  "receipts": {
    "0": { ... },
    "1": { ... }
  },
  "version": 1
}
```

---

### **Варіант 2: Окремий реєстр** ❌ (не рекомендується)

**Недоліки**:
- Складніше управління (додаткова таблиця)
- Проблеми з синхронізацією (якщо видалити замовлення)
- Більше операцій БД при пошуку

---

## 📊 Очікувані результати

### Поточний стан (без оптимізацій)
```
📊 Статистика для таблиці з 100 замовлень:
- Запитів до Dilovod: ~200 (2 на замовлення)
- Часу на завантаження: ~10-15 сек
- Навантаження на API: ~2 запити/сек
```

### Після оптимізацій
```
📊 Після ФАЗИ 1-4:
- Перший візит: ~20 запитів (батч) → 5-10 сек
- Повторні візити: 0 запитів (все в кеші) → <1 сек
- Fallback (ручний refresh): 2 запити (без батча)
- Навантаження на API: <0.1 запитів/сек в нормальних умовах
```

---

## 🛣️ Порядок реалізації

1. **День 1-2**: ФАЗА 1 (Prisma schema + FiscalReceiptsCacheService на бекенді)
2. **День 2-3**: ФАЗА 2 (Батч endpoint на бекенді)
3. **День 3-4**: ФАЗА 3 (Клієнтський сервіс + рефакторинг компонентів)
4. **День 4-5**: ФАЗА 4 (Fallback кнопка + тестування)
5. **День 5**: Документування + запуск в production

---

## 🔧 Технічні деталі

### Управління TTL на бекенді
```typescript
const CACHE_TTL_HOURS = 24;
const isCacheExpired = (cachedAt: Date) => {
  const now = Date.now();
  const age = now - cachedAt.getTime();
  return age > CACHE_TTL_HOURS * 60 * 60 * 1000;
};
```

### Управління TTL на клієнті
```typescript
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 хвилин (менше ніж на бекенді)
// Причина: фронтенд можна перезавантажити, кеш з'їде
```

### Контроль параллелізму на бекенді
```typescript
async function fetchWithConcurrencyControl(orderIds: number[], maxConcurrent: number = 3) {
  const results = {};
  const queue = [...orderIds];
  const active = [];
  
  while (queue.length > 0 || active.length > 0) {
    while (active.length < maxConcurrent && queue.length > 0) {
      const orderId = queue.shift();
      const promise = dilovodService.getFiscalReceiptsList(orderId)
        .then(data => { results[orderId] = data; })
        .finally(() => { active.splice(active.indexOf(promise), 1); });
      active.push(promise);
    }
    
    if (active.length > 0) {
      await Promise.race(active);
    }
  }
  
  return results;
}
```

---

## 🧪 Тестування

### Unit тести
- `FiscalReceiptsCacheService`: TTL, кешування, інвалідація
- `FiscalReceiptsCacheService` (клієнт): batch запити, pending деуплікація

### Інтеграційні тести
- Батч endpoint: коректність результатів для 10+ замовлень
- Concurrency control: максимум N одночасних запитів до Dilovod

### E2E тести
- Завантаження таблиці → без більше ніж 5 API запитів
- Другий візит на ту ж таблицю → 0 API запитів (кеш)
- Ручний refresh → 2 API запити (bypass кешу)

---

## 📝 Документування

- Додати `Docs/architecture/fiscal-receipts-caching.md`
- Оновити `README.md` про новий сервіс
- Коментарі в коді про TTL та fallback логіку
