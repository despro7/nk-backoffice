# План: документи Dilovod і цикли відвантаження замовлення

Статус: план, не реалізовано. Розвиває `Docs/plans/shipment-payload-refactor.md` і `Docs/integrations/dilovod-shipment-cycles.md`.

## Проблема

Замовлення може пройти кілька циклів: відвантаження, повернення, повторне відвантаження. А локально все зберігається одним значенням на замовлення:

- `orders.dilovodSaleExportDate` / `dilovodReturnDate`: лише дата останнього документа, попередні втрачаються.
- `orders.payloadData` (`shipment.bySku`): склад відвантаження перезаписується при кожній комплектації, склад першого циклу втрачається.
- Повернення бере склад останнього відвантаження, а не того, яке повертають.
- Звіти (`shippedOnly`) та історія руху товару рахують замовлення лише в день останнього відвантаження: перше списання зникає зі звіту свого дня.

Приклад: 24453. Відвантаження 02.10, повернення 13.10, повторне відвантаження 05.11. Після повторного відвантаження локально видно лише 05.11.

## Цільова модель

Два доменні сховища замість полів на `orders`:

1. **`order_dilovod_documents`**: дзеркало документів у Dilovod (що там є, з датами й номерами).
2. **`order_shipments`**: що фізично зібрано в кожному циклі комплектації, з посиланням на свої `sale` / `saleReturn`.

```prisma
model OrderDilovodDocument {
  id         Int      @id @default(autoincrement())
  orderId    Int
  type       String   @db.VarChar(32)   // saleOrder | cashIn | sale | saleReturn
  dilovodId  String   @unique @db.VarChar(32)
  number     String?  @db.VarChar(64)
  docDate    DateTime
  source     String   @db.VarChar(16)   // sync | export | migration
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  order      Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  @@index([orderId])
  @@index([type, docDate])
  @@map("order_dilovod_documents")
}

model OrderShipment {
  id               Int       @id @default(autoincrement())
  orderId          Int
  cycle            Int                   // 1, 2, ...
  pickedAt         DateTime
  pickedBy         Int?
  schemaVersion    Int
  source           String    @db.VarChar(16)   // orderView | manualAdjustment | migration
  summary          Json                  // shipmentSummary: облік, списання, експорт
  manifest         Json?                 // packingManifest: коробки, лінії, рішення
  saleDocumentId   Int?                  // -> OrderDilovodDocument (sale)
  returnDocumentId Int?                  // -> OrderDilovodDocument (saleReturn)
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  order            Order     @relation(fields: [orderId], references: [id], onDelete: Cascade)
  @@unique([orderId, cycle])
  @@index([pickedAt])
  @@map("order_shipments")
}
```

### Формат `summary` і `manifest`

Беремо з `shipment-payload-refactor.md` з двома змінами:

- **Два шари, а не три.** Окремий шар `packing` дублює `itemMode` у summary і `decisions` у manifest, тому його прибираємо.
- **Без `accGood` на кожному SKU.** `DilovodExportBuilder` лише порівнює `accGood` з константою монолітного набору; цю ознаку несе `itemMode: "monolithic"`.

Summary: `{ version, mode, totals, bySku: { [sku]: { quantity, itemMode } } }`, де `itemMode` – `regular | monolithic | legacy_regular`, і містить **усі** відвантажені SKU, а не лише моноліти. Manifest: коробки, лінії, `decisions` (як у старому плані).

## Етапи

### Етап 1. `order_dilovod_documents`

- Схема, міграція (`migrate dev --create-only`, перегляд SQL, застосування після підтвердження).
- `server/services/dilovod/orderDilovodDocuments.ts`: `recordOrderDilovodDocuments` (upsert за `dilovodId`), `reconcileOrderDilovodDocuments` (прибирає документи, яких у Dilovod уже немає). Spec поруч.
- Запис із синхронізації `DilovodService` (головне джерело), автоекспорту `saleOrder` / `sale`, ручного експорту (`routes/dilovod.ts`), повернень (`ReturnsHistoryController`), оплат (`CashInExportBuilder`). `reset-and-check` видаляє записи замовлення перед повторною синхронізацією.
- `DilovodApiClient.getDocuments`: повідомляти про неповну відповідь (зараз помилки пачки тихо ковтаються); при неповній відповіді reconcile нічого не видаляє. Додати поле `number`.
- `GET /salesdrive/orders` віддає `dilovodDocuments` одним запитом на сторінку; тултіп показує весь ланцюжок.
- Поля `orders.dilovod*` лишаються і оновлюються як зараз.

### Етап 2. `order_shipments`

- Новий цикл при кожному переході в статус `3` (`PUT /orders/:id/status`): `summary` будується з поточного `payloadData` + позицій замовлення, `manifest` поки `null`.
- Після успішного експорту `sale` цикл отримує `saleDocumentId`; повернення отримує `returnDocumentId` останнього неповерненого циклу.
- Повернення на склад бере склад зі свого циклу.
- `payloadData` пишеться як і раніше (копія останнього циклу).
- Перевірити списання монолітів при повторному відвантаженні: зараз `shouldDeductMonolithicStock` спрацьовує лише на першому переході 2 → 3.

Етапи 1 і 2 можна зробити однією міграцією.

### Етап 3. Новий формат складу (фази 1–3 старого плану)

- Контракти `summary` / `manifest`, `schemaVersion`.
- Клієнт (`OrderView`, `orderAssemblyUtils`) будує summary і manifest з `expandedItems`, коробок і рішень комплектувальника.
- Експорт `sale`, списання і повернення читають цикл через адаптер `readShipmentSummary(order)`: спершу `order_shipments`, fallback на `payloadData` (dual-read).

### Етап 4. Звіти по днях відвантаження

- `shippedOnly`-звіти, `inventoryProductHistoryMovements`, `orderShipmentMetricsService` рахують кожен цикл у день його `sale` з `order_shipments` + `order_dilovod_documents`.

### Етап 5. Міграція старих даних і прибирання старого формату

Після випробування нового інтерфейсу на нових замовленнях.

**5.1. Скрипт backfill документів** (`scripts/backfill-dilovod-documents.ts`)
- Для всіх замовлень із `dilovodDocId`: `saleOrder`, `cashIn`, `sale`, `saleReturn` з Dilovod API пачками по 50 договорів з паузами. Дані відновлюються повністю.
- Режими `--dry-run`, `--from-id`, `--limit`; ідемпотентний (upsert), можна перезапускати.

**5.2. Скрипт backfill циклів** (`scripts/backfill-order-shipments.ts`)
- Цикли: кожен документ `sale` = один цикл; `pickedAt` з відповідного переходу в статус `3` в `orders_history` (fallback: дата `sale`); повернення привʼязується до циклу за датою.
- Склад циклу береться з **табличної частини документа `sale` у Dilovod** (`getObject`: товари, кількості, `accGood`). Це фактично відвантажений склад, у тому числі для першого циклу, який локально вже перезаписаний. `itemMode` визначається з `accGood`. Перед написанням скрипта перевірити на реальному документі, що `getObject` віддає `tpGoods` з `accGood` (наш експорт пише їх саме туди).
- Fallback, якщо документ недоступний: останній цикл з `payloadData` + `orders.items`, позначка `source: migration`, `summary.compatibility: "legacy_payload"`.
- `manifest` для старих циклів: `null` (коробок і рішень комплектувальника в старих даних немає, відновити їх неможливо).
- Один запит `getObject` на кожен `sale`: тисячі запитів, тому пачками, з паузами, з продовженням з місця зупинки.

**5.3. Звірка**
- Скрипт-звірка: для кожного замовлення порівнює старі поля (`dilovodSaleExportDate`, лічильники, `payloadData.shipment.bySku`) з новими таблицями, звіт розбіжностей.
- Порівняння звітів за кілька місяців: старий розрахунок проти нового.

**5.4. Прибирання старого формату**
- Перевести всіх читачів `payloadData` на адаптер, потім адаптер лише на `order_shipments`.
- Прибрати запис `payloadData`, потім окремою міграцією видалити колонку (після бекапу).
- Поля `orders.dilovodSaleExportDate`, `dilovodSaleDocsCount`, `dilovodReturnDate`, `dilovodReturnDocsCount`, `dilovodCashInDate`: рішення окремо. Рекомендація: лишити як денормалізований кеш останнього стану, який оновлює лише `orderDilovodDocuments.ts` (на них тримаються фільтри, сортування, індекси і lock повторного відвантаження). Повне видалення можливе, але потребує переписати ці місця на join.

**Передумови для етапу 5:** бекап БД, кілька тижнів dual-write без розбіжностей у звірці, dry-run на копії.

## Ризики

- Ліміти Dilovod API під час backfill: пачки, паузи, продовження з місця зупинки.
- Старі замовлення без документа `sale` (відвантажені до інтеграції): цикл лише з `payloadData` / `items`, з позначкою.
- Перехідний період із двома джерелами: читати лише через адаптер, не напряму.
