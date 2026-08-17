# OrderStatusChip — кольоровий статус замовлення з історією

Коротко: кольоровий чіп статусу SalesDrive і тултіп з історією змін статусу зібрані в один компонент. Історію можна показувати будь-де, де вже рендериться цей чіп.

Куди дивитись:
- Компонент: `client/components/OrderStatusChip.tsx`
- Кольори / підписи: `getStatusColor`, `getStatusLabel` у `client/lib/formatUtils.ts`

## API

```tsx
<OrderStatusChip
  status={order.status}
  label={order.statusText}          // опційно; інакше getStatusLabel(status)
  statusHistory={order.statusHistory} // якщо передано — тултіп з історією
  dayStartHour={dayStartHour}       // опційно: підсвітка «На відправку» в інший день
  extraTooltip="…"                  // додатковий рядок у тому ж тултіпі
/>
```

Окремо, без чіпа:

```tsx
<OrderStatusHistoryTooltip
  statusHistory={order.statusHistory}
  dayStartHour={dayStartHour}
/>
```

Тип запису історії:

```ts
type OrderStatusHistoryEntry = {
  status: string;
  statusText: string;
  changedAt: string;
};
```

Поведінка тултіпа:
- `statusHistory` **не передано** (`undefined`) — історії немає, чіп без тултіпа (якщо немає `extraTooltip`).
- `statusHistory={[]}` або порожній масив — тултіп «Немає історії статусів».
- Підряд однакові статуси з різницею ≤ 1 хв прибираються.

## Підсвітка «інший день»

Працює лише коли передано `dayStartHour` (година початку звітного дня).

Порівнюється останнє «Підтверджено» (`2`) і останнє «На відправку» (`3`):
- очікувана календарна дата «На відправку» = звітна дата підтвердження, з переносом сб/нд на понеділок;
- якщо фактична дата інша — у тултіпі цей запис підсвічується янтарним і підписом «(інший день)», біля чіпа — іконка попередження.

Виняток: підтвердження і «На відправку» того ж календарного дня, а зсув з’явився лише через `dayStartHour` (без правила вихідних) — це норма, попередження немає.

Деталі години звітного дня: `Docs/features/reporting-day/reporting-day-start-hour.md`.

## Де підключено

| Місце | Історія | `dayStartHour` |
|---|---|---|
| `SalesDateDetailsModal` | так (`statusHistory ?? []`) | так |
| `ProductOrdersModal` | якщо є в рядку | ні |
| `OrderViewHeader` | якщо є на об’єкті замовлення | ні |

Ще рендерять статус інакше (popover / «оновлено»), без цього чіпа:
`OrdersTable`, `SalesDriveOrdersTable`, пошук у поверненнях.

Щоб додати історію в нове місце: замінити локальний `Chip` + `getStatusColor` на `OrderStatusChip` і передати `statusHistory`.
