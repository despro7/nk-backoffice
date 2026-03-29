# Мапінг методів оплати SalesDrive → Dilovod

## Огляд

Підтримується **гранулярне мапування на рівні (канал × метод оплати)** — один канал може мати різні `paymentForm`/`cashAccount` залежно від методу оплати.

**Чому**: Один канал (наприклад, "nk-food.shop") приймає LiqPay, Післяплату, Готівку — кожен може потребувати різного рахунку і фірми-власника в Dilovod.

## Архітектура

### Тип (`shared/types/dilovod.ts`)

```typescript
export interface DilovodChannelMapping {
  id: string;
  channelId: string;
  salesDrivePaymentMethod?: number;  // числовий ID методу оплати з SalesDrive API
  paymentForm?: string;
  cashAccount?: string;
}
```

### Логіка підбору (`DilovodExportBuilder.ts` — `getChannelMapping()`)

```typescript
// Крок 1: отримуємо канал з order.sajt
// Крок 2: числовий ID методу оплати з rawData
const rawData = JSON.parse(order.rawData);
paymentMethodId = rawData?.payment_method;  // числовий ID (13, 25, ...)

// Крок 3: шукаємо за двома параметрами
const mapping = channelSettings.mappings?.find(m =>
  m.salesDrivePaymentMethod === paymentMethodId
);
// Якщо не знайдено — warnings.push(...), return null
```

**Важливо**: метод оплати береться з `rawData.payment_method` (числовий ID), а не з `order.paymentMethod` (текстова назва).

### Динамічне завантаження методів оплати

Завантажуються з SalesDrive API через `/api/dilovod/salesdrive/payment-methods` (кеш 1 год.).

```typescript
// salesDriveService.fetchPaymentMethods()
// Повертає: [{id: 14, name: 'Plata by Mono'}, {id: 13, name: 'LiqPay'}, ...]
```

**Fallback**: якщо API недоступний — хардкоджений резервний список.

### Визначення фірми документа

```
1. cashAccount.owner  → фірма-власник рахунку (пріоритет)
2. settings.defaultFirmId  → фірма за замовчуванням
3. ERROR → "Не вказано фірму за замовчуванням"
```

## Таблиця прикладу

| Канал        | SD метод    | ID | Dilovod форма | Dilovod рахунок | Фірма          |
|--------------|-------------|----|---------------|-----------------|----------------|
| nk-food.shop | LiqPay      | 13 | Безготівка    | Monobank        | ФОП Іваненко   |
| nk-food.shop | Післяплата  | 12 | Післяплата    | Нова пошта      | ФОП Іваненко   |
| prom.ua      | Пром-оплата | 27 | Безготівка    | Prom.ua Wallet  | ТОВ Промспілка |

## Відомі обмеження

1. Залежність від SalesDrive API (fallback може бути застарілим)
2. Кешування 1 год. — нові методи з'являться після очищення кешу
3. Тільки точне співставлення за числовим ID (без regex/групування)
4. Один мапінг = один метод оплати
5. Відсутній `rawData.payment_method` → експорт не вдасться
