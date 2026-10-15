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

Після комплектації (`readyToShipAt` задано) sync/webhook/refresh **не** можуть відкотити статус назад (наприклад `3 → 2`).

Правило: `shouldSkipStatusSyncRollback` у `server/services/salesdrive/statusMapper.ts`:

- якщо немає `readyToShipAt` — sync статусу як раніше;
- якщо є — блокуємо `incoming < max(localStatus, 3)`;
- просування вперед (`3→4→5`) і «вищі» термінали (`6` Відмова тощо) — дозволені;
- розсинхрон `status=2` + `readyToShipAt`: блокуємо stale `2`, дозволяємо підтягнути `3+`.

Застосовано в:

- `orderDatabaseService.updateOrder` (webhook),
- smart batch sync,
- `POST /api/orders-sync/sync/single-order` (кнопка «Оновити замовлення»).

## Де дивитись у коді

- `server/routes/orders.ts` — `PUT /:id/status`
- `server/services/salesdrive/statusMapper.ts` — `shouldSkipStatusSyncRollback`
- `server/services/orderDatabaseService.ts` — guard у `updateOrder` / smart batch
- `server/routes/orders-sync.ts` — single-order sync
- `client/hooks/useOrderNavigation.ts` — виклик з комплектації
