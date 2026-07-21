# Зведення реально відвантажених наборів у історії SKU

## Для чого це потрібно

Ендпоінт `GET /api/warehouse/inventory/product-history` показує не лише системний та фактичний залишок SKU, а й зведення рухів за той самий інвентаризаційний день:

- `kit` — скільки одиниць SKU було зкомплектовано;
- `shipped` — скільки одиниць SKU реально відвантажили;
- `returned` — скільки повернули;
- `writtenOff` — скільки списали.

Це дає змогу побачити повну картину зміни залишку без ручного зіставлення окремих звітів.

---

## Джерела даних

### 1. Відвантаження (`shipped`)

Для кожного запису історії береться дата інвентаризації `date`, після чого формується денне вікно:

- `startOfDay` — 00:00:00 цього дня;
- `endOfDay` — 00:00:00 наступного дня.

Далі пошук відвантажених SKU іде так:

1. `prisma.order.findMany()` відбирає замовлення, у яких `dilovodSaleExportDate` потрапляє в це денне вікно.
2. Для кожного замовлення читається `ordersCache.processedItems`, а якщо кешу немає або його не вдається розпарсити, використовується `order.items`.
3. Якщо в замовленні є `payloadData.shipment.bySku`, воно підключається тим самим шляхом, що і в shipment-звітах.
4. Підрахунок SKU робиться через спільний helper `server/services/orderShipmentMetricsService.ts`, щоб warehouse history і звіти не роз'їжджалися.

Тобто `shipped` рахується не по абстрактному стану замовлення, а по факту наявності `dilovodSaleExportDate` у базі та по збережених позиціях замовлення.

### 1.2. Комплектування (`kit`)

Для `kit` беруться записи з `warehouseReleaseSet`, де `setSku` збігається з поточним SKU, а `operationType` визначає знак руху:

- `kit` додає кількість;
- `unkit` віднімає кількість.

Підсумовується поле `quantity`, а в колонці показується нетто-значення комплектування за цей інвентаризаційний день.

### 1.1. Монолітні набори vs звичайні порції

`shipped` **не** є простою сумою `processedItems + shipment.bySku`. Підрахунок іде через `computeShippedQuantityForSku` у `server/services/orderShipmentMetricsService.ts` — той самий шлях, що й shipment-звіти:

1. З `payloadData.shipment.bySku` береться список монолітних наборів.
2. Кожен набір розгортається до листових SKU через `expandSetToLeaves` → `monolithicComponentQuantity`.
3. З `ordersCache.processedItems` береться `cacheQuantity` по цільовому SKU.

Правила результату:

| Тип SKU | Що потрапляє в `shipped` |
|---------|--------------------------|
| Leaf / звичайний товар | `max(0, cacheQuantity − monolithicComponentQuantity)` — без порцій, що пішли в монолітні комплекти |
| Монолітний набір (є в `shipment.bySku`) | `monolithicSetQuantity` з payload (кількість наборів, не розгорнуті компоненти) |

Це узгоджується з Reports → Shipment: колонка «Звичайні товари» і таблиця «Монолітні набори» розділені так само.

Для монолітних наборів більше не потрібна окрема перевірка на `accGood = 1119000000001079` у warehouse history.

### 2. Повернення і списання

Для `returned` і `writtenOff` використовується спільний хелпер, який проходить по `items` у відповідних таблицях історії та підсумовує кількість по SKU.

Підтримуються варіанти поля кількості:

- `portionQuantity`
- `qty`
- `quantity`
- `boxQuantity`

---

## Логіка підрахунку по дню

Рахунок прив’язаний саме до інвентаризаційного дня, а не до моменту створення запису історії:

```ts
const asOf = new Date(e.date);
const startOfDay = new Date(asOf);
startOfDay.setHours(0, 0, 0, 0);
const endOfDay = new Date(startOfDay);
endOfDay.setDate(endOfDay.getDate() + 1);
```

Це означає, що для кожного рядка історії ми дивимося всі рухи в межах того самого календарного дня, коли була зафіксована інвентаризація.

---

## Що саме повертає API

Кожен запис у відповіді `GET /api/warehouse/inventory/product-history` доповнюється полями:

- `kit`
- `shipped`
- `returned`
- `writtenOff`

У підсумку клієнт отримує повний рядок історії:

```json
{
  "sessionId": 123,
  "date": "2026-06-26T09:00:00.000Z",
  "systemBalance": 48,
  "actual": 45,
  "deviation": -3,
  "kit": 2,
  "shipped": 12,
  "returned": 1,
  "writtenOff": 0
}
```

---

## Чи можна використовувати цей метод в інших місцях

Так, але з нюансом.

### Що вже можна перевикористати концептуально

- підхід із денним вікном `startOfDay/endOfDay`;
- пріоритет кешу `ordersCache.processedItems` над парсингом `order.items`;
- fallback-логіку для замовлень без кешу;
- агрегацію `kit` через `warehouseReleaseSet`;
- агрегацію `returned` і `writtenOff` через спільний хелпер по SKU.

### Що вже перевикористовується фактично

- `server/services/orderShipmentMetricsService.ts` — спільний reader для shipment payload, descriptors, `expandSetToLeaves` і `computeShippedQuantityForSku`;
- `server/routes/orders.ts` — звіти по shipped-метриках (stats + product-orders);
- `server/modules/Warehouse/WarehouseController.ts` — inventory history для SKU.

### Що краще винести окремо, якщо треба застосувати в іншому ендпоінті

Денна агрегація (`startOfDay/endOfDay` + запити orders/returns/writeoffs) живе всередині `WarehouseController`.
Якщо потрібно використовувати її ще десь, краще винести в helper/service, наприклад:

- `getShippedTotalsForSkuByDay(sku, date)` — вже можна зібрати поверх `computeShippedQuantityForSku`;
- `getMovementTotalsForSkuByDay(sku, date)`;
- або окремий метод у `WarehouseService` / `WarehouseHistoryService`.

### Де це буде корисно

- у звітах по SKU;
- у dashboard-статистиці;
- у порівнянні системного та фактичного залишку;
- у будь-якому місці, де треба показати, як саме змінився SKU в межах дня.

---

## Обмеження

- Метод залежить від наявності `dilovodSaleExportDate` у `orders`.
- Для точного `shipped` бажано мати актуальний `ordersCache.processedItems`.
- Якщо кеш відсутній, працює fallback на `order.items`, але це дорожче.
- Підрахунок прив’язаний до календарного дня, тому для нестандартного reporting day його треба буде адаптувати.
