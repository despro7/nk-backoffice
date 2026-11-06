# Dilovod: цикли відвантаження, повторне відвантаження, контрагент договору

Як backoffice створює `documents.sale` для замовлення, яке вже відвантажували, і як тримає в порядку позначки «невідвантажено» та контрагента договору.

## Документи замовлення в Dilovod

| Документ | Звʼязок | Локальні поля `orders` |
|---|---|---|
| `documents.saleOrder` | договір (`baseDoc` / `contract` для решти) | `dilovodDocId`, `dilovodExportDate` |
| `documents.cashIn` | `baseDoc` = saleOrder | `dilovodCashInDate` |
| `documents.sale` | `baseDoc` / `contract` = saleOrder | `dilovodSaleExportDate` (дата останнього), `dilovodSaleDocsCount` |
| `documents.saleReturn` | `contract` = saleOrder | `dilovodReturnDate` (дата останнього), `dilovodReturnDocsCount` |

Одне замовлення може пройти кілька циклів: відвантаження, відмова / повернення, повторне відвантаження. Тому кілька `sale` на одне замовлення не завжди дублікат.

Поля `orders.dilovod*` тримають лише **останній** стан (кеш для фільтрів, сортування і lock). Повна історія всіх документів – у `order_dilovod_documents` (див. нижче).

## Історія документів (`order_dilovod_documents`)

Одна строка на документ Dilovod: `orderId`, `type` (`saleOrder | cashIn | sale | saleReturn`), `dilovodId` (unique), `number`, `docDate`, `source` (`sync | export | migration`). Хелпер: `server/services/dilovod/orderDilovodDocuments.ts`.

- **Запис:** upsert за `dilovodId`, повторний запис оновлює лише дату й номер.
- **Синхронізація** (`DilovodService.checkOrders…`) – головне джерело: пише `saleOrder` і ті типи, які запитувала (`sale` для статусів ≥ 3, `cashIn` без дати оплати, `saleReturn` для 6/7 або кількох `sale`). Документи, яких у Dilovod уже немає, прибираються **лише** при повній відповіді (`DilovodApiClient.getDocumentsWithStatus` → `complete`; впала хоча б одна пачка – нічого не видаляємо).
- **Експорт:** авто- і ручний експорт `saleOrder` / `sale` (включно з повторним), повернення (`ReturnsHistoryController`), оплати з виписки (`CashInExportBuilder`). Помилка запису не ламає експорт (`recordOrderDilovodDocumentsSafe`).
- **Примусова перевірка** (`reset-and-check`) видаляє записи замовлення, синхронізація заповнює їх заново.
- `getDocuments` запитує поле `number`.
- **UI:** `GET /api/dilovod/salesdrive/orders` віддає `dilovodDocuments` (один запит на сторінку). Тултіпи колонки «Додано в Діловод» показують усі документи з номерами («Відвантажено №…», «Повернуто №…», «Повторно відвантажено №…»); без історії – fallback на поля `orders`.
- Старі замовлення заповнюються під час перевірки; масовий backfill – етап 5 плану `Docs/plans/dilovod-documents-and-shipment-cycles.md`.

## Цикли відвантаження (`order_shipments`)

Кожна комплектація – окремий цикл зі своїм складом: `orderId`, `cycle` (1, 2, …), `pickedAt`, `pickedById`, `source` (`picking | export | migration`), `summary`, `manifest`, `saleDocumentId` / `returnDocumentId` → `order_dilovod_documents`. Сервіс: `server/services/orderShipments.ts` (+ spec), формат складу: `shared/utils/shipmentRecord.ts` (+ spec).

- **Склад v2 (`schemaVersion: 2`)** будує клієнт (`OrderView` → `buildShipmentRecord`, `shared/utils/shipmentRecord.ts`) і надсилає в `PUT /status` полем `shipment` поруч із `payloadData`. Типи: `shared/types/orderShipments.ts`.
  - `summary` v2: `items` (позиції верхнього рівня з `itemMode`: `regular | monolithic | forced_regular`), `monolithic` (усі SKU, відвантажені монолітом, на будь-якій глибині), `mode`, `totals` (позиції, моноліти, коробки). `accGood` не зберігається.
  - `manifest` v1: `boxes` (номер, назва, `hardCap` = `qntTo`, `usedPortions`, рядки `monolithic_set | set_unit | product`, `split` для розділених наборів), `looseLines` (без коробки), `unallocated` (не влізло), `decisions` (`forced_regular` / `operator_override`).
  - Моноліти – рівно набори з `dynamicMonolithic`, як у `payloadData` (spec порівнює з еталонною старою логікою). `set_unit` – набір монолітної категорії: пакується цілим, в обліку розкладається.
  - `parseShipmentRecordV2` перевіряє форму і розмір (≤ 200 KB); некоректний або відсутній склад не блокує статус, цикл пишеться у v1.
- **Склад v1** (без v2 від клієнта, експорт без комплектації): знімок `orders.items` + `monolithicBySku` з `payloadData.shipment.bySku`.
- **Читання:** `readMonolithicSkus` (v2 / v1 / старий `payloadData`), `getShipmentSummaryItems`, `monolithicSkusToLegacyPayload`.
  - `DilovodExportBuilder.buildSalePayload`: моноліти з відкритого циклу (`getOpenShipmentMonolithicSkus`), без циклу – `payloadData`; явний `payloadDataOverride` (ручне відвантаження) має пріоритет.
  - Списання монолітів у `PUT /status` – з v2, якщо він є.
  - Повернення – склад циклу будь-якої версії.
  - Звіти відвантажень – через події відвантаження (див. нижче).
- **Комплектація** (`PUT /api/orders/:id/status` → `3`, до запуску auto-export): якщо останній цикл ще без `sale` – оновлюється (перекомплектація), інакше при зміні статусу створюється новий.
- **Привʼязка відвантаження:** після кожного запису документів (`recordOrderDilovodDocumentsSafe`, синхронізація) `reconcileOrderShipments` дає відкритому циклу найраніший неприв'язаний `sale`, створений не раніше за комплектацію (допуск 12 год). Старі відвантаження до нової комплектації не прилипають.
- **Без відкритого циклу:** щойно експортований нами `sale` (статус 3 прийшов із SalesDrive) отримує цикл `source: export` з поточним складом. Відвантаження, знайдені синхронізацією, циклів не створюють (старі – backfill, етап 5).
- **Привʼязка повернення:** до циклу з найпізнішим `sale`, не пізнішим за повернення, без повернення.
- `orders.payloadData` пишеться як і раніше (копія останньої комплектації).
- **UI:** `GET /api/dilovod/salesdrive/orders` віддає `shipments`; тултіп відвантаження показує під кожним `sale` склад циклу («Позицій: N, з них монолітних: M») і окремо цикли «Скомплектовано, без відвантаження».

## Звіти відвантажень (події відвантаження)

`server/services/shipmentEvents.ts` (+ spec): `loadShipmentEvents({ range, status })` – по події на кожен документ `sale` у періоді.

- Документ привʼязаний до циклу: склад циклу (`items` = позиції циклу, `payloadData` = моноліти циклу у старому форматі), позиції розгортаються `orderDatabaseService.expandOrderItemsForReport` (той самий код, що й `orders_cache.processedItems`).
- Документ без циклу: поточний склад замовлення і `orders_cache`.
- Замовлення без жодного `sale` у `order_dilovod_documents`: як раніше, за `orders.dilovodSaleExportDate`.
- Дата події – `docDate` документа (у полі `dilovodSaleExportDate` події); ключ `reportKey` = `externalId#dilovodId` (кеш позицій, React key).
- Статус: для подій з документом поточний статус замовлення не фільтрується (документ доводить відвантаження; інакше відвантаження повернених замовлень випадали б). Для замовлень без документів – фільтр як у `getOrders`.
- Повернення зі звіту не віднімаються (звіт – що фізично відвантажено в день).
- Споживачі: `GET /api/orders/products/stats`, `/products/orders`, `/products/stats/dates` у режимі `shippedOnly` з датами; історія руху товару (`inventoryProductHistoryMovements`, без фільтра статусу). Режим «за датою замовлення» не змінено.
- Звірка і діагностика: `npm run reports:compare-shipped -- --from=YYYY-MM-DD --to=YYYY-MM-DD [--status=…] [--cycles-since=ISO] [--limit=50] [--verbose]` (лише читання):
  1. стара логіка проти подій: порції і монолітні набори, різниця по замовленнях, SKU і наборах;
  2. діагностика кожного замовлення, скомплектованого або відвантаженого в періоді: `[error]` немає циклу після `--cycles-since` (момент деплою етапу 2), моноліти останнього циклу ≠ `payloadData`, `sale` після комплектації без циклу; `[warn]` цикл v1 замість v2 (старий кеш сторінки), v2 без `manifest`, цикл без відвантаження > 1 доби при статусі 4–5, повернення без циклу, лічильники `orders` ≠ таблиця документів; `[info]` документи ще не синхронізовані (до backfill, список – з `--verbose`).

## Повернення

- `GET /api/warehouse/returns/prepare` бере склад із циклу, який повертаємо (`findReturnableShipment`: останній з `sale` без повернення); без циклів – як раніше з `orders.items` / `payloadData`.
- Доступність повернення: `isLastShipmentReturned` (`shared/utils/dilovodShipmentCycle.ts`) – блок лише коли останнє відвантаження вже повернуте. Після повторного відвантаження можна оформити нове повернення. Те саме правило в `prepare`, `send` і пошуку замовлень на складі.
- Перед відправкою в Dilovod `send` порівнює кількість `saleReturn` і `sale` (`needsNewSaleDoc`); бейдж «Дубль» у пошуку – `isReturnDuplicate`.
- `SHIPMENT_MONOLITHIC_ACC_GOOD` (рахунок монолітного набору) – одна константа в `shared/utils/dilovodShipmentCycle.ts`.

## Дати останнього документа в синхронізації

Синхронізація записує в `dilovodSaleExportDate` / `dilovodReturnDate` дату **найновішого** документа (`latestDocDate`), а не першого знайденого. Дата оновлюється, якщо локальної немає або документ у Dilovod новіший більш ніж на 12 год (допуск: дата першого циклу береться з комплектації і трохи відрізняється від дати документа).

## Правила (pure: `shared/utils/dilovodShipmentCycle.ts`)

- `resolveShipmentCycle`: `first` (відвантаження ще не було), `already_shipped` (є відвантаження без повернення), `repeat_candidate` (після відвантаження є повернення).
- `needsNewSaleDoc(S, R)`: новий `sale` потрібен, коли всі відвантаження повернуті (`S <= R`).
- `isSaleDuplicate(S, R)`: дублікат, коли `S > R + 1`. Фільтр «Дублікати відвантажень» і бейдж у таблиці беруть саме це правило (`getSaleDuplicateOrderIds`).
- `isReturnDuplicate(R, S)`: дублікат повернення, коли `R > max(S, 1)`.
- `isRepeatPicking(lastPickedAt, firstShipmentAt)`: повторна комплектація, якщо остання комплектація (останній запис `orders_history` зі статусом `3`) пізніша за перше відвантаження більш ніж на 6 год. Поріг відсікає відлуння статусу `3` і годинний зсув TZ у старих даних.

## Авто-відвантаження (`DilovodAutoExportService.tryAutoShipment`)

1. `already_shipped` без повторної комплектації: пропуск.
2. `already_shipped` з повторною комплектацією або `repeat_candidate`: lock береться з `repeatOf` (поточна `dilovodSaleExportDate` не має змінитись між перевіркою і lock).
3. Звірка з Dilovod: кількість `sale` і `saleReturn`; локально оновлюються `dilovodReturnDocsCount` і `dilovodReturnDate`.
4. Якщо новий `sale` не потрібен: фіксується стан із Dilovod. Повторна комплектація без повернення в Dilovod: `sale` не створюється (подвійне списання), пишеться error-лог `Auto repeat shipment blocked (sale)`.
5. Інакше створюється `sale` з датою останньої комплектації (`saleDateOverride`), `dilovodSaleDocsCount = S + 1`.

Локальне списання монолітних залишків при повторній комплектації не робиться: повернення не повертає локальний залишок.

## Контрагент договору (`DilovodExportFlowService.sendSale`)

Контрагент для `sale` шукається за телефоном із локальної БД. Якщо менеджер виправив телефон клієнта в SalesDrive після створення замовлення, saleOrder лишається на контрагенті зі старим номером, і Dilovod відхиляє `sale`:

```
%contract% зареєстровано на %person%|<saleOrderId>|<personId>
```

`sendSale` (авто і ручне відвантаження) ловить цю помилку (`parseContractPersonMismatch`) і:

1. `DilovodService.reassignOrderDocumentsPerson`: перепривʼязує saleOrder, потім його `cashIn`, `sale`, `saleReturn` зі старого контрагента на знайденого за актуальним телефоном. Документи з іншим контрагентом не чіпає.
2. Оновлення часткове (`updateDocumentHeader`: лише `person`, `saveType` 1 для проведених документів). Після кожного документа звіряється контрагент і кількість рядків табличних частин; розбіжність зупиняє процес з помилкою.
3. Пише лог `Contract person fixed (saleOrder)` (success зі списком документів або error).
4. Повторює `sale` один раз.

## Позначка «невідвантажено»

Замовлення потрапляє у фільтр «Невідвантажені» і в сповіщення через активні error-логи відвантаження в `meta_logs` (title / message містить `shipment` або `відвантаж`, без `hiddenBy._all`).

- Успішне відвантаження (`completeSaleShipmentLock`: авто, ручне, синхронізація з уже наявним `sale`) приховує ці логи (`hideShipmentErrorLogs`). Інші логи замовлення не чіпаються.
- Примусова перевірка (`POST /api/dilovod/salesdrive/orders/reset-and-check`) приховує їх на сервері для замовлень, де знайдено відвантаження, і повертає `hiddenShipmentErrorLogs`.

## Відомі обмеження

- Ручне відвантаження (`POST /api/dilovod/salesdrive/orders/:id/shipment`) не знає про повторні цикли.
