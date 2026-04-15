# Рефакторинг WarehouseMovement

**Дата:** 2026-04-06  
**Тип:** Структурний рефакторинг на основі WarehouseInventory (поведінка збережена з уточненнями)

---

## Передумови

Монолітний файл `client/pages/WarehouseMovement.tsx` розрісся до **909 рядків** і містив в одному місці:
- UI-компоненти (`CustomInput`, `StepperInput`, `InfoInput`, `ProductAccordionItem`, `SummaryTable`, `CompletedActsTable`)
- весь стан сторінки (~15 `useState`)
- API-виклики (4 функції)
- обчислювальну логіку
- обробники подій (10+ handlers)
- JSX-розмітку (~400 рядків)

Для поліпшення підтримуваності та повторного використання, проведено рефакторинг на основі успішної архітектури `WarehouseInventory`.

---

## Нова структура

```
client/pages/Warehouse/
├── shared/                              # Спільні компоненти для розділу "Склад"
│   ├── WarehouseInventoryTypes.ts       # Типи для інвентаризації
│   ├── WarehouseInventoryUtils.ts       # Утиліти для інвентаризації
│   ├── WarehouseMovementTypes.ts        # NEW: Типи для переміщень
│   ├── WarehouseMovementUtils.ts        # NEW: Утиліти для переміщень
│   ├── StepperInput.tsx                 # Повторно використаний input
│   ├── InfoDisplay.tsx                  # Повторно використаний display
│   └── HistoryTable.tsx                 # Таблиця історії
│
├── WarehouseInventory/                  # Існуючий розділ інвентаризації
│   ├── index.tsx
│   ├── useWarehouseInventory.ts
│   └── components/
│
└── WarehouseMovement/                   # NEW: Розділ переміщень
    ├── index.tsx                        # Головний компонент (~150 рядків)
    ├── useWarehouseMovement.ts          # Хук: весь стан, API, handlers
    └── components/
        ├── MovementStartScreen.tsx      # Початковий екран без активної чернетки
        ├── MovementFilterBar.tsx        # Рядок пошуку та фільтрації
        ├── MovementProductRow.tsx       # Акордіон-рядок одного товару
        ├── MovementProductList.tsx      # Список позицій (тільки товари, БЕЗ матеріалів)
        ├── MovementSummaryTable.tsx     # Підсумкова таблиця
        ├── MovementActionBar.tsx        # Нижня панель кнопок + синхронізація
        └── (HistoryTab буде додана пізніше)
```

---

## Ключові особливості WarehouseMovement

### Відмінності від WarehouseInventory

| Параметр | WarehouseInventory | WarehouseMovement |
|----------|---------------------|-------------------|
| **Товари** | Страви + Матеріали | Тільки страви |
| **Прогрес** | Показується (прогрес-бар) | Не показується |
| **Повне переміщення** | Все одразу на початку | Так, все одразу |
| **Синхронізація** | На загальній панелі | Окрема кнопка в ActionBar |
| **Склади** | Малий склад | Два склади (Основний → Малий) |
| **Статус переміщення** | Не показується | Показується в таблиці |

### Нові типи в `shared/WarehouseMovementTypes.ts`

```typescript
export type MovementStatus = 'draft' | 'sent';

export interface MovementProduct {
  id: string;
  sku: string;
  name: string;
  balance: number; // Залишок у порціях
  details: {
    boxes: number;
    portions: number;
    batchNumber: string;
    forecast: number;
    deviation: number;
  };
}

export interface MovementDraft {
  id: number;
  status: MovementStatus;
  sourceWarehouse: string; // "Основний склад"
  destinationWarehouse: string; // "Малий склад"
  items: MovementItem[];
  deviations?: MovementDeviation[];
  internalDocNumber?: string;
  // ... інші поля
}
```

### Утиліти в `shared/WarehouseMovementUtils.ts`

- `totalPortions(p)` — обчислення загальних порцій
- `statusLabel` / `statusColor` — словники статусів
- `formatDate()` — форматування дати
- `serializeMovementItems()` — підготовка товарів для збереження

---

## Стан та обробники в `useWarehouseMovement.ts`

Хук повертає об'єкт `UseWarehouseMovementReturn` з:

**Стан сесії:**
- `sessionStatus: MovementStatus | null`
- `savedDraft: MovementDraft | null`
- `isSaving`, `isSending` — флаги завантаження

**Товари:**
- `products: MovementProduct[]`
- `filteredProducts` — товари, відфільтровані по пошуку
- `selectedProductIds: Set<string>` — обрані товари для переміщення
- `activeField` — поточне активне поле для редагування

**Пошук:**
- `searchQuery: string`
- `setSearchQuery()`

**Handlers:**
- `handleToggleProduct()` — розгортання/згортання товару
- `handleProductChange()` — зміна значень товару
- `handleSaveDraft()` — збереження чернетки
- `handleFinish()` — завершення та відправлення в Діловод
- `handleReset()` — скасування й перезавантаження
- **`handleSyncBalances()`** — НОВ: синхронізація залишків (перезавантаження товарів)

---

## UI-компоненти

### MovementStartScreen
Початковий екран без активної чернетки. Містить кнопку для запуску переміщення.

### MovementFilterBar
Поле пошуку за назвою або артикулом.

### MovementProductRow
Акордіон-рядок одного товару з полями:
- Кількість коробок (StepperInput)
- Кількість порцій (StepperInput)
- Прогноз (InfoDisplay, read-only)
- Номер партії (текстове поле)

### MovementProductList
Обгортка для списку товарів, показує стани завантаження/помилки/пусто.

### MovementSummaryTable
Таблиця обраних товарів з метаінформацією про складози:
- Звідки: Основний склад
- Куди: Малий склад

Підсумки: позиції, коробки, порції.

### MovementActionBar
Нижня панель дій:
- **Скасувати** — скасувати переміщення
- **Синхронізувати залишки** — нова кнопка для оновлення залишків з сервера
- **Зберегти чернетку** — зберегти чернетку
- **Завершити переміщення** — відправити в Діловод

---

## Нова функціональність: Синхронізація залишків

Додана кнопка "Синхронізувати залишки" в `MovementActionBar`, яка викликає `handleSyncBalances()`.

```typescript
const handleSyncBalances = useCallback(async () => {
  try {
    ToastService.show({ title: '🔄 Синхронізуємо залишки...', color: 'default' });
    await loadProducts(); // Перезавантажуємо товари з сервера
    ToastService.show({ title: '✅ Залишки синхронізовані', color: 'success' });
  } catch (err) {
    ToastService.show({ title: 'Помилка синхронізації', description: err.message, color: 'danger' });
  }
}, [loadProducts]);
```

Це дозволяє користувачам оновити залишки без перезавантаження сторінки.

---

## Зміни в routes.config.tsx

```ts
// Було:
import WarehouseMovement from './pages/WarehouseMovement';

// Стало:
import WarehouseMovement from './pages/Warehouse/WarehouseMovement';
```

Маршрут залишається тим же: `/warehouse/movement`.

---

## Видалені файли

- ❌ `client/pages/WarehouseMovement.tsx` — монолітний файл

---

## Що залишилось

- Додавання вкладки "Історія" переміщень (на зразок HistoryTab з WarehouseInventory)
- Модальне вікно для перегляду завершених актів переміщення
- Інтеграція з WebSocket для real-time оновлення залишків
- Можливі розширення для сценаріїв з багатьма складами

