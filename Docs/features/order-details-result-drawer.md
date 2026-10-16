# Деталі замовлення в ResultDrawer

**Дата:** 2026-10-15  
**Компонент:** `client/components/ResultDrawer.tsx` (`type="orderDetails"`)  
**Вхід:** таблиця SalesDrive-замовлень → «Деталі»

---

## Огляд

У drawer деталей замовлення таблиця **«Замовлені товари»** допомагає швидко діагностувати нестачу Dilovod: кількість, залишок МС / бракує з останнього error-лога, розгортання розібраних наборів і швидкий перехід у рухи по товару.

---

## Таблиця товарів

| Колонка | Зміст |
| --- | --- |
| Товар | SKU + назва; chip `набір` (моноліт) або `розібраний`; кнопка рухів |
| Кіл-ть | Замовлена кількість (для компонента = qty набору × qty у складі) |
| Залишок МС | З останнього meta-лога `status=error` (парсинг Dilovod «залишок») |
| Бракує | З того ж лога («бракує»), match по SKU |

Джерело нестачі: `GET /api/meta-logs?orderNumber=…` (orderBy datetime desc). Якщо останній лог не `error` — колонки порожні (`—`).

Парсер: `parseDilovodErrorText` / `dedupeAndNormalize` (`client/lib/metaLogsParser.ts`).

---

## Моноліт vs розібраний набір

- **Моноліт** — SKU є в `payloadData.shipment.bySku` → один рядок, chip «набір».
- **Розібраний** — набір є в каталозі (`product.set`), але SKU **немає** в `shipment.bySku` → рядок батька + дочірні компоненти (відступ).
- Залишок / Бракує на розібраному наборі показуються **лише на компонентах** (там, де їх бачить Dilovod).

Склад і назви: `GET /api/products/batch?fields=name,set` (+ довантаження SKU компонентів).

---

## Кнопка рухів

`useProductMovementsDrawer().open(…)`:

- `storageId` = Dilovod `smallStorageId` (малий склад);
- `period` = один день: `dilovodSaleExportDate` → інакше `readyToShipAt`;
- `autoGenerate: true`;
- `placement: 'left'`, `nonDismissable: true` — side-panel поруч із деталями замовлення (фон лишається інтерактивним).

Деталі UI звіту / drawer: [`product-movements.md`](product-movements.md).
