# Мобільні переміщення між складами (`WarehouseMovementMob`)

**Дата:** 2026-08-30  
**Маршрути:** `/warehouse/movement-mob`, `/warehouse/movement-mob/new`, `/warehouse/movement-mob/:id`  
**Дозвіл:** `movementMob`

Окрема мобільна гілка переміщень (не десктопний `WarehouseMovement`). Документ описує редактор чернетки зі скануванням ШК, drawer кількості, swipe-дії з рядками, undo, хронологію та спільні motion-примітиви, які з’явились у цій ітерації.

Десктопний цикл «зберегти / відправити в Dilovod» лишається в `Docs/features/warehouse-movement-dilovod-export.md` і `Docs/features/warehouse-movement-refactoring.md`.

---

## Навігація та екрани

| Шлях | Компонент | Зміст |
|------|-----------|--------|
| `/warehouse/movement-mob` | `index.tsx` | Список документів, фільтри (`MovementMobFilterBar` / ActionBubble на touch-UI) |
| `/warehouse/movement-mob/new` | `MovementMobCreatePage.tsx` | Нова чернетка → редактор |
| `/warehouse/movement-mob/:id` | `MovementMobDocumentPage.tsx` | Перегляд або редагування збереженої чернетки |

Редактор: `MovementMobEditorPage.tsx`. Розмітка документа: `MovementMobDocumentScreen.tsx`.

Режими `MovementMobEditorMode`:

- `empty` — склади обрані, рядків ще немає.
- `formation` — можна сканувати, редагувати, видаляти, відправляти.
- `view` — документ уже пішов далі чернетки; жести рядків вимкнені.

---

## Сканування без прихованого input

Приховане поле ШК на сторінці прибирали: на мобільному воно крало фокус і ламало stepper / кнопки.

Джерела коду:

1. HID-сканер через `equipmentState.lastBarcode` (`useMovementMobScan`).
2. Камера: live-потік або capture (`cameraMedia.ts`, `MovementMobCameraOverlay`).
3. Кнопка **Додати ще** відкриває камеру / overlay.
4. Dropdown тієї ж кнопки — **Ввести ШК вручну** (`MovementMobManualBarcodeModal`).

Мок-штрихкоди (`MovementMobMockBarcodeBar`) рендеряться **лише в DebugMode** (`useDebug().isDebugMode`).

Dedup скану: 1000 мс на той самий код (`SCAN_DEDUPE_MS`). HID ігнорується, коли фокус на stepper у drawer або відкрита камера (`pauseHid`).

Lookup: `GET /api/warehouse/product-by-barcode?code=…` → `WarehouseProductByBarcodeResponse` (`shared/types/warehouse.ts`). Залишки складів — `stock-snapshot`. Рівень ШК: `portion` | `box` (box-коди в БД ще можуть бути відсутні; сервер зараз віддає `portion`, поки не з’явиться окремий box-код).

---

## Drawer кількості (`MovementMobScanDrawer`)

`BottomSheet` (`client/components/motion/bottom-sheet.tsx`): snap `auto`, lock скролу body через `position: fixed` (інакше iOS Safari прокручує сторінку під sheet).

Усередині:

- Назва, SKU, вага, шт. у коробці, партія, **ШК** (зберігається в рядку чернетки).
- Дві картки залишків: склад-джерело і склад-призначення. Показ **до → після** з урахуванням:
  - поточного введення в drawer;
  - уже доданих у документ порцій цього SKU (`committedPortionsForSku`), окрім рядка, який зараз редагується.
- `StepperInput` коробок / порцій.
- Підсумок порцій.
- `MovementMobSwipeConfirm` → `SlideActionButton` («Проведіть для підтвердження»).

Повторне сканування того самого ШК **не створює новий рядок одразу**: drawer відкривається з уже накопиченою кількістю цього SKU+партія, плюс +1 коробка або +1 порція залежно від `barcodeKind`.

Редагування рядка відкриває той самий drawer; `barcode` / `barcodeKind` їдуть у `MovementMobRawItem` через `serializeMobDraftItems` / `buildProductLines`, інакше ШК у drawer зникав після збереження.

Підтвердження: `replaceMovementMobLine` (редагування) або `mergeMovementMobLine` (нове сканування).

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

Кнопки під списком (`< sm`): **Додати ще** займає решту ширини, **Відправити** — `shrink-0` / `w-auto`.

---

## Видалення та undo

Видалення не одразу ріже стейт: рядок анімовано зникає (opacity + height → 0), далі знімається зі списку.

Банер `MovementMobUndoBanner`: «Видалено: {назва}», кнопка **Скасувати**, індикатор часу ~**6 с** (`UNDO_MS = 6000`). Undo вставляє рядок **на попередній індекс** (`insertMovementMobLineAt`) з `enterFromCollapsed`, щоб висота плавно розкривалась на тому ж місці, а не в кінці списку.

---

## Залишки з урахуванням чернетки

`committedPortionsForSku(lines, sku, exceptKey?)` сумує `totalPortions` усіх рядків цього SKU, опційно без рядка, який відкритий у drawer.

У drawer:

- джерело **до** = snapshot складу − committed інших рядків;
- призначення **до** = snapshot + ті самі committed;
- **після** = до ± кількість з drawer.

`breakdownStockPortions` показує коробки + розсип.

---

## Хронологія

`buildChronology` **завжди** віддає три кроки:

| Крок | done коли | Дата, якщо pending |
|------|-----------|-------------------|
| Формування списку | завжди (чернетка існує) | `draftCreatedAt` |
| Відправлено на «склад» | `active` або `finalized` | текст **«ще не відправлено»** |
| Отримано | `finalized` | текст **«ще не отримано»** |

Pending: сіра точка (`clock`), сірий заголовок, без імені користувача. Done: зелена точка (`check`), дата, автор.

Вертикальні лінії між точками: success, якщо обидва сусіди done; градієнт success → default, якщо лише верхній done; інакше `default-300`.

Хронологія рендериться на екрані документа **і для збереженої чернетки** (не лише view) — під кнопками формування, якщо є події.

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

## Типи чернетки

`MovementMobRawItem` / `MovementMobProductLineViewModel` зберігають опційно `barcode`, `barcodeKind`, щоб drawer редагування показував той самий ШК після reload.

Ключ рядка: `sku + batchId|batchNumber`.

---

## API, задіяні редактором

- `GET /api/warehouse/product-by-barcode?code=`
- snapshot залишків за SKU / складами
- CRUD чернетки переміщення (`WarehouseService` / існуючі movement endpoints)

Клієнтський шар: `movementMobApi.ts`.

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
├── movementMobApi.ts
├── cameraMedia.ts
├── WarehouseMovementMobTypes.ts
├── WarehouseMovementMobUtils.ts
└── components/
    ├── MovementMobDocumentScreen.tsx
    ├── MovementMobScanDrawer.tsx
    ├── MovementMobSwipeConfirm.tsx
    ├── MovementMobAddMoreButton.tsx
    ├── MovementMobManualBarcodeModal.tsx
    ├── MovementMobUndoBanner.tsx
    ├── MovementMobChronology.tsx
    ├── MovementMobCameraOverlay.tsx
    ├── MovementMobMockBarcodeBar.tsx
    └── …
```
