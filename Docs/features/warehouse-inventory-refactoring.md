# Рефакторинг WarehouseInventory

**Дата:** 2026-04-04  
**Тип:** Структурний рефакторинг (поведінка не змінилась)

---

## Передумови

Монолітний файл `client/pages/WarehouseInventory.tsx` розрісся до **1264 рядків** і містив в одному місці:
- TypeScript-типи
- допоміжні функції
- UI-компоненти (`StepperInput`, `InfoDisplay`, `ProductRow`, `HistoryTable`)
- весь стан сторінки (~25 `useState`)
- API-виклики (4 окремих функції)
- обчислювальну логіку (computed значення)
- обробники подій (10+ handlers)
- JSX-розмітку (~400 рядків)

---

## Нова структура

```
client/pages/Warehouse/
├── shared/                              # Спільні компоненти для всього розділу "Склад"
│   ├── WarehouseInventoryTypes.ts       # Типи: InventoryStatus, InventoryProduct, InventorySession
│   ├── WarehouseInventoryUtils.ts       # Утиліти: totalPortions, statusLabel, statusColor, serializeItems
│   ├── StepperInput.tsx                 # Touch-friendly input з OSK-підтримкою та forwardRef
│   ├── InfoDisplay.tsx                  # Read-only поле відображення числового значення
│   └── HistoryTable.tsx                 # Таблиця завершених інвентаризацій
│
└── WarehouseInventory/
    ├── index.tsx                        # Головний компонент (~130 рядків) — лише UI-оркестратор
    ├── useWarehouseInventory.ts         # Хук: весь стан, API, computed, handlers
    └── components/
        ├── ProductRow.tsx               # Акордіон-рядок одного товару або матеріалу
        ├── InventoryProductList.tsx     # Список позицій з header, loading/error/empty станами
        ├── InventoryProgressBar.tsx     # Прогрес перевірки + чіп відхилень + поле пошуку
        ├── InventorySummaryTable.tsx    # Підсумкова таблиця всіх відхилень
        ├── InventoryActionBar.tsx       # Нижня панель кнопок (скасувати/коментар/зберегти/завершити)
        ├── InventoryStartScreen.tsx     # Початковий екран без активної сесії
        ├── InventorySessionMeta.tsx     # Права частина рядка табів (статус, дата, хто проводить)
        ├── InventoryHistoryTab.tsx      # Вміст вкладки "Історія"
        └── InventoryCommentModal.tsx    # Модалка введення/редагування коментаря
```

---

## Ключові рішення

### Папка `Warehouse/` як feature-container
`pages/Warehouse/` — організаційна папка без власного маршруту. Маршрути вказуються напряму на дочірні сторінки:
```
/warehouse/inventory  →  pages/Warehouse/WarehouseInventory/index.tsx
/warehouse/movement   →  pages/Warehouse/WarehouseMovement/index.tsx  (майбутнє)
```

### `shared/` — спільні компоненти розділу
`StepperInput`, `InfoDisplay` та `HistoryTable` винесено в `shared/` (а не в `WarehouseInventory/components/`), оскільки вони будуть повторно використані в `WarehouseMovement` після його рефакторингу.

`WarehouseMovement.tsx` наразі містить власну спрощену копію `StepperInput` (без OSK та `forwardRef`). Після рефакторингу `WarehouseMovement` — мігрувати на версію з `shared/`.

### `useWarehouseInventory` — весь стан в одному хуку
Хук повертає повний об'єкт `UseWarehouseInventoryReturn` з явною типізацією. Головний компонент (`index.tsx`) отримує всі дані через `const inv = useWarehouseInventory()` і не містить жодної бізнес-логіки.

### `InventoryProductList` — уніфікований список
Один компонент для **страв** і **матеріалів** — параметризується через:
- `title`, `icon` — назва та іконка секції
- `headerColorClass`, `headerTextClass` — кольорова тема заголовка
- `onRetry` — колбек для повторного завантаження при помилці

---

## Зміни в routes.config.tsx

```ts
// Було:
import WarehouseInventory from './pages/WarehouseInventory';

// Стало:
import WarehouseInventory from './pages/Warehouse/WarehouseInventory';
```

Шляхи маршрутів (`/warehouse/inventory`) не змінились.

---

## Що залишилось для наступного кроку

- Рефакторинг `WarehouseMovement.tsx` в `pages/Warehouse/WarehouseMovement/`
- Міграція `StepperInput` та `InfoDisplay` в `WarehouseMovement` з `shared/`
- Можливо: `WarehouseMaterials.tsx` → `pages/Warehouse/WarehouseMaterials/`
