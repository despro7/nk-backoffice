# Локальне оновлення статусу замовлення (комплектація)

## Проблема

Після комплектації UI показував «Підтверджено», хоча в історії вже було «На відправку» (`manual`, «Комплектував: …»).

Причина: `PUT /api/orders/:id/status` писав `readyToShipAt` + `orders_history`, оновлював SalesDrive, але **не** оновлював `Order.status` / `statusText`. Чіп читає таблицю `Order`; історія — `orders_history`. Якщо webhook SD не прийшов, локальний статус лишався `2`.

## Поведінка

### `PUT /api/orders/:id/status`

1. Одразу оновлює локально: `status`, `statusText`, при першому переході на `3` — `readyToShipAt`, історія комплектації, списання монолітних залишків.
2. SalesDrive — best-effort. Локальний успіх не залежить від SD/webhook.
3. Відповідь: `success: true`, `salesDriveUpdated: boolean`. Якщо SD впав — усе одно `success: true` з `salesDriveUpdated: false`.

Клієнт: `useOrderNavigation.updateCurrentOrderStatusToReady` — оптимістичний React-стан + цей PUT.

### Захист від відкату

Після локальної комплектації (`3`) застарілий webhook / sync із SalesDrive **не** може повернути статус у `1` / `2`.

Правило: `shouldSkipStatusSyncRollback` у `server/services/salesdrive/statusMapper.ts`, обгортка з БД `orderDatabaseService.isStaleStatusRollback`:

- перевіряється лише пара «локально `3`, incoming `1` / `2`»; усі інші переходи (`3→4→5`, `6→5`, `7→5`, вихід з утримання `9`, повторні цикли) приймаються з SD як є;
- блокуємо, якщо `rawData.updateAt` із SD (Europe/Kyiv) **не новіший** за момент локальної комплектації: це stale-дані, що «не знають» про комплектацію;
- якщо `updateAt` новіший: менеджер навмисно повернув замовлення в SD, приймаємо;
- без `updateAt` або без часу комплектації: блокуємо (безпечніше).

Час комплектації: останній запис `orders_history` зі статусом `3`, fallback `readyToShipAt`.

`readyToShipAt` сам по собі для guard не підходить: він ставиться лише при **першій** комплектації і не скидається. Попереднє правило (`incoming < max(localStatus, 3)` при наявному `readyToShipAt`) назавжди блокувало статуси замовлень після повторного циклу (відмова, повернення, утримання `9`, повторна відправка).

Застосовано в:

- `orderDatabaseService.updateOrder` (webhook),
- smart batch sync,
- `POST /api/orders-sync/sync/single-order` (кнопка «Оновити замовлення»).

## Де дивитись у коді

- `server/routes/orders.ts` — `PUT /:id/status`
- `server/services/salesdrive/statusMapper.ts` — `shouldSkipStatusSyncRollback`
- `server/services/orderDatabaseService.ts` – `isStaleStatusRollback`, guard у `updateOrder` / smart batch
- `server/routes/orders-sync.ts` — single-order sync
- `client/hooks/useOrderNavigation.ts` — виклик з комплектації
