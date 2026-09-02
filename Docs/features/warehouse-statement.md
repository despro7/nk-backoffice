# Відомість по складу

**Дата:** 2026-09-02  
**Маршрут:** `/reports/warehouse-statement` (`STOREKEEPER`+)  
**Дозвіл:** `page.reports.warehouseStatement`  
**API:** `GET /api/reports/warehouse-statement/meta`, `POST /api/reports/warehouse-statement`

---

## Огляд

Звіт залишків і оборотів по регістру Dilovod `goods` (`balanceAndTurnover`). Імена вимірів і ресурсів не хардкодяться — беруться з `dilovodMetadataService.getRegisterShape('goods')`.

Куди дивитись:

| Шар | Файли |
| --- | --- |
| Типи | `shared/types/warehouseStatement.ts` |
| Сервіс | `server/services/dilovod/WarehouseStatementService.ts` |
| HTTP | `server/routes/reports-warehouse.ts` |
| UI сторінки | `client/pages/Reports/ReportsWarehouseStatement/` |
| Спільний конструктор | `client/pages/Reports/shared/constructor/` |
| Undo | `client/components/UndoActionBanner.tsx` |
| Метадані Dilovod | `Docs/integrations/dilovod-metadata.md` |

Навігація: **Звіти → Відомість по складу** (`client/routes.config.tsx`, `parent: 'reports'`, `order: 5`).

---

## Потік

1. Клієнт вантажить meta (shape, довідники, `defaultGrouping` / `defaultColumns`).
2. `sanitizePreset(loadConstructorPreset(), meta)` збирає draft конструктора.
3. «Сформувати» шле `POST` з періодом, фільтрами, `exclusions`, `grouping` і `columns`.
4. Сервер: BAT → каталог / ціни / розкладка витрати → фільтр `exclusions` по leaves → дерево рядків.

Без відбору складу, групи товарів або товару запит відхиляється (занадто широка вибірка).

---

## Дефолти конструктора

Джерело групування й колонок — `getMeta()` (`buildDefaultGrouping`, `buildDefaultColumns`). UI-дефолти (період, чекбокси) — `sanitizePreset()` у `warehouseStatementUtils.ts`.

| Параметр | Значення |
| --- | --- |
| Групування | склад → `group` → товар (лише id, що є в `meta.dimensions`) |
| Колонки | групи **Кількість** і **Собівартість**: BAT-слоти початок / прихід / витрата / кінець + «за одиницю» (`amountUnitCost`) |
| Не в дефолті | валютні ресурси (`/валют/i` у presentation), розрахункова кількість, ціни продажу |
| Період | `lastMonth` (`createStandardDatePresets()`, ключ не `last_month`) |
| `hideZeroQty` | `true` |
| `pinTotals` | `true` |
| `columnHeaderStyle` | `short` (`full` або `short`; застаріле значення `badge` з пресета нормалізується в `short`) |

Пресет у `localStorage`: `nk.warehouseStatement.constructorPreset.v4`. Зміна дефолтів вимагає нового суфікса версії, інакше збережений пресет перекриє meta.

Якщо в пресеті порожні / невалідні `grouping` або `columns`, клієнт підставляє `meta.defaultGrouping` / `meta.defaultColumns`. На сервері порожній список колонок у `POST` теж падає на `buildDefaultColumns`.

Увімкнення колонки **Ціна продажу** (`salesUnitPrice`) автоматично додає **Рентабельність** (`salesProfitability`), якщо її ще не було. Вимкнення ціни продажу прибирає рентабельність. Окремий чекбокс рентабельності видно лише коли ціна продажу увімкнена.

---

## Метрики

Id колонок — з meta (`batColumns` + похідні), не літерали Dilovod.

| Kind | Приклад id | Формат | Як рахується |
| --- | --- | --- | --- |
| `bat` | `qtyStart`, `amountFinal`, … | qty / money | Поля `virtualBatFields(resourceName)` |
| `unitCost` | `amountUnitCost` | money | Сума собівартості ÷ кількість (кінець, інакше початок) |
| `salesValue` | `salesValueFinal`, … | money | Ціна продажу × кількість слота |
| `salesUnitPrice` | `salesUnitPrice` | money | Ціна з типу цін Dilovod |
| `salesProfitability` | `salesProfitability` | percent | `(ціна − собівартість од.) ÷ ціна` |

Рентабельність **не рахується** (комірка «—»), якщо собівартість одиниці ≤ 0 або немає ціни продажу. На групах і «Разом» — та сама формула від агрегованих сум, не середнє відсотків.

UI колонки: заголовок **«Рент.»**, підказка з формулою. Світлофор у комірці: ≥ 30% зелений, 15–30% жовтий, нижче 15% червоний. Ширина колонки фіксовано вузька (~72px).

---

## Виключення

`exclusions: { dimensionId, valueId, label? }[]` у пресеті й у `POST`.

- Група каталогу (`dimensionId` = синтетичний `group`) виключає себе і нащадків.
- Товар / інший вимір — лише цей рядок.
- Сервер фільтрує leaves до побудови дерева; клієнт додатково `pruneRowsByExclusions` і перераховує totals після undo/локальних змін.

У таблиці: іконка «додати до виключення» на назві (hover на не-touch, завжди на touch). Після додавання — `UndoActionBanner` ~6 с. У шапці конструктора — лічильник і «Скинути»; вкладка Відбір — мультиселект груп і чіпи окремих об’єктів.

---

## API

`authenticateToken` + `requirePermissionKey(PAGE_REPORTS_WAREHOUSE_STATEMENT)`.

### `GET /api/reports/warehouse-statement/meta`

Shape регістру, виміри (регістр + синтетичний `group`), метрики, довідники складів / фірм / груп / типів цін, `defaultGrouping`, `defaultColumns`.

### `POST /api/reports/warehouse-statement`

Тіло: `WarehouseStatementQueryRequest` — `period` (`dateRange` або `asOfDate`), `dimensionFilters` (ключі = імена вимірів shape), `groupIds` (ILH по товару), `exclusions`, `expenseKinds`, `priceType`, `grouping`, `columns`, `hideZeroQty`.

Відповідь: дерево `rows` (`total` / `group` / `leaf`; у рядків є `dimensionId` / `valueId` / `groupId` для виключень), `totals`, фактичні `grouping` / `columns`, `resolved`.

---

## UI

- Toolbar: період (діапазон або «станом на дату»), Сформувати, Excel.
- Конструктор (`ReportConstructorPanel`): вкладки Відбір / Групування / Колонки. Заголовки колонок: повні назви або короткі слоти (Початок, Прихід…). Чекбокс «Рядок Разом закріплений» дублюється іконкою pin у рядку «Разом».
- Таблиця поза Card, `h-full` (скрол сторінки, не окремий бокс). Темна шапка; sticky-шапка без jitter (окремий горизонтальний скрол шапки/тіла). Ресайз колонки «Найменування» — права межа на всю висоту, одна вертикальна лінія підсвітки.
- Групи згортаються кліком по назві або шеврону (шеврон праворуч від назви). Якщо обраний лише один склад — рядок групи складу не показується.
- Від’ємні qty/money — `text-danger`. Колонки мають `min-width` за форматом, щоб при вузькому екрані був горизонтальний скрол, а не накладання цифр.
- Excel: дворядкова шапка (група метрик + слот), freeze першої колонки; percent — формат `0.0%`, порожня рентабельність не пишеться як 0.
