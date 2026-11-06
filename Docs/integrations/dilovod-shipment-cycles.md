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

Кожна комплектація – окремий цикл зі своїм складом: `orderId`, `cycle` (1, 2, …), `pickedAt`, `pickedById`, `source` (`picking | export | migration`), `summary`, `manifest` (етап 3), `saleDocumentId` / `returnDocumentId` → `order_dilovod_documents`. Сервіс: `server/services/orderShipments.ts` (+ spec).

- **Склад (`summary` v1):** знімок `orders.items` у момент комплектації + `monolithicBySku` з `payloadData.shipment.bySku` (без `accGood`). Рівно те, з чого `DilovodExportBuilder` будує `sale`. Новий формат – етап 3 плану.
- **Комплектація** (`PUT /api/orders/:id/status` → `3`, до запуску auto-export): якщо останній цикл ще без `sale` – оновлюється (перекомплектація), інакше при зміні статусу створюється новий.
- **Привʼязка відвантаження:** після кожного запису документів (`recordOrderDilovodDocumentsSafe`, синхронізація) `reconcileOrderShipments` дає відкритому циклу найраніший неприв'язаний `sale`, створений не раніше за комплектацію (допуск 12 год). Старі відвантаження до нової комплектації не прилипають.
- **Без відкритого циклу:** щойно експортований нами `sale` (статус 3 прийшов із SalesDrive) отримує цикл `source: export` з поточним складом. Відвантаження, знайдені синхронізацією, циклів не створюють (старі – backfill, етап 5).
- **Привʼязка повернення:** до циклу з найпізнішим `sale`, не пізнішим за повернення, без повернення.
- `orders.payloadData` пишеться як і раніше (копія останньої комплектації).
- **UI:** `GET /api/dilovod/salesdrive/orders` віддає `shipments`; тултіп відвантаження показує під кожним `sale` склад циклу («Позицій: N, з них монолітних: M») і окремо цикли «Скомплектовано, без відвантаження».

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
