# Рухи по товару

**Дата:** 2026-10-05 (оновлено 2026-10-26)  
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
   - групує по партії (`goodPart`), для **комплектації/розукомплектування** згортає дробові рядки регістру одного документа в один рух (цілі порції); інші документи не змішуються, рахує running balance;
   - партії без рухів за період, але з ненульовим opening balance — у блок «Старі партії».

Без товару (`sku` / `goodId`) запит відхиляється.

---

## UI

### Сторінка звіту

- **Фільтри** — `ProductMovementsFilters`: товар (Autocomplete + останні запити), партія, склад, фірма, пресет періоду + DateRangePicker.
- **Останні запити** — `localStorage` ключ `product-movements-recent-searches-v1`, максимум **10** записів.
- **Заголовок звіту** — `ProductMovementsReportHeader`: зліва назва/SKU/період/склад (`showIdentity`); справа компактні віджети `ProductMovementsSummaryCards`:
  1. **Партії** — `всього / без рухів` (групи з `lines.length === 0`);
  2. початковий залишок, надходження, витрата, залишок.
- **Таблиця** — `ProductMovementsTable`: HeroUI Table, sticky header, іконки типів документів, accordion «Старі партії».
  - Колонка «Дата» — `ДД.ММ.РРРР`; Tooltip — повна дата+час (`dateTime` з API).
  - **Клік по документу** — `useWarehouseDocumentEditDrawer().open({ dilovodDocumentId, documentLabel, documentTypeId })` → nested drawer редагування / перегляду (переміщення, комплектація, списання, оприбуткування, повернення, відвантаження). Див. [`warehouse-document-edit-from-movements.md`](warehouse-document-edit-from-movements.md).

### Drawer (глобальний)

`ProductMovementsDrawerProvider` обгортає додаток у `App.tsx` (drawer підвантажується `lazy`, щоб context не тягнув UI eager-ом). Відкриття: `useProductMovementsDrawer().open(params)`.

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
  autoGenerate?: boolean;
  /** Сторона панелі. Default: `right`. */
  placement?: 'left' | 'right';
  /**
   * Side-panel режим: не закривати кліком/Escape, `backdrop="transparent"`,
   * `shouldBlockScroll={false}`, кліки крізь wrapper на фон.
   * Default: `false`.
   */
  nonDismissable?: boolean;
}
```

У header біля ✕ (на льоту, локальний стан сесії):
- **pin / pin-off** — перемикач `nonDismissable`;
- **arrow-left-to-line / arrow-right-to-line** — перемикач `placement`.

**Resize:** смужка на внутрішньому краю; ширина **375–1024** px (кламп також ≤92vw); default ~840; persist у `localStorage` `product-movements-drawer-width-v1` (`useProductMovementsDrawerWidth`).

**Таблиця в drawer (compact):** мін. ширина блоку групи `min-w-144`; колонка № прихована на вузьких екранах; підсумковий рядок — «Разом» у колонці дати; `ResizableAppDrawer` — pin/placement у toolbar лише на `md+`, `scrollbar-thin-transparent` у body.

У compact-режимі Drawer:
- товар заблокований (`productLocked`), якщо передано `sku` / `dilovodGoodId`;
- фільтри `size="sm"`, висота полів `h-8`;
- таблиця без внутрішнього `p-2` у блоці групи;
- після формування — ті самі summary-віджети (`showIdentity={false}`, full-width).

### Rebatch (коригування партійного обліку)

Кнопка **Rebatch** — перехід у wizard комплектування (`/warehouse/releases`) з увімкненим режимом коригування.

| Де | Розміщення |
| --- | --- |
| Drawer рухів | Футер зліва (`ProductMovementsRebatchButton`) |
| `/reports/product-movements` | Зліва від «Сформувати» у блоці фільтрів |

**Права:** `page.warehouse.releases` (як сторінка комплектування). Без SKU у фільтрах кнопка disabled.

**Параметри з фільтрів:** `sku`, `dilovodGoodId`, `productName`, `storageId`, `firmId`, `goodPartId` → query `?rebatch=1&…` (`rebatchWizard.ts`). Сторінка releases викликає `startRebatchWizard`: correction kit, `ensure-set`, автозаповнення партій; при `goodPartId` — залишається лише обрана партія.

Після кліку з drawer панель рухів закривається (`onAfterNavigate`).

### Точки входу

| Місце | Тригер |
| --- | --- |
| `ResultDrawer` (деталі замовлення) | Кнопка рухів: МС + день відвантаження, `autoGenerate`, `placement: 'left'`, `nonDismissable: true` — див. [`order-details-result-drawer.md`](order-details-result-drawer.md) |
| `/warehouse/batches` | Клік по партії → `autoGenerate: true` |
| `/warehouse/movement-mob/:id` | Клік по назві партії в `MovementMobProductCard` (`autoGenerate: true`) |
| `/warehouse/release-sets` | Кнопка «Рухи партії» в `ReleaseComponentBatchesPanel` |

---

## Бекенд

### ProductMovementsService

- Shape регістру — через `dilovodMetadataService.getRegisterShape('goods')`, імена вимірів не хардкодяться.
- **Кеш довідників** — `catalogs.storages` і `catalogs.firms` в пам'яті (TTL 5 хв) + dedup in-flight promise.
- **Паралелізація** — `fetchMovementRows` і `fetchOpeningBalances` через `Promise.all`.
- **Згортання комплектації** — перед групуванням по партії: `collapseProductMovementLines` (`shared/utils/productMovementCollapse.ts`) для документів комплектації/розукомплектування; кількість — `normalizePortionQty` (`productMovementQty.ts`).
- **Резолв партій** — `extractGoodPartIdPresentation` / `extractBatchLabelFromGoodPartHeader` у `DilovodUtils.ts` (підтримка `id__pr`, `id.pr`, вкладених структур Dilovod).
- Рядок руху: `date` (день) + `dateTime` (день+час з `period` Dilovod) для Tooltip у таблиці.

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

- [`warehouse-document-edit-from-movements.md`](warehouse-document-edit-from-movements.md) — nested drawer документів з таблиці рухів
- [`order-details-result-drawer.md`](order-details-result-drawer.md) — таблиця товарів у деталях замовлення + кнопка рухів (`OrderDetailsContent`)
- [`warehouse-statement.md`](warehouse-statement.md) — споріднений звіт по регістру `goods`
- [`warehouse-movement-mob.md`](warehouse-movement-mob.md) — мобільне переміщення, точка входу в Drawer
