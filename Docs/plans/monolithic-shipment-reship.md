# Монолітні комплекти: надійне збереження складу відвантаження та повторне відвантаження в Діловод

> Статус: **пропозиція, код не імплементовано**.
>
> Документ доповнює [`Docs/plans/shipment-payload-refactor.md`](./shipment-payload-refactor.md).
> Той план описує **формат** payload для аналітики. Цей — описує **джерело істини**,
> **резервний ручний метод** позначення монолітності та **процедуру виправлення**
> вже відвантажених замовлень (delMark + повторне відвантаження).

---

## 1. Як це працює зараз

### 1.1 Ланцюжок даних

```
Комплектування (браузер)                Сервер                        Діловод
─────────────────────────               ──────                        ───────
expandProductRecursively()
  ├ set у монолітній категорії?  ─┐
  ├ залишок набору > 0?          ─┼─► shouldTreatAsMonolithic
  └ operator override (сесія)    ─┘         │
                                            ▼
                              item.dynamicMonolithic = (залишок > 0)
                                            │
                          shipmentPayloadData = { shipment: { bySku } }
                                            │
                          PUT /api/orders/:id/status (status=3)
                                            │
                         ┌──────────────────┼──────────────────┐
                         ▼                  ▼                  ▼
                  Order.payloadData   списання складу 2   auto-shipment
                         │                                     │
                         │                          buildSalePayload()
                         │                                     │
                         ▼                          accGood = 1119000000001079
                     Звіти                           (набір НЕ розгортається)
```

### 1.2 Формат зберігання

Єдине місце, де фіксується факт «набір відвантажено монолітно» — JSON-поле
`Order.payloadData` (`prisma/schema.prisma:49`):

```json
{ "shipment": { "bySku": { "SET-001": { "accGood": "1119000000001079", "quantity": 2 } } } }
```

Ознакою монолітності є **сама наявність ключа** в `bySku`
(`server/services/orderShipmentMetricsService.ts:319`), а `accGood` — константа
`DILOVOD_CONSTANTS.SHIPMENT_MONOLITHIC_ACC_GOOD`
(`server/services/dilovod/DilovodExportBuilder.ts:40`).

### 1.3 Хто це пише і читає

| Роль | Місце |
|---|---|
| Формує | `client/pages/OrderView.tsx:158-178` (браузер) |
| Передає | `client/hooks/useOrderNavigation.ts:138-146` |
| Зберігає | `server/routes/orders.ts:1099-1108` |
| Списує залишки | `server/routes/orders.ts:81-135` (склад `'2'`) |
| Експортує | `DilovodExportBuilder.getShipmentAccGoodOverride()` + `expandSku()` |
| Реплеїть в UI | `OrderView.tsx:563-596` → `expandProductSets(..., useShipmentPayloadMode=true)` |
| Звіти | `orderShipmentMetricsService.ts` → `/api/orders/products/stats`, `/products/orders`, `/products/stats/dates` |
| Повернення | `client/pages/Warehouse/WarehouseReturns/*` (`shippedAsMonolithic`) |
| Інвентаризація | `server/modules/Warehouse/WarehouseController.ts:1863-1911` |

---

## 2. Дефекти поточної схеми

### D1. Payload не збігається з тим, що бачив комплектувальник (корінь проблеми)

Набір вважається монолітним, якщо **категорія в списку АБО залишок > 0**:

```323:325:client/lib/orderAssemblyUtils.ts
      const shouldTreatAsMonolithic = useShipmentPayloadMode
        ? shipmentSaysMonolithic
        : (!isForcedRegularSet && (effectiveRemaining > 0 || (categoryIdStr && Array.isArray(monolithicCategories) && monolithicCategories.includes(categoryIdStr))));
```

Але в payload потрапляють **тільки** позиції з `dynamicMonolithic`, тобто лише ті, у яких залишок > 0:

```159:162:client/pages/OrderView.tsx
    const bySku = expandedItems.reduce<Record<string, { accGood: string; quantity: number }>>((accumulator, item) => {
      if (item.type !== 'product' || !item.sku || !item.dynamicMonolithic) {
        return accumulator;
      }
```

Набір із налаштованої монолітної категорії з нульовим обліковим залишком показується комірнику як
монолітний, збирається як монолітний — і при цьому вивантажується в Діловод **розгорнутим на компоненти**,
а у звітах рахується як звичайні порції. Це і є той сценарій «неправильного складу через помилку
визначення», який треба вміти виправляти.

### D2. Залишок рахується по всіх складах, а списується з одного

`effectiveStockTotal` підсумовує всі склади (`orderAssemblyUtils.ts:301-315`), а списання йде лише зі
складу `'2'` (`server/routes/orders.ts:116`). Набір, що фізично лежить на складі `'1'`, вважається
монолітним, але списання не відбувається.

### D3. Джерело істини — браузер, сервер не валідує

Сервер записує `payloadData` як є (`orders.ts:1104`), без перевірки, що SKU існує, що це справді набір,
що кількість не перевищує замовлену і що `accGood` коректний. Два комірники з різним станом кешу товарів
дадуть різний результат для того самого замовлення.

### D4. `payloadData` перезаписується цілком

`data: { ...(payloadData !== undefined ? { payloadData } : {}) }` — це заміна, не злиття. Будь-яка інша
секція в `payloadData` буде втрачена. Це блокує двошаровий формат із
[`shipment-payload-refactor.md`](./shipment-payload-refactor.md).

### D5. Монолітність закодована неявно

`shipmentSkuSet.has(sku)` — «є ключ, отже монолітний». Немає явного режиму. Немає різниці між
«відвантажено порціями» і «інформації немає» (замовлення до впровадження фічі, payload не долетів,
помилка мережі). Звіти трактують обидва випадки однаково.

### D6. Історія «пливе» при зміні складу набору

Звіти розкладають монолітний набір на компоненти через **поточний** `Product.set`
(`expandSetToLeaves` + `getReportProductDescriptors`). Якщо BOM набору змінили після відвантаження,
звіт за минулий місяць мовчки зміниться.

### D7. Автовідвантаження не бачить payload

`tryAutoShipment` викликає `buildSalePayload(orderId, dilovodDocId)` **без** `payloadDataOverride`
(`DilovodAutoExportService.ts:484-487`) і покладається на те, що `loadOrder` прочитає вже збережений
`payloadData`. При ручній зміні статусу порядок правильний (транзакція → тригер), але для webhook
і cron-шляхів (`webhooks.ts`, `salesDriveService.processStatusChangedOrders`) payload може ще не бути
записаний — і набір поїде розгорнутим.

### D8. Stale-payload має пріоритет над свіжим

```1589:1593:server/routes/dilovod.ts
    const shipmentPayloadSource = hasShipmentPayload(order.payloadData)
      ? order.payloadData
      : hasShipmentPayload(payloadData)
        ? payloadData
        : undefined;
```

БД завжди виграє у тіла запиту. Передати виправлений склад через API неможливо, поки в БД лежить старий.

### D9. ID документа відвантаження не зберігається

`dilovodExportFlowService.send()` повертає `dilovodDocId` (`DilovodExportFlowService.ts:70`), але для
`documents.sale` він відкидається — пишеться лише `dilovodSaleExportDate` і `dilovodSaleDocsCount`
(`dilovod.ts:1611-1624`, `DilovodAutoExportService.ts:499-511`). Водночас код уже намагається його читати:

```422:422:server/services/dilovod/DilovodExportBuilder.ts
    const baseDoc = context.order.dilovodSaleDocId || context.order.dilovodDocId;
```

Поля `dilovodSaleDocId` у схемі немає — вираз завжди мовчки падає у fallback.

### D10. Немає жодного шляху виправлення

`dilovodSaleExportDate` + lock жорстко блокують повторне відвантаження на трьох рівнях
(локальна дата, `acquireSaleShipmentLock`, перевірка `getDocuments` в API). Єдиний обхід —
`POST /salesdrive/orders/reset-and-check`, який **чистить лише локальні поля**
(`dilovod.ts:925-937`), а документ у Діловоді лишається живим. Наступна ж перевірка знайде його
і знову заблокує. Виправити склад сьогодні можна тільки руками в інтерфейсі Діловоду.

### D11. Списання залишків одноразове і без компенсації

```1089:1089:server/routes/orders.ts
    const shouldDeductMonolithicStock = status === '3' && currentOrder.status === '2' && !currentOrder.readyToShipAt;
```

Спрацьовує рівно один раз. Якщо склад відвантаження виправити, залишки не перерахуються.

### D12. Ручні рішення оператора не зберігаються

- Квіз «чи є набір фактично?» (`MonolithicSetAvailabilityQuizModal`) — відповідь ніде не фіксується
  (`OrderView.tsx:782-797`), обидві гілки просто закривають модалку.
- Перемикач «Готовий комплект» живе в React-стані
  (`monolithicDisplayOverridesByOrder`, `OrderView.tsx:485-504`), зникає при перезавантаженні,
  показується лише для `portionsPerItem > 16` і лише при `order.status < 3`
  (`OrderAssemblyRightPanel.tsx:86-91, 244`), і вміє лише **знімати** монолітність, не ставити її.

Тобто резервного ручного способу позначити монолітність фактично не існує.

### D13. Звіти дорогі

Кожен звіт парсить JSON `payloadData` і рекурсивно розгортає набори в пам'яті для кожної пари
(замовлення × SKU). Агрегувати це в SQL неможливо, індексів немає.

---

## 3. Цільова модель

Три зміни, у порядку важливості:

1. **Рішення про монолітність приймає сервер**, а не браузер.
2. **Склад відвантаження зберігається як незмінний версійований знімок** у реляційних таблицях.
3. **Знімок можна перевипустити** — з видаленням старого документа в Діловоді.

### 3.1 Серверний резолвер

`server/services/shipment/MonolithicSetResolver.ts` — єдине джерело для чекліста, payload Діловоду,
списання залишків і звітів. Детермінований пріоритет правил:

| # | Правило | `decisionSource` |
|---|---|---|
| 1 | Збережений committed-знімок (для відвантажених замовлень) | `snapshot_replay` |
| 2 | Явний ручний override оператора/менеджера | `manual` |
| 3 | Відповідь на квіз наявності | `quiz` |
| 4 | `product.categoryId ∈ monolithic_assembly_categories` | `category` |
| 5 | Залишок готового набору на **складі МС** (`'2'`, той самий, з якого списуємо) | `stock` |
| 6 | Інакше — розгортати | `default_expanded` |

Клієнт лише відображає результат і може подати override; сервер його валідує (SKU існує, це набір,
кількість ≤ замовленої) і зберігає з автором і причиною.

### 3.2 Знімок складу відвантаження

Дві таблиці замість JSON-блоба.

**`order_shipment_snapshots`** — одна версія складу відвантаження:

| Поле | Призначення |
|---|---|
| `id`, `orderId`, `revision` | версійність (1, 2, 3…) |
| `status` | `draft` / `committed` / `superseded` / `failed` |
| `source` | `assembly_ui` / `manual_override` / `reship` / `migration` |
| `reason` | обов'язкова причина для ручних і reship-знімків |
| `createdBy`, `createdAt` | аудит |
| `dilovodSaleDocId` | **ID створеного `documents.sale`** |
| `dilovodSaleDate` | дата документа |
| `supersededById` | посилання на знімок, що замінив цей |
| `deletedDilovodSaleDocId`, `deletedAt` | що саме позначено на видалення |

**`order_shipment_lines`** — рядки знімка:

| Поле | Призначення |
|---|---|
| `snapshotId`, `sku`, `dilovodGoodId` | ідентифікація |
| `quantity` | кількість |
| `shipMode` | **`monolithic` / `expanded`** — явний режим замість «наявності ключа» (усуває D5) |
| `accGood` | рахунок обліку (наслідок режиму, а не його ознака) |
| `decisionSource` | звідки взялося рішення (таблиця 3.1) |
| `parentSku` | для розгорнутих компонентів |
| `setPortions`, `bomSnapshot` | **склад набору на момент відвантаження** (усуває D6) |

Що це дає:

- **D5** — режим явний, з'являється третій стан «немає знімка» = невідомо.
- **D6** — історія заморожена, зміна BOM не переписує минулі звіти.
- **D9/D10** — `dilovodSaleDocId` зберігається, з'являється історія ревізій.
- **D13** — звіти стають `GROUP BY` по індексованих колонках замість парсингу JSON.

`Order.payloadData` лишається на читання як legacy-fallback і поступово мігрує (бекфіл із
`shipment.bySku` → знімок revision 1 із `source='migration'`, усі рядки `shipMode='monolithic'`).

### 3.3 Нові поля `Order`

| Поле | Навіщо |
|---|---|
| `dilovodSaleDocId String?` | закриває D9 і робить можливим delMark; заодно лагодить `DilovodExportBuilder.ts:422` |
| `dilovodSaleState String?` | стан-машина відвантаження (розділ 5) |
| `activeShipmentSnapshotId Int?` | швидкий доступ до чинного знімка |

---

## 4. Резервний метод позначення монолітності

Мета — щоб правильність не залежала від автодетекту, і щоб помилку можна було виправити без розробника.

### 4.1 Ручний перемикач режиму (основний резерв)

Розширити наявний перемикач «Готовий комплект» до повноцінного інструменту:

- **двонаправлений**: не тільки «зробити порціями», а й «зробити монолітним»;
- **для всіх наборів**, а не лише `portionsPerItem > 16`;
- **персистентний** — пише рядок знімка з `decisionSource='manual'`, автором і причиною
  (зараз override живе в React-стані і зникає при F5);
- **доступний після статусу 3** для ролі `WAREHOUSE_MANAGER+` — саме тоді, коли помилку помічають;
  для вже відвантаженого замовлення зміна не застосовується мовчки, а створює `draft`-знімок
  і пропонує перевідвантаження (розділ 5).

### 4.2 Збереження відповіді на квіз

Відповідь у `MonolithicSetAvailabilityQuizModal` — це готовий людський сигнал про фактичну
наявність комплекту, який зараз викидається. Зберігати як рядок знімка з `decisionSource='quiz'`:
«Так» → `monolithic`, «Ні» → `expanded`. Це закриває D1 без будь-якого автодетекту.

### 4.3 Детектор розбіжностей

Фонова перевірка, яка формує список кандидатів на виправлення замість ручного пошуку:

1. Замовлення відвантажене, містить набір із монолітної категорії, але рядка `monolithic` у знімку немає
   (**прямий симптом D1**).
2. Знімка немає взагалі, а в замовленні є набори (legacy або загублений payload).
3. Склад `documents.sale` у Діловоді не збігається зі знімком (звірка через `getObject`).

Результат — вкладка «Потребують уваги» у звіті по відвантаженнях із кнопкою «Перевідвантажити».

### 4.4 Масова операція

Для вже накопичених помилок: вибір замовлень за періодом/SKU → «позначити SKU як монолітний
і перевідвантажити», з обов'язковим dry-run прев'ю і послідовним (не паралельним) виконанням —
Dilovod API однопотоковий (`DilovodApiClient` серіалізує запити через чергу).

---

## 5. Повторне відвантаження з видаленням старого документа

### 5.1 Механізм видалення

У Діловоді немає окремого `delete`. Використовується `saveObject` з `saveType: 2` і `delMark: 1` —
патерн, що вже працює для повернень, списань і випусків наборів
(`ReturnsHistoryController.ts:551-557`, `WriteOffController.ts:439`, `SetReleaseController.ts:560`):

```json
{ "saveType": 2, "header": { "id": "<sale doc id>", "delMark": 1 } }
```

Перевірити результат можна тим самим `getDocuments([baseDoc], 'sale')` — він уже фільтрує
`delMark = false` (`DilovodApiClient.ts:836-855`), тож після успішного видалення має повернути 0 рядків.

### 5.2 Стан-машина

```
shipped
   │  оператор запускає reship (причина обов'язкова)
   ▼
reship_pending ──► reship_marking_deleted ──► reship_deleted ──► shipped (нова ревізія)
                            │                       │
                            └──────► reship_failed ◄┘
```

`dilovodSaleState` персиститься **на кожному переході**, тому перерваний процес продовжується
з місця падіння, а не починається спочатку. Стан `reship_failed` означає «замовлення без
дійсного документа» і має бути помітним в UI.

### 5.3 Процедура `POST /api/dilovod/salesdrive/orders/:orderId/reship`

Вхід: `{ reason, composition?, dryRun? }`. Права: `WAREHOUSE_MANAGER+`.

| # | Крок | Захист |
|---|---|---|
| 0 | Перевірити права і що обліковий період не закритий | якщо закритий — заборонити видалення, запропонувати коригуючий документ |
| 1 | Захопити reship-lock (розширення `DilovodShipmentLockService`) | `tryAutoShipment` пропускає замовлення у стані `reship_*`, інакше cron створить паралельний документ |
| 2 | Знайти `dilovodSaleDocId`; якщо порожній — `getDocuments([dilovodDocId], 'sale')` і зберегти | якщо документів > 1 — **зупинитись**: це вже дублікати, потрібне окреме рішення оператора |
| 3 | Створити `draft`-знімок (ручний склад або перерахунок резолвером) | — |
| 4 | Побудувати payload і показати **diff «було / стане»** проти складу чинного документа | dry-run зупиняється тут; безглузді перевідвантаження не виконуються |
| 5 | Надіслати `delMark` на старий документ | `object not found` трактується як «уже видалено», не помилка |
| 6 | **Верифікувати**: `getDocuments([baseDoc], 'sale')` має повернути 0 | якщо ні — `reship_failed`, **новий документ не створюється** (інакше отримаємо дубль) |
| 7 | В одній транзакції: очистити `dilovodSaleExportDate`, `dilovodSaleDocsCount`, перенести старий ID у `deletedDilovodSaleDocId` | — |
| 8 | Створити новий `documents.sale` звичайним шляхом, зберегти `dilovodSaleDocId` | дата документа — **та сама** (`readyToShipAt`), щоб звіти за періодами не поїхали |
| 9 | Старий знімок → `superseded`, новий → `committed` | — |
| 10 | Компенсувати залишки: повернути списане за старим знімком, списати за новим | закриває D11 |
| 11 | Записати `meta_logs` (`category: dilovod`, `subcategory: reship`) з причиною, автором, diff, обома ID | — |

### 5.4 Крайові випадки

| Ситуація | Поведінка |
|---|---|
| Обліковий період закритий | Видалення заборонене. Потрібне узгодження з бухгалтерією: сторно/коригуючий документ замість delete+recreate. **Відкрите питання.** |
| Документ уже видалений вручну в Діловоді | Крок 5 повертає `not found` → продовжуємо з кроку 7 |
| Кілька `documents.sale` на один baseDoc | Зупинка зі списком документів; вирішує оператор (перетинається з наявним `reset-duplicate-count`) |
| Падіння між кроками 5 і 8 | Стан `reship_deleted` збережений; повторний виклик доробляє з кроку 7 |
| Замовлення має документ оплати (`cashIn`) або повернення | Перевірити залежності перед видаленням; за наявності — попередити оператора |
| Паралельний auto-shipment | Блокується reship-локом і перевіркою стану в `tryAutoShipment` |

---

## 6. Вплив на звіти

- `orderShipmentMetricsService` отримує другу реалізацію, що читає знімки; вибір джерела —
  за наявністю знімка для замовлення, з fallback на `payloadData` (dual-read на час міграції).
- `isMonolithicSet` перестає бути «наявністю ключа» і стає `shipMode === 'monolithic'`.
- Розкладання набору на компоненти бере `bomSnapshot` рядка, а не поточний `Product.set` — звіти за
  минулі періоди стають відтворюваними.
- Перевідвантажені замовлення читаються з `committed`-ревізії; `superseded` доступні для аудиту.
- Основні агрегати (`/products/stats`, `/products/stats/dates`) переїжджають у SQL.

---

## 7. Порядок впровадження

Етапи впорядковані так, щоб найгостріший біль зникнув першим, до великої міграції даних.

**Етап 1 — розблокувати виправлення.** Поле `Order.dilovodSaleDocId` + збереження ID при кожному
успішному відвантаженні (у т.ч. в auto-export); бекфіл ID для наявних замовлень через
`getDocuments`; endpoint `reship` зі стан-машиною, delMark, верифікацією і аудитом; кнопка
«Перевідвантажити» з підтвердженням і diff. Зачіпає `prisma/schema.prisma`,
`DilovodShipmentLockService`, `routes/dilovod.ts`, `DilovodAutoExportService`, `SalesDriveOrdersTable`.

**Етап 2 — резервне ручне позначення.** Персистентний двонаправлений перемикач режиму з причиною;
збереження відповіді квізу; доступ після статусу 3 для менеджера. Зачіпає `OrderView`,
`OrderAssemblyRightPanel`, `MonolithicSetAvailabilityQuizModal`, новий endpoint складу відвантаження.

**Етап 3 — серверний резолвер.** Перенесення правил із `orderAssemblyUtils` на сервер, вирівнювання
складу для перевірки залишку зі складом списання (D2), валідація вхідного payload (D3), передача
складу в `buildSalePayload` на всіх шляхах, включно з авто (D7), і пріоритет свіжого складу над
збереженим (D8).

**Етап 4 — знімки і звіти.** Таблиці `order_shipment_snapshots` / `order_shipment_lines`, бекфіл із
`payloadData`, dual-read у звітах, потім переведення агрегатів у SQL. Компенсація залишків (D11).

**Етап 5 — детектор розбіжностей і масові операції.** Звірка знімка з фактичним складом документа
в Діловоді, вкладка «Потребують уваги», масове перевідвантаження.

Етапи 1 і 2 самодостатні: після них помилку можна виправити руками без розробника, навіть якщо
етапи 3-5 ще не зроблені.

---

## 8. Ризики та відкриті питання

**Ризики**

1. **Видалення проведеного документа** зачіпає облік. Потрібен жорсткий контроль прав, обов'язкова
   причина і повний аудит.
2. **Вікно без документа** між кроками 5 і 8. Мінімізується верифікацією і станом `reship_failed`,
   але повністю не зникає — Діловод не має транзакцій.
3. **Ризик дубля**, якщо новий документ створити без підтвердженого видалення старого. Тому крок 6
   блокуючий.
4. **Бекфіл знімків** із `payloadData` неповний за визначенням: там немає режиму `expanded`
   і немає BOM на момент відвантаження. Мігровані знімки треба позначати `source='migration'`
   і трактувати обережно.
5. **Зміна семантики звітів** після переходу на знімки — цифри за минулі періоди можуть відрізнятися
   від поточних (бо перестануть залежати від актуального BOM). Це виправлення, але його треба
   узгодити з тими, хто цими звітами користується.

**Відкриті питання**

1. Чи допустимо видаляти `documents.sale` у закритому обліковому періоді, чи потрібне сторно?
2. Хто має право на перевідвантаження — `WAREHOUSE_MANAGER` чи тільки `ADMIN`?
3. Чи потрібно перевипускати фіскальний чек і ТТН при зміні складу відвантаження?
4. Що робити із замовленнями, де вже є `cashIn` або `saleReturn`, прив'язані до документа продажу?
5. Чи зберігати дату оригінального відвантаження, чи ставити фактичну дату виправлення?
   (пропозиція: зберігати оригінальну — інакше поїдуть звіти за періодами)

---

## 9. Зв'язані файли

| Файл | Роль |
|---|---|
| `prisma/schema.prisma` | `Order.payloadData`, `dilovodSale*`, майбутні таблиці знімків |
| `client/lib/orderAssemblyUtils.ts` | детекція монолітності при комплектуванні |
| `client/pages/OrderView.tsx` | формування payload, квіз, реплей знімка |
| `client/components/OrderAssemblyRightPanel.tsx` | перемикач «Готовий комплект» |
| `client/components/modals/MonolithicSetAvailabilityQuizModal/index.tsx` | квіз наявності |
| `client/components/SalesDriveOrdersTable.tsx` | ручні дії з Діловодом, місце для «Перевідвантажити» |
| `server/routes/orders.ts` | збереження payload, списання залишків, звітні endpoint-и |
| `server/routes/dilovod.ts` | `/shipment`, `/reset-and-check`, місце для `/reship` |
| `server/services/dilovod/DilovodExportBuilder.ts` | `buildSalePayload`, `accGood` override |
| `server/services/dilovod/DilovodAutoExportService.ts` | авто-експорт і авто-відвантаження |
| `server/services/dilovod/DilovodShipmentLockService.ts` | lock, який треба розширити під reship |
| `server/services/dilovod/DilovodApiClient.ts` | `getDocuments` з фільтром `delMark = false` |
| `server/services/orderShipmentMetricsService.ts` | метрики звітів по монолітних наборах |
| `server/modules/Warehouse/ReturnsHistoryController.ts` | референсна реалізація `delMark` |
