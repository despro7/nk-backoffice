# Інвентаризація малого складу

## Огляд

Сторінка `/warehouse/inventory` — інструмент для проведення інвентаризації малого складу. Дозволяє зафіксувати фактичні залишки товарів, порівняти їх із системними, зберегти чернетку та завершити інвентаризацію із записом в БД.

---

## Схема БД

### Таблиця `warehouse_inventory` (модель `WarehouseInventory`)

```prisma
model WarehouseInventory {
  id            Int       @id @default(autoincrement())
  warehouse     String    @default("small")   // "small" = Малий склад
  status        String    @default("draft")   // draft | in_progress | completed
  comment       String?   @db.Text
  items         String    @db.LongText        // JSON: InventoryProduct[]
  createdBy     Int                           // users.id
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  completedAt   DateTime?
  inventoryDate DateTime?                     // Логічна дата проведення (задається користувачем)

  @@map("warehouse_inventory")
}
```

Міграції:
- `20260329234602_add_inventory_sessions` — початкова
- `20260420224459_add_inventory_date_to_warehouse_inventory` — додано поле `inventoryDate`

#### Поле `inventoryDate`

| Аспект | Деталі |
|---|---|
| Тип | `DateTime?` (nullable) |
| Семантика | Логічна дата проведення інвентаризації — обирається користувачем через `DateTimePicker` |
| Відмінність від `createdAt` | `createdAt` — технічна дата створення запису; `inventoryDate` — дата, станом на яку рахуються залишки |
| За замовчуванням | `null` (для старих записів); UI показує `createdAt` якщо `inventoryDate` відсутня |

### Поле `portionsPerBox` у таблиці `products`

```prisma
portionsPerBox  Int  @default(24)
```

Міграція: `20260329232854_add_portions_per_box_to_products`

Семантика:
- `portionsPerBox > 1` → порційний товар (`unit: 'portions'`)
- `portionsPerBox = 1` → штучний товар (`unit: 'pcs'`)

---

## API Endpoints

Всі endpoints реєструються у `server/routes/warehouse.ts`, мають префікс `/api/warehouse`.

### Товари для інвентаризації

#### `GET /api/warehouse/inventory/products`

Повертає список товарів з ненульовим залишком на малому складі.

**Фільтрація:** `stockBalanceByStock[warehouseId] > 0` де `warehouseId` — id малого складу.

**Відповідь:**
```json
{
  "products": [
    {
      "id": "42",
      "sku": "BEEF-001",
      "name": "Яловичина (порції)",
      "systemBalance": 96,
      "unit": "portions",
      "portionsPerBox": 24
    }
  ],
  "total": 1
}
```

> ⚠️ **Важливо:** маршрут `GET /inventory/products` повинен бути зареєстрований **до** `GET /:id`, інакше Express перехоплює рядок `"inventory"` як параметр `id`.

---

### Чернетки інвентаризацій

#### `GET /api/warehouse/inventory/draft`

Повертає поточну незавершену сесію авторизованого користувача (`status: draft | in_progress`).

**Відповідь:** `{ draft: InventorySession | null }`

> `inventoryDate` повертається як ISO-рядок або `null`.

---

#### `POST /api/warehouse/inventory/draft`

Створює нову сесію або повертає/оновлює існуючу незавершену.

**Тіло запиту:**
```json
{
  "comment": "Планова інвентаризація",
  "items": [...],
  "inventoryDate": "2026-04-21T09:00:00.000Z"
}
```

**Відповідь:** `{ session: InventorySession }`

---

#### `PUT /api/warehouse/inventory/draft/:id`

Зберігає поточний стан чернетки (items + comment + inventoryDate). Не можна редагувати завершені сесії.

**Тіло запиту:**
```json
{
  "comment": "...",
  "items": [...],
  "inventoryDate": "2026-04-21T09:00:00.000Z"
}
```

**Відповідь:** `{ session: InventorySession }`

---

#### `POST /api/warehouse/inventory/draft/:id/complete`

Завершує інвентаризацію: `status → completed`, записує `completedAt`.

**Тіло запиту:** `{ comment?: string, items?: [...], inventoryDate?: string }`

**Відповідь:** `{ session: InventorySession }`

---

#### `DELETE /api/warehouse/inventory/draft/:id`

Видаляє незавершену чернетку. Завершені сесії видалити не можна.

**Відповідь:** `{ message: "Draft deleted" }`

---

### Історія

#### `GET /api/warehouse/inventory/history`

Повертає завершені інвентаризації (пагінація).

**Query params:** `page` (default: 1), `limit` (default: 20)

**Відповідь:**
```json
{
  "sessions": [...],
  "pagination": { "page": 1, "limit": 20, "total": 5, "pages": 1 }
}
```

---

## Клієнт (`client/pages/WarehouseInventory.tsx`)

### Стан

| Змінна | Тип | Призначення |
|---|---|---|
| `sessionId` | `number \| null` | ID поточної сесії в БД |
| `sessionStatus` | `InventoryStatus \| null` | Локальний статус UI |
| `sessionDate` | `string \| null` | ISO-дата: спочатку `inventoryDate` з БД, потім `createdAt`; змінюється через `DateTimePicker` |
| `products` | `InventoryProduct[]` | Список товарів з введеними даними |
| `historySessions` | `InventorySession[]` | Завершені інвентаризації |
| `isSavingDraft` | `boolean` | Spinner на кнопці збереження |
| `isDirty` | `boolean` | `true` — є незбережені зміни відносно останнього збереження |
| `isRefreshingBalances` | `boolean` | `true` — виконується запит оновлення залишків на дату |

### Lifecycle

```
mount
  └─ loadDraft()
       ├─ GET /inventory/draft
       ├─ якщо є → loadProducts() → merge items із чернетки
       └─ якщо немає → loadProducts() (чисті залишки)
```

### Ключові handlers

| Handler | Дія |
|---|---|
| `handleStartSession` | `setSessionStatus('in_progress')` + `POST /inventory/draft` (передає `inventoryDate`) |
| `handleSaveDraft` | `PUT /inventory/draft/:id` або `POST /inventory/draft` якщо ще немає ID (передає `inventoryDate`) |
| `handleFinish` | `POST /inventory/draft/:id/complete` → `setSessionStatus('completed')` (передає `inventoryDate`) |
| `handleReset` | `DELETE /inventory/draft/:id` → скидання стану → `loadProducts()` |
| `handleSessionDateChange` | Оновлює `sessionDate`, ставить `isDirty`, запускає debounce 1с → `refreshSystemBalances` |
| `loadHistory` | `GET /inventory/history` → `setHistorySessions(...)` |

### Логіка `sessionDate`

При завантаженні чернетки (`loadDraft`):
```
draft.inventoryDate ?? draft.createdAt ?? null
```
Тобто пріоритет — обрана користувачем логічна дата; якщо відсутня — технічна дата створення.

При зміні дати через `DateTimePicker`:
1. `setSessionDate(date.toISOString())` — оновлює локальний стан
2. `setLastSavedSnapshot('')` — позначає `isDirty = true`
3. Debounce 1 сек → `refreshSystemBalances(date)` — оновлює `systemBalance` всіх товарів/матеріалів із `/api/warehouse/stock-snapshot`

### Таб "Історія"

Lazy load: завантажується при першому переключенні на таб або по кнопці "Оновити".

---

## Поле `portionsPerBox` у SettingsProductSets

У `client/pages/SettingsProductSets.tsx` додано колонку **"Порцій/кор."** із inline-редагуванням через `PUT /api/products/:id/portions-per-box`.

**Обмеження:** комплектні товари (`product.set` — непустий масив) відображають `—` і не дозволяють редагування.
