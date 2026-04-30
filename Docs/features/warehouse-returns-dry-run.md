# Warehouse Returns: новий розділ повернень з dry-run payload preview

## Огляд

Впроваджено новий розділ Warehouse Returns для обробки повернень замовлень у Dilovod. Система підтримує пошук замовлень за номером, TTN, ПІБ, вибір замовлення, підготовку повернення, вибір партій, збереження чернетки та dry-run перегляд payload перед фактичною відправкою.

## UI Flow

1. Користувач вводить запит у полі пошуку (`client/pages/Warehouse/WarehouseReturns/OrderSearchInput.tsx`).
2. Система виконує пошук по локальній базі: номер замовлення, TTN за останні 4 цифри, ПІБ клієнта.
3. Показується список результатів, якщо знайдено >1 — користувач вибирає потрібне замовлення, інші результати згортаються.
4. Після вибору замовлення завантажуються деталі повернення та партії для товарів.
5. Користувач може зберегти чернетку, обрати партію для кожного SKU та підготувати повернення.
6. Для адміністратора в debug-режимі доступна кнопка `payload`, яка викликає dry-run і відкриває `PayloadPreviewModal`.

## Пошук замовлень

- Поле пошуку підтримує:
  - номер замовлення
  - останні 4 цифри ТТН
  - ім'я клієнта
- При повторному пошуку деталі попереднього повернення скидаються, щоб не залишалося застарілих даних.
- Після вибору одного з результатів інші результати ховаються.

## API

### `GET /api/orders`

- Змінено серверний фільтр пошуку у `server/services/orderDatabaseService.ts`.
- Пошук `search` тепер включає `orderNumber`, `customerName` та `ttn`.
- Якщо пошуковий запит складається з 1–4 цифр, TTN шукається по `endsWith`.

### `POST /api/warehouse/returns/send`

- `dryRun: true` — будується payload повернення і повертається клієнту без спроби експорту в Dilovod.
- `dryRun: false` — будується payload і відправляється в Dilovod.
- Зворотня відповідь dry-run містить `payload` і `warnings`.

## Builder

### `server/services/dilovod/DilovodExportBuilder.ts`

- Метод `buildReturnPayload()` будує payload для документа `documents.saleReturn`.
- При підготовці `header` видаляються поля:
  - `state`
  - `number`
  - `deliveryRemark_forDel`
- Поле `person` передається як `person.id` (рядок) замість об'єкта.

## Debug доступ

- Кнопка `payload` в `ReturnsActionBar` відображається тільки коли:
  - `isDebugMode === true`
  - користувач має роль ADMIN
- Якщо користувач не має прав, кнопка не рендериться.

## Документальний розділ

- `Docs/features/warehouse-returns-dry-run.md` описує архітектуру та API нового розділу повернень.
- Цей розділ доповнює основну функціональність Warehouse Returns і служить як технічний довідник для подальших змін.

## Файли

- `client/pages/Warehouse/WarehouseReturns/index.tsx`
- `client/pages/Warehouse/WarehouseReturns/ReturnsActionBar.tsx`
- `client/pages/Warehouse/WarehouseReturns/OrderSearchInput.tsx`
- `server/modules/Warehouse/WarehouseController.ts`
- `server/services/dilovod/DilovodExportBuilder.ts`
- `server/services/orderDatabaseService.ts`
- `Docs/features/warehouse-returns-dry-run.md`
