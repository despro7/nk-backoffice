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

- `ReturnsHistoryController` блокує друге повернення того самого замовлення.
- Ручне відвантаження (`POST /api/dilovod/salesdrive/orders/:id/shipment`) не знає про повторні цикли.
