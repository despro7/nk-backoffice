# Налаштування години звітного дня

## Огляд

Дозволяє гнучко конфігурувати годину початку звітного дня замість фіксованої опівночі (00:00).

**Приклад** — якщо `dayStartHour = 16`:
```
Замовлення о 18.10 15:59 → звіт за 18.10  (15:59 < 16:00 → той самий день)
Замовлення о 18.10 16:00 → звіт за 19.10  (16:00 >= 16:00 → наступний день)
```

| Час замовлення | dayStartHour | Звітна дата |
|---|---|---|
| 2024-10-17 15:30 | 16 | 2024-10-17 |
| 2024-10-17 16:00 | 16 | 2024-10-18 |
| 2024-10-17 23:59 | 16 | 2024-10-18 |

## База даних

Таблиця `settings_base`, ключ `reporting_day_start_hour`, значення `0–23` (default: `0`).

## API

**GET `/api/settings/reporting-day-start-hour`** → `{ dayStartHour: number }`

**PUT `/api/settings/reporting-day-start-hour`** ← `{ dayStartHour: number }` (0–23, авторизація обов'язкова)

## Utility-функції (`server/lib/utils.ts`)

```typescript
// Отримати налаштування з БД (default: 0)
getReportingDayStartHour(): Promise<number>

// Розрахувати звітну дату замовлення
getReportingDate(orderDate: Date, dayStartHour: number): string
// якщо година (Europe/Kyiv) >= dayStartHour → наступний день, інакше → поточний
// dayStartHour = 24 → звичайний календарний день

// Розрахувати часовий діапазон для фільтрів
getReportingDateRange(date: string, dayStartHour: number): { start: Date; end: Date }
// range('2024-10-18', 16) → start: 2024-10-17 16:00:00, end: 2024-10-18 15:59:59 (Europe/Kyiv)
```

**Часовий пояс.** Усі розрахунки звітного дня йдуть за `Europe/Kyiv` незалежно від `TZ` процесу Node і пояса браузера. Реалізація в `shared/utils/kyivDateTime.ts` (`getKyivReportingDate`, `getKyivReportingDateRange`, `kyivYmd`, `todayKyivYmd`, `addDaysToYmd`), `getReportingDate` і `getReportingDateRange` лише делегують їй. Ключі графіка (`buildChartDateKey`) і drill-down у `orders.ts` також рахуються за Києвом. Не використовувати `getHours()`, `setHours()`, `new Date(y, m, d, h)` і `toISOString().slice(0, 10)` для бізнес-дат.

## Endpoint-и що використовують dayStartHour

- `GET /api/orders/products/stats`
- `GET /api/orders/products/stats/dates`
- `GET /api/orders/products/chart`
- `GET /api/orders/sales/report`

## Правила для нових endpoint-ів

```typescript
// 1. Завантажити на початку функції
const dayStartHour = await getReportingDayStartHour();

// 2. Використовувати при групуванні замовлень по датах
const dateKey = getReportingDate(new Date(order.orderDate), dayStartHour);

// 3. Використовувати при фільтрації за діапазоном дат
const startRange = getReportingDateRange(startDate, dayStartHour);
const endRange   = getReportingDateRange(endDate, dayStartHour);
```

## Frontend

Компонент `ReportingDayStartHourSettings.tsx` вбудований у `SettingsAdmin.tsx`.

У `OrderStatusChip` (`client/components/OrderStatusChip.tsx`) опційний `dayStartHour` використовується (дати рахуються за Києвом через `shared/utils/kyivDateTime`), щоб порівняти «Підтверджено» і «На відправку» зі звітною датою (з переносом вихідних на понеділок). Деталі: `Docs/features/order-status-chip.md`.
