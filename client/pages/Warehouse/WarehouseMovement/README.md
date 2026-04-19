# WarehouseMovement — Переміщення товарів між складами

Розділ для управління переміщенням товарів зі Основного складу в Малий склад.

## Структура

```
├── index.tsx                    # Головний компонент (оркестратор)
├── useWarehouseMovement.ts      # Хук зі станом, API, handlers
└── components/
    ├── MovementStartScreen.tsx      # Початковий екран (без активної чернетки)
    ├── MovementFilterBar.tsx        # Пошук та фільтрація
    ├── MovementProductRow.tsx       # Рядок товару (акордіон)
    ├── MovementProductList.tsx      # Список товарів
    ├── MovementSummaryTable.tsx     # Таблиця підсумків
    └── MovementActionBar.tsx        # Панель дій + синхронізація
```

## Основна логіка

**Стан управляється в `useWarehouseMovement.ts`:**
- `products` — список товарів з серверу
- `selectedProductIds` — обрані товари для переміщення
- `savedDraft` — поточна чернетка переміщення
- `activeField` — поточне активне поле для редагування (для OSK)

**Обробники:**
- `handleToggleProduct()` — розгорнути/згорнути товар
- `handleProductChange()` — змінити кількість (коробки/порції/партія)
- `handleSaveDraft()` — зберегти чернетку
- `handleReset()` — скасувати й очистити
- `handleSyncBalances()` — обновити залишки з сервера (нова функція)

## Особливості

✅ **Список тільки товарів** — без матеріалів (коробок)  
✅ **Без прогрес-бару** — все переміщується одразу  
✅ **Кнопка синхронізації** — перезавантажити залишки в будь-який момент  
✅ **Touch-friendly** — OSK-підтримка для мобільних пристроїв  
✅ **Два склади** — Основний → Малий  

## Типи

Типи визначені у `shared/WarehouseMovementTypes.ts`:
- `MovementProduct` — товар з деталями переміщення
- `MovementDraft` — чернетка переміщення
- `MovementStatus` — стан ('draft' | 'sent')

## Утиліти

Функції у `shared/WarehouseMovementUtils.ts`:
- `totalPortions()` — обчислення загальних порцій
- `statusLabel`, `statusColor` — словники статусів
- `serializeMovementItems()` — підготовка товарів для збереження

## Маршрут

`/warehouse/movement` → `pages/Warehouse/WarehouseMovement/index.tsx`

## Майбутні розширення

- [ ] Вкладка "Історія" переміщень
- [ ] Модальне вікно для перегляду завершених актів
- [ ] Real-time синхронізація залишків (WebSocket)
- [ ] Експорт в PDF
