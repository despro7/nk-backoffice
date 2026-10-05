# Рухи по товару

**Дата:** 2026-10-05  
**Маршрут:** `/reports/product-movements` (`STOREKEEPER`+)  
**Дозвіл:** `page.reports.productMovements`  
**API:** `GET /api/reports/product-movements/meta`, `POST /api/reports/product-movements`

---

## Огляд

Звіт рухів товару по регістру Dilovod `goods` (`balanceRegisters.goods`): рядки надходжень/витрат з running balance, згруповані по партіях. Підтримує фільтри за товаром, партією, складом, фірмою та періодом.

Куди дивитись:

| Шар | Файли |
| --- | --- |
| Типи | `shared/types/productMovements.ts` |
| Сервіс | `server/services/dilovod/ProductMovementsService.ts` |
| HTTP | `server/routes/reports-warehouse.ts` |
| UI сторінки | `client/pages/Reports/ReportsProductMovements/` |
| Feature-модуль | `client/features/product-movements/` |
| Drawer (глобальний) | `ProductMovementsDrawerContext` → `App.tsx` |

Навігація: **Звіти → Рухи по товару** (`order: 6`, badge `NEW` до 2026-10-15).

---

## Потік

1. Клієнт вантажить meta (shape регістру, довідники складів/фірм, доступні фільтри).
2. Користувач обирає товар (пошук каталогу ГП), опційно — партію, склад, фірму, період.
3. «Сформувати» → `POST /api/reports/product-movements`.
4. Сервер:
   - резолвить товар за `sku` або `goodId`;
   - паралельно завантажує рядки рухів і початкові залишки (`balanceAndTurnover` на день перед `startDate`);
   - групує по партії (`goodPart`), рахує running balance;
   - партії без рухів за період, але з ненульовим opening balance — у блок «Старі партії».

Без товару (`sku` / `goodId`) запит відхиляється.

---

## UI

### Сторінка звіту

- **Фільтри** — `ProductMovementsFilters`: товар (Autocomplete + останні запити), партія, склад, фірма, пресет періоду + DateRangePicker.
- **Останні запити** — `localStorage` ключ `product-movements-recent-searches-v1`, максимум **10** записів.
- **Заголовок звіту** — `ProductMovementsReportHeader`: назва товару + блок загальної статистики по всіх партіях (початковий залишок, надходження, витрата, залишок).
- **Таблиця** — `ProductMovementsTable`: HeroUI Table, sticky header, іконки типів документів, accordion «Старі партії».

### Drawer (глобальний)

`ProductMovementsDrawerProvider` обгортає додаток у `App.tsx`. Відкриття через `useProductMovementsDrawer().open(params)`:

```ts
interface ProductMovementsOpenParams {
  sku?: string;
  dilovodGoodId?: string;
  productName?: string;
  goodPartId?: string;
  batchLabel?: string;
  storageId?: string;
  firmId?: string;
  period?: { startDate: string; endDate: string };
  autoGenerate?: boolean; // автоматично сформувати звіт після відкриття
}
```

У compact-режимі Drawer:
- товар заблокований (`productLocked`), якщо передано `sku` / `dilovodGoodId`;
- фільтри `size="sm"`, висота полів `h-8`;
- таблиця без внутрішнього `p-2` у блоці групи.

### Точки входу

| Місце | Тригер |
| --- | --- |
| `/warehouse/movement-mob/:id` | Клік по назві партії в `MovementMobProductCard` (іконка `arrow-left-right`, `autoGenerate: true`) |
| `/warehouse/release-sets` | Кнопка «Рухи партії» в `ReleaseComponentBatchesPanel` |

---

## Бекенд

### ProductMovementsService

- Shape регістру — через `dilovodMetadataService.getRegisterShape('goods')`, імена вимірів не хардкодяться.
- **Кеш довідників** — `catalogs.storages` і `catalogs.firms` в пам'яті (TTL 5 хв) + dedup in-flight promise.
- **Паралелізація** — `fetchMovementRows` і `fetchOpeningBalances` через `Promise.all`.
- **Резолв партій** — `extractGoodPartIdPresentation` / `extractBatchLabelFromGoodPartHeader` у `DilovodUtils.ts` (підтримка `id__pr`, `id.pr`, вкладених структур Dilovod).

### Обмеження

- `ROW_LIMIT = 5000` — при перевищенні повертається `truncated: true` і `warning`.

---

## Оптимізація запитів (клієнт)

При відкритті Drawer з `autoGenerate` раніше виникали дубльовані POST через нестабільні залежності `useMutation`:

- `useProductMovementsQuery` — `generate` / `reset` через `mutationRef` (стабільні посилання).
- `ProductMovementsDrawer` — `openSessionRef` / `autoGenerateSessionRef` (один виклик `generate` на сесію відкриття).
- `useProductMovementsMeta` — `loading` лише від `isLoading`, не `isFetching`.

---

## Пов'язана документація

- [`warehouse-statement.md`](warehouse-statement.md) — споріднений звіт по регістру `goods`
- [`warehouse-movement-mob.md`](warehouse-movement-mob.md) — мобільне переміщення, точка входу в Drawer
