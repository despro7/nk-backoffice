# Мобільні переміщення між складами (`WarehouseMovementMob`)

**Дата:** 2026-09-04 (оновлено)  
**Маршрути:** `/warehouse/movement-mob`, `/warehouse/movement-mob/new`, `/warehouse/movement-mob/:id`  
**Дозвіл сторінки:** `page.warehouse.movementMob`

Окрема мобільна гілка переміщень (не десктопний `WarehouseMovement`). Десктопний цикл «зберегти / відправити в Dilovod» лишається в `Docs/features/warehouse-movement-dilovod-export.md`.

---

## Життєвий цикл документа

Статуси БД (`warehouse_movement.status`): `draft` → `pending_receipt` → `finalized`. Soft-delete: `deleted` (список за замовчуванням їх не показує). Старий десктопний `active` лишається для `/warehouse/movement`.

| Крок | Хто | Що відбувається | Dilovod |
|------|-----|-----------------|---------|
| Формування | автор чернетки | сканування, автозбереження рядків (`PUT /api/warehouse/:id`) | ні |
| **Відправити** | автор (або `movement.edit`) | `POST /:id/submit` → `pending_receipt`, `submittedAt` | ні |
| Прийом | **не** автор | сканування фактичних кількостей (`PUT /:id/receipt`) | ні |
| **Підтвердити отримання** | не автор | `POST /:id/confirm-receipt` | так: `tpGoods` з **отриманих** порцій |
| Адмін-правка після отримання | `movement.edit` | окремо відправлене / отримане; `POST /:id/sync-dilovod` | перезапис існуючого документа |
| Видалення | `movement.delete` | `status=deleted`; якщо є `dilovodDocId` — `delMark` | позначка видалення |

Внутрішній номер генерується на сервері: `П-{id}` з padding (`П-00316`).

Автор **не може** прийняти власне відправлення (403 на `receipt` / `confirm-receipt`). У UI відправник бачить неактивну кнопку «Документ відправлено». Чернетку до відправки редагує лише автор (іншим користувачам кнопки формування сховані), якщо немає `movement.edit`.

Розбіжності кількості дозволені (менше / більше за відправлене). У Dilovod іде лише фактично отримане. `goodPart` не береться з `"0"`: `isUsableDilovodBatchId` (`shared/utils/dilovodBatchId.ts`); під час експорту порожні партії підставляються з Dilovod (`fillMissingBatchIds`).

---

## Навігація та екрани

| Шлях | Компонент | Зміст |
|------|-----------|--------|
| `/warehouse/movement-mob` | `index.tsx` | Список документів, фільтри (`MovementMobFilterBar` / ActionBubble на touch-UI); кнопки адмін-редагування/видалення за дозволами |
| `/warehouse/movement-mob/new` | `MovementMobCreatePage.tsx` | Нова чернетка → редактор |
| `/warehouse/movement-mob/:id` | `MovementMobDocumentPage.tsx` | Перегляд або редагування збереженої чернетки |

Редактор: `MovementMobEditorPage.tsx`. Розмітка документа: `MovementMobDocumentScreen.tsx`.

Режими `MovementMobEditorMode`:

- `empty` — склади обрані, рядків ще немає.
- `formation` — можна сканувати, редагувати, видаляти, відправляти.
- `receiving` — прийом: сканування в отримані кількості, «Підтвердити отримання».
- `view` — документ далі чернетки / чужа чернетка / `deleted`; жести рядків вимкнені (окрім адмін-режиму).

Панель кнопок `MovementMobActionBar`: `formation` | `receiving` | `awaitingReceipt` | `adminEdit`.

Прийом: кнопки на всю ширину, стовпчик — **Сканувати позицію**, потім **Підтвердити отримання**. У DebugMode поруч — **Payload** (dry-run Dilovod).

---

## Права (`action.warehouse.*`)

Налаштування → Користувачі → Ролі. Seed за замовчуванням — лише `admin`.

| Ключ | UI | Ефект |
|------|-----|--------|
| `action.warehouse.movement.edit` | Редагувати чужі та відправлені переміщення | `PUT` будь-якого невидаленого документа; submit чужої чернетки; адмін-режим у редакторі; `POST /:id/sync-dilovod` |
| `action.warehouse.movement.delete` | Видаляти переміщення (у Dilovod — delMark) | `DELETE /api/warehouse/:id` (soft-delete) |

---

## Адмін-редагування отриманого документа

Після `finalized` кнопка **Редагувати** вмикає `adminEdit` і перемикач **Відправлене / Отримане**:

- **Відправлене** — drawer і сканування змінюють `boxQuantity` / `portionQuantity` / `totalPortions`.
- **Отримане** — ті самі жести змінюють `received*`. Новий SKU можна додати як надлишок (відправлене = 0).
- Swipe «видалити»: якщо в іншому списку ще є кількість — обнуляється лише активний бік; інакше рядок знімається.
- Картка показує обидва числа; велике (σ) — активний список; кольори збігу / нестачі / надлишку.
- **Зберегти в Dilovod** (`MovementMobSyncDilovodModal`) перезаписує документ у Dilovod **отриманими** кількостями (`saveType: 1` + існуючий `dilovodDocId`). Відправлений список лишається лише в бек-офісі.

Чернетка й `pending_receipt` в адмін-режимі як і раніше правлять відправлений список (отриманого ще немає або його набирає отримувач).

---

## Сканування без прихованого input

Приховане поле ШК на сторінці прибирали: на мобільному воно крало фокус і ламало stepper / кнопки.

Джерела коду:

1. HID-сканер через `equipmentState.lastBarcode` (`useMovementMobScan`).
2. Камера: live-потік або capture (`cameraMedia.ts`, `MovementMobCameraOverlay`). Детекція лише в видимому віконці: кадр кропиться до рамки оверлею (`mapCoveredOverlayToVideoSource` / `drawVideoRegionToCanvas`).
3. Кнопка **Додати ще** / **Сканувати позицію** відкриває камеру / overlay.
4. Dropdown тієї ж кнопки — **Ввести ШК вручну** (`MovementMobManualBarcodeModal`).

Мок-штрихкоди (`MovementMobMockBarcodeBar`) рендеряться **лише в DebugMode** (`useDebug().isDebugMode`).

Dedup скану: 1000 мс на той самий код (`SCAN_DEDUPE_MS`). HID ігнорується, коли фокус на stepper у drawer або відкрита камера (`pauseHid`).

Lookup: `GET /api/warehouse/product-by-barcode?code=…` → `WarehouseProductByBarcodeResponse` (`shared/types/warehouse.ts`). Залишки складів — `stock-snapshot`. Рівень ШК: `portion` | `box` (box-коди в БД ще можуть бути відсутні; сервер зараз віддає `portion`, поки не з’явиться окремий box-код).

---

## Drawer кількості (`MovementMobScanDrawer`)

`BottomSheet` (`client/components/motion/bottom-sheet.tsx`): snap `auto`, lock скролу body через `position: fixed` (інакше iOS Safari прокручує сторінку під sheet).

Усередині:

- Назва, SKU, вага, шт. у коробці, партія, **ШК** (зберігається в рядку чернетки).
- У адмін-режимі finalized — підказка «Редагування відправленої / отриманої кількості».
- Дві картки залишків: склад-джерело і склад-призначення. Показ **до → після** з урахуванням:
  - поточного введення в drawer;
  - уже доданих у документ порцій цього SKU (`committedPortionsForSku(..., side)`), окрім рядка, який зараз редагується (`side` = sent або received).
- `StepperInput` коробок / порцій.
- Підсумок порцій.
- `MovementMobSwipeConfirm` → `SlideActionButton` («Проведіть для підтвердження»).

Повторне сканування того самого ШК **не створює новий рядок одразу**: drawer відкривається з уже накопиченою кількістю цього SKU+партія, плюс +1 коробка або +1 порція залежно від `barcodeKind`.

Редагування рядка відкриває той самий drawer; `barcode` / `barcodeKind` їдуть у `MovementMobRawItem` через `serializeMobDraftItems` / `buildProductLines`, інакше ШК у drawer зникав після збереження.

Підтвердження: `replaceMovementMobLine` (кількість з drawer замінює рядок, не сумується повторно).

---

## Рядки документа: swipe і fallback

На iPhone / iPad (`usesIosSwipeGestures` у `client/lib/touch.ts`): свайп рядка.

- Вправо — **leading** (редагувати): кінетична капсула, сильний свайп розтягує кнопку на всю ширину, далі відкривається drawer.
- Вліво — **trailing** (видалити): так само, потім collapse висоти рядка.
- Слабкий свайп залишає кнопку відкритою; тап по ній виконує дію. Поріг commit високий (`max(220px, 68% ширини)`), щоб випадковий жест не спрацьовував.
- Під час горизонтального жесту блокується вертикальний скрол сторінки (`overflow: hidden` + `touchmove preventDefault`).
- Кнопки заокруглені, іконка завжди, підпис з’являється лише за порогом commit.

На Android і інших клієнтах свайп ненадійний: тап по рядку відкриває панель знизу з тими самими діями (висота 48px, spring `SPRING_PANEL`).

Реалізація винесена зі сторінки в спільний **`SwipeActionRow`**: `client/components/motion/swipe-action-row.tsx`. Контракт і нюанси — `Docs/architecture/swipe-action-row.md`.

Екран документа тримає одне відкрите rest-стан на ключ рядка (`openSwipe`).

Картка списку (`MovementMobDocumentCard`) **не** `isPressable` (HeroUI тоді рендерить `<button>`): інакше кнопки адміна вкладені в button. Клік по тілу картки відкриває документ.

Кнопки під списком (`< sm`): **Додати ще** займає решту ширини, **Відправити** — `shrink-0` / `w-auto`.

---

## Видалення та undo

Видалення не одразу ріже стейт: рядок анімовано зникає (opacity + height → 0), далі знімається зі списку.

Банер `MovementMobUndoBanner`:

- видалення рядка — «Видалено», тон danger;
- сканування прийому — «Прийнято», тон success;
- обнулення одного боку в адмін-режимі — «Змінено».

Кнопка **Скасувати**, індикатор часу ~**6 с** (`UNDO_MS = 6000`). Undo вставляє рядок **на попередній індекс** (`insertMovementMobLineAt`) з `enterFromCollapsed`.

---

## Картка товару (`MovementMobProductCard`)

Рядок документа на екрані редактора / перегляду. Дані з `MovementMobProductLineViewModel`, збагачені хуком `useMovementMobLinesEnrichment`.

### Відображення

| Елемент | Джерело / логіка |
|---------|------------------|
| Назва, σ-порції, коробки / розсип | рядок документа |
| Штрих-код | `line.barcode` (у debug — також SKU, ID партії, `catalogGoodId`) |
| Партія | людська назва з Dilovod або каталогу; якщо `batchLinked === false` — **«Партія: не обрано!»** (червоний) |
| Залишки після переміщення | прогноз `computeProjectedLineStock` (див. нижче) |
| Статус прийому | «Відправлено: N / Отримано: M / Результат: збіг \| нестача \| надлишок» + кольорове кільце рядка |

Skeleton (`@heroui/react`) на партії та залишках, поки `useMovementMobLinesEnrichment` у стані `loading` / `refreshing`.

### Редагування товару на місці

Якщо відомий `catalogGoodId`, поруч із партією — іконка олівця. Відкриває `MovementMobProductEditDrawer` (обгортка над `ProductDrawer` з Products 2.0): привʼязка партії до штрих-коду без переходу в розділ товарів. Після збереження інвалідується кеш `warehouse-movement-mob-line-enrichment`.

---

## Збагачення рядків (`useMovementMobLinesEnrichment`)

Хук підключається в `MovementMobDocumentScreen` і повертає `{ lines, loading, refreshing }`.

**Джерела даних (паралельно + послідовно):**

1. `GET /api/warehouse/stock-snapshot?skus=…` — загальні залишки ГП / МС по SKU (`mainStock` / `smallStock`).
2. `GET /api/warehouse/batch-numbers/:sku?includeSmallStorage=true` — партії з Dilovod по SKU (послідовно по SKU, щоб уникнути `multithreadApiSession`; при порожній відповіді — повтор з `force=true`).
3. `POST /api/warehouse/resolve-batch-names` — назви партій і метадані привʼязки з `catalog_good_barcodes` (за `batchId`, SKU, barcode).

**Кеш клієнта (React Query):** `staleTime` 10 хв, `gcTime` 30 хв, `placeholderData` — попередній знімок під час оновлення.

**`batchLinked`:** `true` лише якщо в каталозі для штрих-коду задано `goodPart` (Dilovod batch id). Інакше партія в документі може мати числовий id, але UI показує «не обрано!», а залишок **по партії** не виводиться (лише «всього»).

**Резолв назви партії:**

1. Dilovod `goodPart__pr` у відповіді `batch-numbers` (поле не запитується в `fields` — Dilovod віддає його разом із `goodPart`).
2. Каталог `goodPartName` через `resolve-batch-names`.
3. `isHumanBatchLabel` / `isUsableDilovodBatchId` — відрізнити людську назву від сирого id.

Деталі полів Dilovod: `Docs/integrations/dilovod-metadata.md`.

---

## Залишки після переміщення (прогноз)

Поточні залишки з Dilovod / snapshot **не** показуються напряму — картка рахує **прогноз після застосування рядка**:

- зі **складу-джерела** (`sourceStorageId`) віднімається відправлена кількість (`totalPortions`);
- на **склад-призначення** (`destStorageId`) додається отримана (`receivedTotalPortions`, якщо є прийом і значення > 0, інакше — відправлена);
- коригуються і **партія**, і **всього** по ГП / МС, якщо `batchLinked === true`.

Утиліти: `computeProjectedLineStock`, `movementQtyForStockProjection`, `computeLineStockFromBatches` (поточні залишки з партій Dilovod).

Приклад (ГП → МС, 72 порції, поточні 556/600 і 23/56): **484 / 528** [ГП] | **95 / 128** [МС].

При нестачі (відправлено 72, отримано 50): з ГП −72, на МС +50.

---

## Залишки в drawer сканування (чернетка)

`committedPortionsForSku(lines, sku, exceptKey?, side = 'sent')` сумує `totalPortions` або `receivedTotalPortions` усіх рядків цього SKU, опційно без рядка, який відкритий у drawer.

У drawer:

- джерело **до** = snapshot складу − committed інших рядків;
- призначення **до** = snapshot + ті самі committed;
- **після** = до ± кількість з drawer.

`breakdownStockPortions` показує коробки + розсип.

---

## Хронологія і степпер

`buildChronology` і `buildStepperSteps` віддають **чотири** кроки. Назви складів динамічні: **Відправлено з [ГП|МС]**, **Прийнято на [ГП|МС]** (`resolveShortStorageBadge`).

| Крок | Степпер (desktop) | `shortLabel` (мобільний) | done коли | Дата / текст, якщо pending |
|------|-------------------|--------------------------|-----------|------------------------------|
| `prepared` | Підготовлено | Підготовлено | чернетка існує | `draftCreatedAt` |
| `sent` | Відправлено з «…» | Відправлено | `pending_receipt` / `active` / `finalized` | **«ще не відправлено»** |
| `accepted` | Прийнято на «…» | Прийнято | сканування прийому або `finalized` | інтервал сканування або **«ще не прийнято»** |
| `received` | Підтверджено / Ще не підтверджено | Підтверджено / Очікує | `finalized` | **«ще не підтверджено»** |

**Крок «Прийнято»:** користувач-сканер (`receiptScannedBy` / `receiptScannedByName`). Час — `formatReceiptScanInterval(receiptScanStartedAt, receiptScanEndedAt)`: одна дата, інтервал часу через дефіс, тривалість у дужках (`formatDurationUk`). Сканувати і підтвердити отримання можуть різні люди — тому окремі поля сканування й `receivedBy`.

Поля БД (міграція `20260904120000_warehouse_movement_receipt_scan_fields`): `receiptScanStartedAt`, `receiptScanEndedAt`, `receiptScannedBy`. Заповнюються при `PUT /:id/receipt` (перший скан — `receiptScanStartedAt`, кожне збереження оновлює `receiptScanEndedAt` і `receiptScannedBy`).

Pending: сіра точка, сірий заголовок, без імені користувача. Done: зелена точка, дата, автор / сканер / отримувач.

Хронологія рендериться на екрані документа **і для збереженої чернетки** — під кнопками формування.

---

## Спільні примітиви (не тільки mob)

| Файл | Роль |
|------|------|
| `client/components/motion/bottom-sheet.tsx` | Нижній sheet зі snap / dismiss |
| `client/components/motion/slide-action-button.tsx` | Slide-to-confirm |
| `client/components/motion/swipe-action-row.tsx` | Swipe + Android-панель |
| `client/lib/ease.ts` | Easing / spring-токени |
| `client/lib/presence-gate.tsx` | `inert` + pointer-events на exit `AnimatePresence` |
| `client/lib/touch.ts` | Класи жестів, capture, `usesIosSwipeGestures` |
| `client/lib/haptic.ts` | `lightHaptic()` = `navigator.vibrate(10)` |

**Вібрація:** Android — короткий pulse на commit swipe-confirm і на дії рядка. iOS Safari **не реалізує** Vibration API; Taptic з вебу (прихований `input[switch]`) прибрали — хак ненадійний і після iOS 26.5 програмний `.click()` його більше не дає. На iPhone жест лишається без вібрації.

---

## Типи рядка

`MovementMobRawItem` / `MovementMobProductLineViewModel`: `barcode`, `barcodeKind`, відправлені кількості, `received*`, опційно `stock` (`MovementMobLineStockInfo`: `batchGp`, `batchMs`, `totalGp`, `totalMs`), `batchLinked`, `catalogGoodId`.

Ключ рядка: `sku + batchId|batchNumber`. Ключ збагачення: `movementMobEnrichmentLineKey` (`sku::barcode::batchId::batchNumber`).

Поля документа: `submittedAt`, `receivedBy`, `receivedAt`, `receiptScanStartedAt`, `receiptScanEndedAt`, `receiptScannedBy`, `receiptScannedByName`, `dilovodDocId`.

Степпер: `MovementMobStepperStepKey` = `prepared` | `sent` | `accepted` | `received`; опційний `shortLabel` для вузьких екранів.

---

## API мобільного циклу

| Метод | Шлях | Призначення |
|-------|------|-------------|
| `POST` | `/api/warehouse` | Створити чернетку |
| `PUT` | `/api/warehouse/:id` | Оновити items (автор: draft/active; `movement.edit`: будь-який не `deleted`) |
| `POST` | `/api/warehouse/:id/submit` | `draft` → `pending_receipt` |
| `PUT` | `/api/warehouse/:id/receipt` | Зберегти отримані кількості; оновлює `receiptScan*` (не автор, лише `pending_receipt`) |
| `POST` | `/api/warehouse/:id/confirm-receipt` | Фіналізація + Dilovod; `{ dryRun: true }` — payload |
| `POST` | `/api/warehouse/:id/sync-dilovod` | Перезапис finalized у Dilovod; теж `dryRun`; потрібен `movement.edit` |
| `DELETE` | `/api/warehouse/:id` | Soft-delete + Dilovod `delMark` |
| `GET` | `/api/warehouse/batch-numbers/:sku` | Партії з Dilovod по SKU (`includeSmallStorage`, `force`); серверний кеш 5 хв, порожні відповіді не кешуються |
| `POST` | `/api/warehouse/resolve-batch-names` | `{ batchIds?, lines? }` → `{ names, lineMeta }` з каталогу штрих-кодів |
| `GET` | `/api/warehouse/stock-snapshot` | Загальні залишки ГП/МС по SKU (для збагачення рядків) |

Експорт: `WarehouseMovementExport.exportWarehouseMovementToDilovod` (якщо є `dilovodDocId` — оновлення, інакше створення). Клієнт: `movementMobApi.ts`.

**Dilovod `getBatchNumbersBySku`:** фільтр SKU — оператор `IL` (список); `goodPart__pr` не вказувати в `fields` (API повертає помилку); при 0 партій з firm — повтор без firm; `unwrapDilovodId` / `unwrapDilovodName` для трансформації.

Міграції: `20260830120000_warehouse_movement_receipt_fields/`, `20260904120000_warehouse_movement_receipt_scan_fields/`.

---

## Файли модуля

```
client/pages/Warehouse/WarehouseMovementMob/
├── index.tsx
├── MovementMobCreatePage.tsx
├── MovementMobDocumentPage.tsx
├── MovementMobEditorPage.tsx
├── useWarehouseMovementMobDocument.ts
├── useWarehouseMovementMobList.ts
├── useMovementMobScan.ts
├── useMovementMobLinesEnrichment.ts
├── movementMobApi.ts
├── cameraMedia.ts
├── WarehouseMovementMobTypes.ts
├── WarehouseMovementMobUtils.ts
└── components/
    ├── MovementMobDocumentScreen.tsx
    ├── MovementMobScanDrawer.tsx
    ├── MovementMobSubmitSheet.tsx
    ├── MovementMobConfirmReceiptSheet.tsx
    ├── MovementMobSyncDilovodModal.tsx
    ├── MovementMobDeleteConfirmModal.tsx
    ├── MovementMobProductCard.tsx
    ├── MovementMobProductEditDrawer.tsx
    ├── MovementMobStatusStepper.tsx
    └── …
```
