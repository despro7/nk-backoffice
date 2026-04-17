# Changelog

Всі значущі зміни в проєкті фіксуються тут.
Формат: одна секція на задачу, нові записи **додаються зверху**.


---

## 2026-04-17 — Cash-In Import: перевірка дублікатів + виправлення паралельних запитів до Dilovod
**Files:** `shared/types/cashIn.ts`, `server/services/dilovod/CashInImportService.ts`, `server/services/dilovod/CashInExportBuilder.ts`, `server/services/dilovod/DilovodApiClient.ts`, `client/pages/CashInImport/components/CashInPreviewTable.tsx`, `client/pages/CashInImport/components/CashInSummary.tsx`

- Додано статус `duplicate_cash_in` — якщо для замовлення вже заповнено `dilovodCashInDate` в БД, рядок позначається як можливий дублікат.
- В таблиці preview для рядків-дублікатів відображається жовтий банер з попередженням та тоглом "Все одно відправити" (за замовчуванням вимкнений).
- `CashInSummary` включає дублікати до відправки лише якщо менеджер явно увімкнув тогл; показує чіп "Дублікати: N".
- Виправлено `buildPayloads`: замінено `Promise.all` на послідовний `for`-цикл — Dilovod повертав `multithreadApiSession blocked` при паралельних запитах.
- Виправлено `findPersonByPhone` в `DilovodApiClient`: при відповіді `{"error":"..."}` тепер кидається виключення замість повернення `undefined`.

---


**Files:** `client/components/OrderViewHeader.tsx`, `client/hooks/useReceiptPrinting.ts`, `client/pages/OrderView.tsx`

- Видалено legacy-логіку `handleFetchReceipt` / `tryOpenWordPressPDF` з `OrderViewHeader` — замінено на props-based підхід.
- `OrderViewHeader` тепер приймає `onPrintReceipt`, `onViewReceipt`, `onPrintWarehouseChecklist`, `onViewWarehouseChecklist`.
- **1 фіскальний чек:** `ButtonGroup` — основна кнопка = 🖨 друк через QZ Tray, dropdown зі стрілкою = preview у браузері + секція warehouse.
- **Кілька фіскальних чеків:** основна кнопка = друк першого, dropdown = пари "Друкувати / Переглянути" для кожного + секція warehouse.
- `useReceiptPrinting` розширено: `handlePrintReceipt(type?, receiptIndex?)` та `handleViewReceipt(type?, receiptIndex?)` тепер підтримують передачу індексу конкретного чека до `ReceiptClientService`.
- `OrderView.tsx` передає всі 4 пропси до `OrderViewHeader`, warehouse чек-лист прив'язаний до `handlePrintReceipt('warehouse')` / `handleViewReceipt('warehouse')`.

---

## 2026-04-15 — Фікс: ESC/POS друк через QZ Tray — перехід на format:'hex'
**Files:** `client/services/printerService.ts`, `client/pages/SettingsEquipment.tsx`, `scripts/escpos-tcp-listener.js` *(new)*, `Docs/hardware/receipt-printer-escpos.md`

- **Проблема:** `format:'plain'` і `format:'base64'` ламали CP866 кирилицю — QZ Tray перекодовував дані через системне CP1251 (Windows), ігноруючи параметр `encoding` в конфізі.
- **Рішення:** `PrinterService.printRaw()` тепер конвертує байти у HEX рядок і передає як `{ type:'raw', format:'hex', data: hexString }` — QZ Tray передає байти 1:1 без жодного перекодування.
- **Діагностика:** додано тимчасовий блок «🧪 Діагностика QZ Tray» в `SettingsEquipment.tsx` (6 кнопок-тестів) і скрипт `scripts/escpos-tcp-listener.js` — TCP емулятор принтера з HEX дампом.
- **Підтверджено через TCP listener:** CP866 байти для "Тест" = `92 a5 e1 e2` ✅

---

## 2026-04-15 — Друк складських чек-листів і фіскальних чеків через QZ Tray (ESC/POS)
**Files:**
`client/services/printerService.ts`,
`client/services/ReceiptService.ts`,
`client/lib/receiptTemplates.ts`,
`client/components/OrdersTable.tsx`,
`client/pages/SettingsEquipment.tsx`,
`Docs/hardware/receipt-printer-escpos.md` *(new)*

- **`PrinterService.printRaw()`** — новий метод для відправки ESC/POS байтів на термопринтер через QZ Tray; використовує `type:'raw', format:'plain', data: number[]` — єдиний надійний спосіб передачі бінарних ESC/POS даних без перекодування на стороні QZ Tray.
- **`PrinterService.escPosToBytes()`** — конвертує Unicode JavaScript рядок у `number[]` з кодуванням CP866; статична таблиця `UNICODE_TO_CP866` охоплює А-Я, а-я, Ё/ё та апроксимацію для Ї/Є/Ґ.
- **`PrinterService.printPdf()`** — виправлено параметри для 58мм рулону: `size:{width:58, height:null}, units:'mm', scaleContent:true`.
- **`generateWarehouseChecklistEscPos()`** — новий ESC/POS шаблон складського чек-листа (32 символи ширина, список товарів з кількостями, склад комплектів, підсумок, автообрізка).
- **`generateFiscalReceiptEscPos()`** — новий ESC/POS шаблон фіскального чека з Dilovod JSON (шапка ФОП, товари, оплата, QR-код ДПС).
- **`ESC t 0x11`** — команда вибору кодової сторінки CP866 (code page 17) додана на початок обох ESC/POS шаблонів.
- **`OrdersTable.tsx`** — кнопка "Чек": якщо принтер налаштований → `expandProductSets()` + `printWarehouseChecklist()`; інакше → HTML у `window.open()`.
- **`SettingsEquipment.tsx`** — новий розділ "Принтер чеків (QZ Tray)": поля увімкнення, назви принтера, ширини, щільності + кнопка тесту.
- **Діагностичний лог** у `printRaw`: `[printRaw] ESC/POS input length: N → bytes: M` у консолі браузера.
- **Документація:** `Docs/hardware/receipt-printer-escpos.md` — повний опис архітектури, CP866 таблиці, діагностики та обмежень.
---

## 2026-04-15 — Рефакторинг: видалення useWarehouse.ts
**Files:** `client/hooks/useWarehouse.ts` (видалено), `client/pages/Warehouse/WarehouseMovement/useWarehouseMovement.ts`, `client/pages/Warehouse/WarehouseMovement/index.tsx`
- Видалено застарілий хук `useWarehouse.ts` з `client/hooks/` — 4 з 12 методів були мертвим кодом.
- API-функції вбудовано безпосередньо у `useWarehouseMovement` через `useApi` + `useCallback`.
- `useWarehouseMovement()` тепер викликається без параметрів.
---

## 2026-04-13 — Кнопка "Оновити деталі" + кешування деталей в БД + фільтри пресетів дат в Історії переміщень
**Files:**
`shared/types/movement.ts`, `server/modules/Warehouse/WarehouseTypes.ts`,
`server/modules/Warehouse/MovementHistoryService.ts`, `server/modules/Warehouse/WarehouseController.ts`,
`client/components/MonthSwitcher.tsx` *(new)*,
`client/pages/Warehouse/shared/MovementHistoryTable.tsx`,
`client/pages/Warehouse/WarehouseMovement/useMovementHistory.ts`,
`client/pages/Warehouse/WarehouseMovement/components/MovementHistoryTab.tsx`,
`client/pages/Warehouse/WarehouseMovement/index.tsx`

- **Кнопка "Оновити деталі"** у акордіоні кожного документа (доступна всім ролям); `?force=true` обходить кеш і йде в Діловод
- **Кешування деталей в БД**: `GET /details/:id` спочатку перевіряє `warehouse_movement.items` — якщо є, повертає з `fromCache: true`; в Діловод тільки при порожньому кеші або `force=true`
- **Збагачення при завантаженні списку**: `GET /history` після отримання документів від Діловода — одним запитом дістає `items` з БД і вкладає `details` прямо у відповідь; акордіони з уже збереженими товарами розкриваються без запиту
- **Skip existing при persist**: `persistDocumentsToDB` тепер робить `findMany` → `create` тільки для нових документів (раніше `upsert` для всіх)
- **Пресети дат** в `MovementHistoryTab`: 7 днів (дефолт) / 14 / 30 / По місяцях
- **`MonthSwitcher`** — shared компонент (`client/components/`): `←` / Select-місяць / `→`; `disableFuture` блокує майбутні місяці
- **`toDate`** параметр наскрізно: `shared/types`, `WarehouseTypes`, `MovementHistoryService` (фільтр `date < toDate` в Діловод), `WarehouseController`
- Виправлено баг in-memory кешу деталей: раніше `setDocuments` не зупиняв виконання `fetchDetails`, запит все одно йшов

---

## 2026-04-11 — Кешування партій + виправлення передачі дати

**Files:** `server/modules/Warehouse/WarehouseController.ts`, `client/.../hooks/useBatchNumbers.ts`, `useMovementProducts.ts`, `useMovementDraftState.ts`, `useMovementSync.ts`, `useWarehouseMovement.ts`, `MovementProductRow.tsx`, `BatchNumbersAutocomplete.tsx`

- Серверний in-memory кеш для `/batch-numbers/:sku`: TTL 12 год для старих дат, 5 хв для свіжих; `?force=true` скидає кеш; кнопка 🔄 у Drawer
- Виправлено: `asOfDate` не передавалась у `refreshBatchQuantities` при завантаженні чернетки/документа — `loadDraftIntoProducts` отримав параметр `asOfDate?`
- Виправлено баг дублікатів партій: перевірка унікальності за `batchId:storage`; вже додані партії відображаються у Drawer з беджем "Вже додано"

---

## 2026-04-11 — Відправка переміщень між складами до Діловода
**Files:** `prisma/schema.prisma`, `prisma/seed.ts`, `server/modules/Warehouse/WarehousePayloadBuilder.ts` *(new)*, `server/modules/Warehouse/WarehouseController.ts`, `server/routes/settings.ts`, `server/types/warehouse.ts`, `shared/types/movement.ts`, `client/hooks/useWarehouseMovementSettings.ts` *(new)*, `client/pages/SettingsWarehouseMovement.tsx` *(new)*, `client/routes.config.tsx`, `client/pages/Warehouse/WarehouseMovement/index.tsx`, `client/pages/Warehouse/WarehouseMovement/components/PayloadPreviewModal.tsx`, `client/pages/Warehouse/WarehouseMovement/components/MovementActionBar.tsx`, `client/pages/Warehouse/shared/WarehouseMovementTypes.ts`, `client/pages/Warehouse/WarehouseMovement/components/MovementDraftsTab.tsx`
- Серверний `WarehousePayloadBuilder` — читає налаштування з БД, будує Dilovod payload
- `POST /api/warehouse/movements/send` — підтримує `dryRun=true` (preview) та `dryRun=false` (відправка)
- `GET/PUT /api/settings/warehouse-movement` — CRUD налаштувань переміщення
- Нова сторінка `/settings/warehouse-movement` (тільки ADMIN) з вибором фірми/складів/параметрів
- `PayloadPreviewModal` рефакторинг — приймає готовий payload з сервера, прибрано клієнтську побудову
- `MovementActionBar` — нова кнопка «Показати payload» видима тільки адміністраторам
- `WarehouseMovement` schema: видалено `createdAt`/`updatedAt`, додано `docNumber`, `dilovodDocId`; `User`: додано `dilovodUserId`
- 8 seed-записів `settings_base` з `category='warehouse_movement'`

---

## 2026-04-09 — Автокомпліт партій + ліміти по залишках у WarehouseMovement

### Огляд
Реалізовано повний цикл вибору партії товару при переміщенні між складами: від UI-компонента вибору до обмеження введення кількості на основі залишків обраної партії, та автоматичного коригування при зміні партії.

### Backend

**`server/services/dilovod/DilovodApiClient.ts`**
- Додано метод `getBatchNumbersBySku(sku, firmId?)` — запит до регістру залишків Dilovod з dimension-фільтрами `["good", "goodPart", "storage", "firm"]`
- Повертає масив `{ batchNumber, storage, storageDisplayName, quantity, firm, firmDisplayName }`
- `quantity` = `parseFloat(row.qty)` — завжди числовий тип

**`server/services/dilovod/DilovodService.ts`**
- Додано публічний метод `getBatchNumbersBySku(sku, firmId?)` як проксі до `DilovodApiClient`

**`server/modules/Warehouse/WarehouseController.ts`**
- Новий ендпоінт `GET /api/warehouse/batch-numbers/:sku` — повертає партії по SKU
- Фільтрація малого складу (`config.smallStorageId`) — переміщення завжди з основного до малого, партії малого складу не показуються

**`server/modules/Warehouse/WarehouseService.ts`**
- В `getProductsForMovement()` додано поля `batchStorage: ''` і `batchQuantity: 0` до об'єкта `details` кожного товару — без цього ліміти не працювали

### Frontend

**`client/pages/Warehouse/WarehouseMovement/hooks/useBatchNumbers.ts`** *(новий файл)*
- Хук `useBatchNumbers()` з 5-хвилинним кешуванням (`Map`) та `AbortController` для скасування попередніх запитів
- Сортування партій за спаданням кількості

**`client/pages/Warehouse/WarehouseMovement/components/BatchNumbersAutocomplete.tsx`** *(новий файл)*
- Drawer-компонент (HeroUI v2.8 flat imports: `Drawer`, `DrawerContent`, `DrawerHeader`, `DrawerBody`, `DrawerFooter`)
- Відкривається зліва при фокусі на полі "№ партії"
- Prop `selectedStorage` для коректного підсвічування: `isSelected = batchNumber === selected && storage === selectedStorage`
- Виправлено нескінченний цикл відкриття/закриття: HeroUI при закритті відновлює фокус на input → `isDrawerJustClosed` ref-прапорець ігнорує цей `onFocus`

**`client/pages/Warehouse/WarehouseMovement/components/MovementProductRow.tsx`**
- Інтеграція `BatchNumbersAutocomplete` та `useBatchNumbers`
- `handleBatchSelect` зберігає три поля: `batchNumber`, `batchStorage`, `batchQuantity`
- **Автоматична корекція при виборі партії**: якщо поточна кількість перевищує залишок обраної партії — автоматично встановлюється максимально можлива кількість коробок + залишкові порції, показується `ToastService` warning
- IIFE в JSX для обчислення `maxBoxes` та `maxPortions` на основі `batchQuantity`

**`client/pages/Warehouse/shared/StepperInput.tsx`**
- Додано проп `max?: number`
- `onChange` клампує значення: `Math.max(0, Math.min(v, max))`
- Кнопка `+` disabled коли `value >= max`

**`client/pages/Warehouse/shared/WarehouseMovementTypes.ts`**
- Додано поля `batchStorage: string` і `batchQuantity: number` до `details` в `MovementProduct`
- Додано поле `batchStorage: string` до `MovementItem`

**`client/pages/Warehouse/shared/WarehouseMovementUtils.ts`**
- `serializeMovementItems` тепер включає `batchStorage` при збереженні в БД

**`client/pages/Warehouse/WarehouseMovement/useWarehouseMovement.ts`**
- `handleProductChange` обробляє нові поля `'batchStorage'` і `'batchQuantity'`
- `loadDraftIntoProducts` відновлює `batchStorage` з чернетки при завантаженні

### Виправлені баги
- **Ліміти не працювали**: сервер не повертав `batchStorage`/`batchQuantity` в `details` → `batchQuantity` завжди `0` або `undefined` → `Infinity` як fallback. Виправлено в `WarehouseService.getProductsForMovement()`
- **Нескінченний цикл Drawer**: HeroUI focus restore → `isDrawerJustClosed` ref
- **Обидві партії підсвічувались**: порівняння лише `batchNumber` без `storage` → додано `selectedStorage` prop

---

## 2026-04-06 — Рефакторинг WarehouseMovement на основі WarehouseInventory
**Files:** 
- Видалено: `client/pages/WarehouseMovement.tsx`
- Створено: `client/pages/Warehouse/WarehouseMovement/` (структурована папка)
  - `index.tsx` — головний компонент-оркестратор
  - `useWarehouseMovement.ts` — весь стан, API, handlers
  - `components/` — UI-компоненти (6 шт)
- Створено: `client/pages/Warehouse/shared/WarehouseMovementTypes.ts` — типи для переміщень
- Створено: `client/pages/Warehouse/shared/WarehouseMovementUtils.ts` — утиліти для переміщень
- Оновлено: `client/routes.config.tsx` — новий імпорт

**Особливості:**
- ✅ Список товарів без матеріалів (коробок) — тільки страви
- ✅ Без прогрес-бару (все переміщується одразу)
- ✅ **Нова кнопка "Синхронізувати залишки"** — перезавантажує залишки з сервера
- ✅ Два складози: "Основний" → "Малий"
- ✅ Архітектура на основі WarehouseInventory для масштабованості
- ✅ Повна типізація TypeScript
- ✅ Спільне використання `StepperInput`, `InfoDisplay` з `shared/`

Документація: `Docs/features/warehouse-movement-refactoring.md`

---

## 2026-04-06 — Форматування помилок Dilovod: розділення товарів на рядки
**Files:** `server/services/dilovod/DilovodUtils.ts`, `server/services/dilovod/DilovodAutoExportService.ts`, `server/routes/dilovod.ts`

Додано дві функції для очищення помилок експорту:
- **`cleanDilovodErrorMessageShort()`** — коротка версія для UI (14% розміру): видаляє HTML, показує назву товару + артикул
- **`cleanDilovodErrorMessageFull()`** — повна версія для логів (56% розміру): зберігає деталі, **розділяє товари на окремі рядки**

Інтегровано у `DilovodAutoExportService` та `/api/dilovod/*` маршрути (експорт + відвантаження).
Результат: ✅ NotificationBell показує читабельні помилки, товари розділені на рядки з "-".
Документація: `Docs/architecture/dilovod-error-formatting.md`

---

## 2026-04-06 — Жорстка валідація товарів при розгортанні замовлення + усунення помилок у пропаганді
**Files:**
- Змінено: `client/lib/orderAssemblyUtils.ts`
- Змінено: `client/pages/OrderView.tsx`

**Проблема:** При помилці завантаження товарів (напр., 404) помилка ловилась в двох місцях і глушилась, модалка не показувалась

**Рішення:**
1. **expandProductRecursively** (line 192): Замість тихої обробки помилки (`console.error` без `throw`) — тепер викидається помилка (`throw error`) щоб вона пробилась вгору
2. **expandProductSets** (line 265-303): Видален `try-catch` блок, який додавав товар як fallback — тепер помилки пробиваються прямо до OrderView.tsx
3. **OrderView.tsx**: Вже налаштована обробка помилок
   - Показується модалка з деталями помилки та пропозицією синхронізувати товари
   - Додана функція `handleSyncProducts` для запуску синхронізації товарів з Dilovod прямо з модалки
   - Модалка не закривається натиском на фон (isDismissable=false) — оператор повинен вибрати рішення

**Результат:** ✅ Помилки завантаження товарів тепер видимі оператору через модальне вікно з опцією синхронізації

---

## 2026-04-05 — Критична валідація товарів при експорті в Dilovod
**Files:** `server/services/dilovod/DilovodExportBuilder.ts`

- Додано новий приватний метод `validateOrderGoods()` для критичної валідації товарів перед експортом
- Система тепер **блокує експорт**, якщо:
  - Жодного товару не оброблено (всі товари мають помилки)
  - Деякі товари з замовлення не знайдені в локальній БД або не мають `dilovodId`
  - Кількість оброблених товарів менша за кількість товарів у замовленні
- Раніше такі товари були просто warnings, система пропускала їх і експортувала неповні замовлення
- Валідація застосована як для `buildExportPayload` (замовлення), так і для `buildSalePayload` (відвантаження)
- Детальні повідомлення про пропущені товари з їх назвами та SKU логуються в meta_dilovod_exports

---

## 2026-04-05 — useUnsavedGuard: блокування навігації при незбережених змінах
**Files:**
- Додано: `client/hooks/useUnsavedGuard.ts`
- Додано: `client/components/modals/UnsavedChangesModal.tsx`
- Змінено: `client/pages/Warehouse/WarehouseInventory/useWarehouseInventory.ts`
- Змінено: `client/pages/Warehouse/WarehouseInventory/index.tsx`
- Додано: `Docs/architecture/unsaved-guard.md`

- Загальний хук `useUnsavedGuard` — перехоплює програмну навігацію (react-router push/replace), кнопки «назад/вперед» (popstate) та закриття вкладки (beforeunload)
- Сумісний з `BrowserRouter` через `UNSAFE_NavigationContext` (без потреби в data router)
- `UnsavedChangesModal` — модалка з трьома кнопками: «Зберегти і вийти», «Вийти без збереження», «Залишитись»; всі тексти кастомізуються через props
- В `useWarehouseInventory` додано `isDirty` (JSON-snapshot порівняння) та `lastSavedSnapshotRef` для відстеження змін
- Підключено на сторінці інвентаризації складу
---

## 2026-04-04 — Рефакторинг WarehouseInventory: розбивка на модулі + нова структура Warehouse/
**Files:**
- Видалено: `client/pages/WarehouseInventory.tsx`
- Додано: `client/pages/Warehouse/shared/WarehouseInventoryTypes.ts`
- Додано: `client/pages/Warehouse/shared/WarehouseInventoryUtils.ts`
- Додано: `client/pages/Warehouse/shared/StepperInput.tsx`
- Додано: `client/pages/Warehouse/shared/InfoDisplay.tsx`
- Додано: `client/pages/Warehouse/shared/HistoryTable.tsx`
- Додано: `client/pages/Warehouse/WarehouseInventory/index.tsx`
- Додано: `client/pages/Warehouse/WarehouseInventory/useWarehouseInventory.ts`
- Додано: `client/pages/Warehouse/WarehouseInventory/components/ProductRow.tsx`
- Додано: `client/pages/Warehouse/WarehouseInventory/components/InventoryProductList.tsx`
- Додано: `client/pages/Warehouse/WarehouseInventory/components/InventoryProgressBar.tsx`
- Додано: `client/pages/Warehouse/WarehouseInventory/components/InventorySummaryTable.tsx`
- Додано: `client/pages/Warehouse/WarehouseInventory/components/InventoryActionBar.tsx`
- Додано: `client/pages/Warehouse/WarehouseInventory/components/InventoryStartScreen.tsx`
- Додано: `client/pages/Warehouse/WarehouseInventory/components/InventorySessionMeta.tsx`
- Додано: `client/pages/Warehouse/WarehouseInventory/components/InventoryHistoryTab.tsx`
- Додано: `client/pages/Warehouse/WarehouseInventory/components/InventoryCommentModal.tsx`
- Оновлено: `client/routes.config.tsx`

Монолітний файл `WarehouseInventory.tsx` (1264 рядки) розбито на модулі без зміни поведінки.
Введено папку-контейнер `pages/Warehouse/` для всіх сторінок розділу "Склад".
`shared/` містить компоненти (`StepperInput`, `InfoDisplay`, `HistoryTable`) та утиліти, що будуть повторно використані в `WarehouseMovement` після його рефакторингу.

Докладніше: `Docs/features/warehouse-inventory-refactoring.md`

---

## 2026-04-01 — Нормалізація номерів телефонів для контрагентів Dilovod
**Files:** `shared/utils/phoneNormalizer.ts`, `server/services/dilovod/DilovodExportBuilder.ts`

Винесена в утиліти функція нормалізації номерів телефонів до формату 38 (0→380, видаляє спецсимволи). Використовується при пошуку/створенні контрагентів для правильної ідентифікації в Dilovod API.

---

## 2026-04-01 — Виправлення розрахунку порцій для монолітних комплектів
**Files:** `client/lib/orderAssemblyUtils.ts`, `client/types/orderAssembly.ts`, `client/pages/OrderView.tsx`, `client/components/OrderChecklist.tsx`

**Problem:** Прогрес-бар показував "63/37" замість "37/37"; монолітні комплекти (категорія 20) відображались як "Вінегрет × 4" замість "× 1".

**Solution:**
- Додано поле `portionsPerItem?: number` до типу `OrderChecklistItem`
- При розподілі по коробках: розраховуємо розподіл порцій, але зберігаємо оригінальну кількість комплектів (не помножену)
- Оновлено розрахунок `totalPortions` та `totalPackedPortions` для коректного множення на `portionsPerItem`

**Result:** ✅ Прогрес-бар "37/37", на екрані "Вінегрет × 1" = 4 порції

Докладніше `Docs/features/monolithic-sets-handling.md`

---

## 2026-04-01 — Функціонал "Монолітних категорій" у збірці замовлень
**Files:** `server/routes/products.ts`, `client/components/SettingsProductSets.tsx`, `client/lib/orderAssemblyUtils.ts`
- Виправлено проблему з монолітними категоріями: певні категорії продуктів тепер правильно не розгортаються під час збірки замовлень
- Додано API endpoint `GET /api/products/categories-mapping` для отримання мапінгу назв категорій на їх ID
- Переміщено маршрут `categories-mapping` перед маршрутом `/:sku` для уникнення конфлікту маршрутів
- Виправлено логіку порівняння в `orderAssemblyUtils.ts`: тепер використовується `product.categoryId` замість `product.categoryName`
- Додано конвертацію старих назв категорій на ID в `SettingsProductSets.tsx` для сумісності з існуючими налаштуваннями

---

## 2026-03-30 — Інвентаризація малого складу: реальні дані + збереження чернеток
**Files:** `server/routes/warehouse.ts`, `client/pages/WarehouseInventory.tsx`, `client/pages/SettingsProductSets.tsx`, `prisma/schema.prisma`, `prisma/migrations/20260329234602_add_inventory_sessions/`, `prisma/migrations/20260329232854_add_portions_per_box_to_products/`

- Додано таблицю `inventory_sessions` (Prisma schema + міграція) — зберігає `status`, `comment`, `items` (JSON), `createdBy`, `completedAt`
- Додано поле `portionsPerBox Int @default(24)` до моделі `Product` (міграція)
- Реалізовано 6 нових BE endpoints: `GET/POST /inventory/draft`, `PUT/DELETE /inventory/draft/:id`, `POST /inventory/draft/:id/complete`, `GET /inventory/history`
- Додано `GET /inventory/products` — список товарів з ненульовим залишком на малому складі; маршрут зареєстрований до `GET /:id` (виправлення routing conflict)
- `WarehouseInventory.tsx`: при mount автоматично відновлює незавершену чернетку (`loadDraft`); "Зберегти чернетку" → реальний PUT/POST API; "Завершити" → `complete` endpoint; "Скасувати" → DELETE; таб "Історія" → реальні дані з пагінацією (lazy load)
- `SettingsProductSets.tsx`: додано колонку "Порцій/кор." з inline-редагуванням (`PUT /api/products/:id/portions-per-box`); для комплектних товарів показується `—` (без можливості редагування)

---

## 2026-03-29 — Реорганізація /Docs та оновлення copilot-instructions
**Files:** `.github/copilot-instructions.md`, `Docs/` (всі файли)
- Додано секцію `Copilot Behavior Rules` в `copilot-instructions.md`: мова відповідей, процес роботи перед задачею, документування змін
- Розширено секцію `TypeScript Everywhere`: сильна типізація, try-catch, продуктивність
- Додано секцію `UI & Styling`: HeroUI як основна бібліотека, TailwindCSS v4, UX-принципи
- Реорганізовано `/Docs` — створено підпапки: `architecture/`, `features/`, `integrations/`, `hardware/`, `api/`, `guides/`
- Переміщено всі існуючі файли по відповідних підпапках
- Замінено `CHANGELIST.md` на `CHANGELOG.md` з новим форматом

---

## 2026-03-29 — Імпорт ORDER_STATUSES з formatUtils у ProductStatsTable
**Files:** `client/components/ProductStatsTable.tsx`, `client/lib/formatUtils.ts`
- Видалено локальний масив `statusOptions` з хардкодженими статусами
- Додано імпорт `ORDER_STATUSES` з `client/lib/formatUtils.ts`
- `statusOptions` тепер є псевдонімом `ORDER_STATUSES` (включаючи статус 9 — "На утриманні")

---

## 2026-03-28 — Централізований контроль доступу (RBAC)
**Files:** `shared/constants/roles.ts`, `server/middleware/auth.ts`, `server/routes/dilovod.ts`, `server/routes/products.ts`, `server/routes/salesdrive.ts`, `client/routes.config.tsx`
- Створено `shared/constants/roles.ts` — єдине джерело правди для ролей, ієрархії та утиліт `hasAccess`, `requireMinRole`
- Рефакторинг `server/middleware/auth.ts`: нові функції `requireMinRole()` (ієрархія) та `requireRole()` (точний список)
- Видалено дублювання перевірок ролей з роутів — замінено на middleware
- `client/routes.config.tsx` імпортує `ROLES`, `ROLE_HIERARCHY`, `hasAccess` з `shared/constants/roles.ts`

---

## 2026-03-28 — Поля документів повернення замовлень + глобальне приховання нотифікацій
**Files:** `prisma/schema.prisma`, `server/routes/dilovod.ts`, `server/routes/notifications.ts`, `client/components/SalesDriveOrdersTable.tsx`, `client/lib/formatUtils.ts`
- Додано поля `dilovodReturnDate` та `dilovodReturnDocsCount` в модель `Order` (Prisma + міграція)
- Логіка обробки документів повернення у `DilovodService` з перевіркою дублів
- Новий ендпоінт: `POST /api/notifications/hide-all` (тільки для ADMIN)
- Розширено `formatUtils.ts` з новими утилітами

---

## 2026-03-26 — Модальні вікна очищення кешу + фільтр складу для залишків
**Files:** `client/components/modals/CacheRefreshConfirmModal.tsx`, `client/hooks/useCacheRefreshModals.ts`, `server/routes/orders.ts`, `server/services/dilovod/DilovodApiClient.ts`
- Виділено `CacheRefreshConfirmModal` та `CachePeriodSelectModal` як окремі компоненти (замість inline-реалізацій у 4 таблицях)
- Новий хук `useCacheRefreshModals` для управління станом модалок
- Серверний ендпоінт валідації кешу тепер підтримує параметри як з body, так і з query
- `DilovodApiClient`: фільтрація залишків по `firmId`

---

## 2026-03-26 — Розділення звітів + Sidebar з динамічними групами
**Files:** `client/pages/ReportsSales.tsx`, `client/pages/ReportsShipment.tsx`, `client/components/Sidebar.tsx`, `client/components/ShipmentSummaryCards.tsx`, `client/routes.config.tsx`
- Сторінка `Reports.tsx` розділена на `ReportsSales.tsx` та `ReportsShipment.tsx`
- `Sidebar` підтримує динамічні групи навігації на основі ролі користувача
- Новий компонент `ShipmentSummaryCards` для відображення статистики відвантажень
- Утиліти обробки помилок Dilovod API export у `DilovodUtils.ts`

---

## 2026-03-25 — Гнучке налаштування синхронізації Dilovod
**Files:** `server/services/cronService.ts`, `shared/types/dilovod.ts`, `client/components/DilovodSettingsManager.tsx`, `client/pages/SettingsOrders.tsx`
- Нові поля налаштувань: `mainStorageId`, `smallStorageId`, `productsInterval/Hour/Minute`, `ordersInterval/Hour/Minute`, `ordersBatchSize`, `ordersRetryAttempts`
- `cronService` перезапускає джоби з новими параметрами при збереженні налаштувань Dilovod
- Deprecated: `storageIdsList` → замінено на `mainStorageId` + `smallStorageId`

---

## 2026-03-23 — DilovodAutoExportService + Додано центр нотифікацій (дзвіночок)
**Files:** `server/services/dilovod/DilovodAutoExportService.ts`, `server/routes/notifications.ts`, `client/components/NotificationBell.tsx`, `client/hooks/useNotifications.ts`
- Новий сервіс `DilovodAutoExportService`: автоматичний експорт та відвантаження замовлень при зміні статусу
- Кешування налаштувань у сервісі для оптимізації продуктивності
- Центр нотифікацій: новий компонент `NotificationBell`, хук `useNotifications`, роути `/api/notifications`
- `productExportHelper` для централізованої підготовки payload при експорті в SalesDrive

---

## 2026-03-22 — Рефакторинг алгоритму пакування в ящики
**Files:** `client/lib/orderAssemblyUtils.ts`, `client/components/BoxSelector.tsx`, `server/routes/boxes.ts`
- Переписано алгоритм розподілу порцій: покращена логіка переповнення та балансування між ящиками
- Рефакторинг `BoxSelector.tsx` з видаленням зайвої логіки

---

## 2026-03-20 — Розширена статистика відвантажених продуктів на Dashboard
**Files:** `client/components/ProductsStatsSummary.tsx`, `client/pages/Dashboard.tsx`, `server/routes/products.ts`
- Новий компонент `ProductsStatsSummary` з детальними метриками по відвантаженням
- `Dashboard` розширено з окремими блоками статистики замовлень та продуктів
- Серверний ендпоінт `/api/orders/products/stats` розширено додатковими полями

---

## 2026-03-19 — Виявлення дублів у Dilovod + bulk force recheck
**Files:** `server/routes/dilovod.ts`, `server/services/dilovod/DilovodService.ts`, `prisma/schema.prisma`, `client/components/SalesDriveOrdersTable.tsx`
- Нове поле `dilovodDuplicateCount` в моделі `Order` (міграція)
- Логіка виявлення дублів документів з підтримкою offset при пошуку
- Новий ендпоінт bulk force recheck для масової перевірки замовлень
- UI в `SalesDriveOrdersTable`: кнопки force recheck та відображення дублів

---

## 2026-03-19 — Управління Set Parent IDs для комплектів Dilovod
**Files:** `client/pages/SettingsProductSets.tsx`, `server/routes/products.ts`, `server/services/dilovod/DilovodSyncManager.ts`
- Отримання та збереження Parent IDs для комплектів (sets) через Dilovod API
- Сторінка `SettingsProductSets` значно розширена функціоналом управління
- `DilovodSyncManager` оновлено для роботи з Parent IDs при синхронізації

---

## 2026-03-17 — Force recheck замовлень Dilovod
**Files:** `server/routes/dilovod.ts`, `client/components/SalesDriveOrdersTable.tsx`
- Новий ендпоінт force recheck з можливістю скидання та повторної валідації
- UI: кнопка force recheck у таблиці замовлень SalesDrive


<!-- Попередні зміни з CHANGELIST.md (жовтень 2025) -->

## 2025-10-18 — Налаштування години звітного дня
**Files:** `server/routes/settings.ts`, `prisma/schema.prisma`, `client/components/`, `shared/`
- Додано таблицю `settings_base` з ключем `reporting_day_start_hour`
- Реалізовано GET/PUT `/api/settings/reporting-day-start-hour`
- Додано UI для налаштування в панелі адміністратора
- Документація: `Docs/features/reporting-day/`

---