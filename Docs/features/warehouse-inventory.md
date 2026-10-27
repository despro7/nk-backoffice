# Інвентаризація складів (МС + ГП)

## Огляд

Сторінка `/warehouse/inventory` — інструмент для проведення інвентаризації **малого складу (МС)** та **складу готової продукції (ГП)**.

- Введення факту — **окремими сесіями** (`warehouse`: `small` | `gp`), щоб різні люди могли паралельно рахувати свій склад.
- У **історії** пари сесій МС+ГП за один календарний день (Europe/Kyiv) з різницею часу ≤ 2 год показуються **однією карткою** (без merge у БД). Різний статус (`revising`, `in_progress`) пару не розриває.
- Каталог позицій — **Products Catalog 2.0** (`catalog_goods`, `ProductsCatalogService.listInventory*`).

---

## Схема БД

### Таблиця `warehouse_inventory` (модель `WarehouseInventory`)

```prisma
model WarehouseInventory {
  id            Int       @id @default(autoincrement())
  warehouse     String    @default("small")   // "small" = МС, "gp" = склад ГП
  status        String    @default("draft")
  comment       String?   @db.Text
  items         String    @db.LongText        // JSON: позиції з полями МС та ГП
  createdBy     Int
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  completedAt   DateTime?
  inventoryDate DateTime?

  @@map("warehouse_inventory")
}
```

Поле `items` зберігає для кожної позиції і МС (`systemBalance`, `actualCount`, `boxCount`), і ГП (`systemBalanceGp`, `actualCountGp`, `boxCountGp`). У сесії з `warehouse=small` користувач заповнює лише колонки МС; у `warehouse=gp` — лише ГП.

---

## API (префікс `/api/warehouse`)

### Каталог

- `GET /inventory/products` — товари ГП (не набори), `ProductsCatalogService.listInventoryProducts()`
- `GET /inventory/materials` — матеріали
- `GET /inventory/sets` — набори

### Чернетки

- `GET /inventory/drafts` — усі активні чернетки користувача (МС і ГП окремо)
- `GET /inventory/draft?warehouse=small|gp` — чернетка для обраного складу
- `POST /inventory/draft` — тіло: `{ warehouse, comment?, items?, inventoryDate? }`; одна активна чернетка на пару `(createdBy, warehouse)`
- `PUT /inventory/draft/:id`, `POST /draft/:id/complete`, `DELETE /draft/:id` — як раніше

### Історія

- `GET /inventory/history` — сесії з полем `warehouse`
- `POST /inventory/catalog-flags` — тіло `{ skus: string[] }`; відповідь `{ flags: Record<sku, { isOutdated, doNotPublish }> }` для збагачення знімків у БД (архів / OFF у магазині)
- `GET /inventory/product-history?sku=&days=` — реєстр змін по SKU; **один рядок на календарний день Kyiv** (пари МС+ГП зводяться через `buildProductHistoryBalanceSnapshotsByDay`); рухи (`kit`, `shipped`, …) рахуються раз на `dayKey`, див. [`warehouse-inventory-shipped-activity.md`](warehouse-inventory-shipped-activity.md)

### Оновлення облікових залишків у завершеній сесії

- `POST /inventory/:id/refresh-balances` — preview; `?apply=true` — запис у `items` лише для активного складу сесії (`systemBalance` або `systemBalanceGp`)
- Оновлює з Dilovod (`smallStorage` / `mainStorage`) на дату `inventoryDate ?? createdAt`

### Legacy / редагування завершених

- `POST /inventory/:id/reconcile` — нормалізує `warehouse` і поля факту в БД для старих записів
- `POST /inventory/:id/revision` — переводить завершену сесію в `revising`
- `POST /inventory/:id/abort-revision` — повертає `revising` → `completed` при «Закрити без збереження»

---

## Клієнт

- URL: `/warehouse/inventory`, `/warehouse/inventory/sm|gp`, `/warehouse/inventory/sm|gp/:sessionId`
- Старт: **«Розпочати МС»** / **«Розпочати ГП»** (або продовжити чернетку).
- Форма введення показує колонки лише для активного складу сесії; один рядок степперів на активний склад.
- Пряме відкриття за URL: loader (`InventorySessionLoadingState`), деталі без дубльованого H2 (`compactHeader`).
- Історія: `buildInventoryHistoryDisplayEntries()` — UI-групування МС+ГП незалежно від статусу; евристика для старих записів без `warehouse=gp` (факт лише по одному складу).
- Акордеон: бейдж складу перед датою (`МС`, `ГП` або `МС + ГП`). Дата — `formatDateLong`. Якщо статус не `completed`, чіп називає сторону: «Редагується - МС», «Редагується - МС і ГП». Обидві завершені — «Завершена».
- Зведена таблиця: `mergeInventoryGroupItems()` зводить позиції по SKU (облік і факт МС із сесії МС, ГП — із сесії ГП). Кнопки «Оновити облікові залишки», «Редагувати», «Видалити», «Відновити» у парі відкривають меню конкретного складу.
- Видалена сесія живе в архіві окремим списком, тому в історії з завершеною парою не лишається. Дві видалені сесії одного дня в архіві знову зводяться.
- Розгортання рядка SKU: вкладена таблиця реєстру — **один запис на день** (`dayKey`), не дублює рухи для окремих сесій МС і ГП того ж дня.
- Бейджі **OFF** (`doNotPublish`) та **Архів** (`isOutdated`) — `InventoryCatalogStatusBadges` у формі та в історії; для завершених сесій прапорці підтягуються з каталогу (`enrichInventorySessionsWithCatalogFlags` після `loadHistory` / `loadArchive`). У списку позицій приховані legacy OFF/архів без факту та без залишку (`isLegacyCatalogItem`).
- SKU в історії → dropdown: копіювання (SKU, назва, рядок), **«Редагувати товар»** (`MovementMobProductEditDrawer` / `ProductDrawer`, `item.id` = id у каталозі), **«Рухи товару»** (`ProductMovementsDrawer`, період `inventoryDate ± 5` днів).
- Заголовок зведеної картки в історії: дата Kyiv і час МС / ГП (`inventoryHeaderDateLabel`).
- Редагування завершеної: «Закрити без збереження» з `ConfirmModal` → `abort-revision`.

### Локальний резерв (не серверна чернетка)

Працює поверх офіційного `POST/PUT …/draft`. На кожну зміну пише знімок у `localStorage` (`useReserveDraft`). Вихід **не** блокується `useUnsavedGuard`.

Після повернення до редагування або після збою між прогресбаром і першим списком позицій з’являється `ReserveDraftBanner`: **Продовжити** / **Лишити збережене**.

Деталі API та підключення в інших документах: [`reserve-draft.md`](../architecture/reserve-draft.md).

---

## Поле `portionsPerBox`

У каталозі 2.0 задається на рівні `catalog_goods` / відображення в UI інвентаризації. `portionsPerBox > 1` → порційний товар.
