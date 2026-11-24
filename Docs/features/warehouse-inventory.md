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

- `GET /inventory/:id/deviation-hints` – ймовірні причини відхилень сесії (див. «Аналізатор ймовірних причин»); відповідь `{ success, data: DeviationHintsResponse }`

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

## Аналізатор ймовірних причин

Rule-based (без LLM, без нових таблиць): зіставляє відхилення сесії (факт − облік по SKU) з «відбитками» операцій. Код: `server/modules/Warehouse/inventoryDeviationAnalyzer/`, типи `shared/types/inventoryDeviationHints.ts`, математика відхилень `shared/utils/inventoryDeviation.ts`, спільні парсери операцій `server/modules/Warehouse/inventoryOperationParsing.ts` (їх же використовує `product-history`).

- **Склад:** лише власний склад сесії (МС або ГП). Звʼязок МС↔ГП між сесіями не аналізується.
- **Вікно:** від `inventoryDate` попередньої завершеної сесії того ж складу до `inventoryDate` + 6 год, максимум 14 днів.
- **Кандидати:**
  - Комплектація: віртуальний кандидат на кожен набір з відхиленням `k` (`{набір: +k, компонент: −k·q}`), лише якщо відхиляється ще й компонент. Якщо в вікні є реальна комплектація / розкомплектація з тим самим SKU і кількістю, вона стає `reference`, тип `kit_not_done`; інакше `kit_unposted`. Реальні комплектації також іду кандидатами.
  - Замовлення: кожна подія відвантаження (документ sale) дає вектор по SKU сесії: `order_unposted` (відвантажено, не проведено або проведено двічі) і `order_not_shipped` (проведено, не відвантажено).
  - Переміщення (`WarehouseMovement`, не `deleted`, що торкаються складу): проведений ефект з обома знаками та різниця `submittedItemsSnapshot` / `receivedItemsSnapshot`; тип `movement_mismatch`. Додатково одно-SKU кандидати по кожному рядку («рядок не переміщено» / «переміщено без документа», `movementLineCandidates.ts`, `prior` 0.9, щоб документ цілком вигравав при рівному збігу).
  - Пересорт у комплектуванні (`kitSwapCandidates.ts`, тип `kit_swap`, поле `swap`): «не той компонент» (у документі списано B, фізично взято A: `{A: −t, B: +t}`; A тієї ж категорії, що B, або компонент іншого набору; `prior` 0.8) і «не той набір» (проведено S1 × q, зібрано S2 × q: склад(S2) − склад(S1); `prior` 0.85). Розкомплектація дзеркальна. Пересорт у замовленнях не шукається: сканування ШК при збиранні його практично виключає.
  - Кількість у комплектації: віртуальний кандидат набору лінкується до найближчої комплектації цього набору з будь-якою кількістю; поле `kit { postedQty, impliedQty }` («проведено 5, фізично 3»).
  - Повернення (`returnCandidates.ts`, вікно назад 45 днів): замовлення у статусі 6/7 з відвантаженням, але без `dilovodReturnDate` дає `return_unposted` (`+склад`); `dilovodReturnDocsCount > 1` дає `return_duplicated` (`−склад` × зайві документи). Відкриваються в дровері замовлення.
- **Скоринг** (`scoreHypotheses.ts`): `explained` = Σ min(|D|, |v|) там, де знаки збігаються; `conflict` = Σ|v| при протилежному знакові або D = 0; `score` = (explained − 0.5·conflict) / Σ|v| з бонусом за кількість різних SKU й близькість до дати інвентаризації, помножений на `prior` кандидата (типово 1). Одно-SKU кандидати з однаковим вектором схлопуються в одну гіпотезу з `similarCount` (довіра `low`). Жадібний добір: найкращий кандидат віднімається із залишку, максимум 5, `score < 0.4` відкидається. Довіра: `high` ≥ 0.85 з точним збігом кількостей, `medium` ≥ 0.6, інакше `low`; `kit_swap` без документа не вище `medium`.
- **Закономірності залишку** (`chronicSkus.ts`, `previousSessions.ts`): для непояснених SKU береться 6 попередніх завершених сесій того ж складу; знак відхилення збігається у ≥ 3 з них, тоді `pattern: { kind: 'chronic', hits, history }`. `countingNoise: true`, якщо гіпотез немає, патернів немає, а ≥ 70% залишку (мінімум 3 SKU) це ±1.
- **Важливо:** завершення інвентаризації лише ставить `status = completed` і не коригує облік (документи надлишків / списань не створюються). Тому непроведене відхилення переходить у наступні сесії, і «хронічне» найчастіше означає відхилення, не закрите після минулої інвентаризації, а не помилку підрахунку.
- **Обмеження:** у подіях відвантаження немає складу, тому замовлення порівнюються і з МС, і з ГП; при більш ніж 400 000 пар (подія × SKU) відвантаження рахуються лише для SKU з відхиленням.
- **Клієнт:** `useDeviationHints(sessionId, enabled)` (запит лише при відкритій панелі й наявних відхиленнях) і обгортка `InventoryDeviationHints` (банер `InventoryDeviationHintsBanner` у warning-кольорах + дровер замовлення) у `InventorySessionDetailPanel` і в розгорнутому записі вкладки «Історія». Згорнуто «N ймовірні причини · пояснюють X з Y од.», розгорнуто картки гіпотез і список «Не пояснено» з чипами «Хронічне (N з 6)» та підказками за знаком (плюс: неоприбутковані надлишки / повернення, мінус: несписаний брак) або блоком «Схоже на помилки підрахунку». Замовлення відкривається в дровері (право `ACTION_DILOVOD_EXPORT`). Після «Оновити облікові залишки» запит інвалідується.

## Кеш історії товару

`GET /inventory/product-history` рахує рухи дня з контексту дня (`inventoryProductHistoryMovements.ts`): усі документи дня (відвантаження, комплектації, повернення, списання, переміщення) вантажаться один раз і кешуються в памʼяті сервера на день (`YYYY-MM-DD`), рухи SKU рахуються з кешу без звернень до БД.

- **TTL:** налаштування `settings_base.inventory_history_cache` `{ recentDayTtlMinutes, pastDayTtlMinutes }` (типово 1 і 30 хв; межі 0–60 і 0–1440; 0 = не кешувати). Редагується в «Налаштування комплектування замовлень» (`/settings/order-assembly`), картка «Кеш історії товару в інвентаризації».
- **API:** `GET` / `PUT /api/settings/inventory-history-cache`, `POST /api/settings/inventory-history-cache/clear` (скидає кеш усіх днів).
- **Скидання з UI:** сіра кнопка «Скинути кеш» під історією товару в рядку таблиці (доступна всім): скидає кеш і перезавантажує історію SKU без зникнення таблиці.
- Паралельні запити того самого дня ділять одне завантаження; помилки не кешуються; максимум 120 днів у памʼяті.
- Події відвантаження (`loadShipmentEvents`) розгортають набори з пакетною попередньою вибіркою каталогу (`prefetchProductsForExpansion` + `ProductLookupCache`) замість запиту на кожен SKU.

---

## Поле `portionsPerBox`

У каталозі 2.0 задається на рівні `catalog_goods` / відображення в UI інвентаризації. `portionsPerBox > 1` → порційний товар.
