# Changelog

Всі значущі зміни в проєкті фіксуються тут.
Формат: одна секція на задачу, нові записи **додаються зверху**.

---

## 2026-09-02 — Відомість складу: таблиця, виключення, рентабельність
**Files:** `shared/types/warehouseStatement.ts`, `server/services/dilovod/WarehouseStatementService.ts`, `client/pages/Reports/ReportsWarehouseStatement/**`, `client/pages/Reports/shared/constructor/**`, `client/components/UndoActionBanner.tsx`, `Docs/features/warehouse-statement.md`

- Таблиця поза Card, `h-full`; темна sticky-шапка; ресайз «Найменування» на всю висоту; min-width колонок; згортання груп по назві; один склад — без зайвого рядка групи; від’ємні числа червоні; pin «Разом».
- Виключення груп/товарів у `POST` і пресеті; іконка в рядку, undo 6 с, лічильник і скидання в конструкторі.
- Колонка **Рентабельність** (з «Ціна продажу», за замовчуванням увімкнена): `(ціна − собівартість) ÷ ціна`; не рахується при собівартості ≤ 0; світлофор ≥30 / 15–30 / <15; заголовок «Рент.».
- Заголовки колонок лише `full` / `short` (опцію «бейджем» прибрано).
- Деталі: `Docs/features/warehouse-statement.md`.

---

## 2026-09-02 — Звіти: відомість по складу (конструктор + BAT Dilovod)
**Files:** `shared/types/warehouseStatement.ts`, `server/services/dilovod/WarehouseStatementService.ts`, `server/routes/reports-warehouse.ts`, `client/pages/Reports/ReportsWarehouseStatement/**`, `client/pages/Reports/shared/constructor/**`, `Docs/features/warehouse-statement.md`

- Сторінка **Звіти → Відомість по складу** (`/reports/warehouse-statement`, `page.reports.warehouseStatement`, storekeeper+). Залишки/обороти з `balanceAndTurnover` регістру `goods`; імена полів з `getRegisterShape`, не хардкод.
- Конструктор: відбір, DnD-групування, колонки; дерево рядків; Excel. Без складу / групи / товару запит відхиляється.
- Дефолти: групування склад → група → товар; колонки **Кількість** + **Собівартість** (BAT + «за одиницю», без валюти й цін продажу); період `lastMonth`. Пресет `localStorage` `…constructorPreset.v4`.
- Деталі: `Docs/features/warehouse-statement.md`.

---

## 2026-09-01 — Dilovod: модуль метаданих (listMetadata / getMetadata)
**Files:** `server/services/dilovod/{DilovodApiClient,DilovodMetadataService,DilovodTypes,index}.ts`, `server/routes/dilovod.ts`, `Docs/integrations/dilovod-metadata.md`

- `DilovodApiClient`: `listMetadata`, `getMetadataByName` / `getMetadataById` через чергу `makeRequest`. `getSettlementsKinds` без хибного `params.id`.
- `DilovodMetadataService`: кеш 24 год (memory + `settings_base` `dilovod.meta.*`), резолв коротких імен (пріоритет регістрів), `getRegisterShape`, `virtualBatFields` для BAT.
- HTTP: `GET /api/dilovod/metadata` і `/:objectName` (`q`, `refresh`), право `dilovodRead`.
- Деталі: `Docs/integrations/dilovod-metadata.md`.

---

## 2026-08-31 — Комплектація: ops-кеш, комплекти з каталогу, динамічні набори
**Files:** `server/modules/Products/{ProductOpsCache,CatalogOpsLookup}.ts`, `server/services/expandService.ts`, `server/routes/products.ts`, `client/lib/{orderAssemblyUtils,productLookupCache}.ts`, `client/components/OrderChecklistItem.tsx`, `Docs/features/expand-flatten-calc.md`, `Docs/features/products-catalog-2.0.md`, `Docs/features/order-assembly/dynamic-monolithic-order-payload.md`

- `ProductOpsCache` (TTL 2 хв): знімок `products` + залишки `catalog_goods` + BOM лише для `accPolicy` комплект. `POST /api/expand/flatten` і `GET /api/products/:sku` читають знімок; інвалідація після стоку/проєкції.
- `set` у комплектації = товарний набір, не рецептура страви. Динамічний моноліт дивиться на каталожний сток, не на порожнє дзеркало `products`.
- Клієнтський `productLookupCache` (SKU + Dilovod id, lowercase) спільний для flatten і чек-листа — без N+1 GET на рядки.
- Деталі: `Docs/features/expand-flatten-calc.md`.

---

## 2026-08-31 — Мобільні переміщення: прийом, Dilovod, адмін-правка двох списків
**Files:** `client/pages/Warehouse/WarehouseMovementMob/**`, `server/modules/Warehouse/{WarehouseController,WarehouseService,WarehousePayloadBuilder,WarehouseMovementExport}.ts`, `shared/constants/permissions.ts`, `shared/utils/dilovodBatchId.ts`, `prisma/schema.prisma`, `prisma/migrations/20260830120000_warehouse_movement_receipt_fields/`, `Docs/features/warehouse-movement-mob.md`, `Docs/features/warehouse-movement-dilovod-export.md`

- Цикл: чернетка → **Відправити** (`pending_receipt`, без Dilovod) → сканування отримувачем → **Підтвердити отримання** (у Dilovod лише фактичні кількості). Автор не приймає власне відправлення. Номер `П-00xxx`. Старий `/warehouse/movement` паралельно.
- Розбіжності (нестача / надлишок / збіг) з кольорами; `goodPart` не з `"0"`; підстановка партій `fillMissingBatchIds`.
- Адмін після `finalized`: окреме редагування **Відправлене / Отримане**; **Зберегти в Dilovod** (`POST /api/warehouse/:id/sync-dilovod`) перезаписує документ отриманими кількостями.
- Soft-delete (`deleted` + Dilovod `delMark`). Права в ролях: `action.warehouse.movement.edit` / `.delete` (seed — admin). Камера читає ШК лише у видимій рамці.
- Деталі: `Docs/features/warehouse-movement-mob.md`.

---

## 2026-08-30 — Мобільні переміщення: сканер, drawer, swipe-рядки, motion-примітиви
**Files:** `client/pages/Warehouse/WarehouseMovementMob/**`, `client/components/motion/{bottom-sheet,slide-action-button,swipe-action-row}.tsx`, `client/lib/{ease,touch,haptic,presence-gate}.*`, `shared/types/warehouse.ts`, `server/modules/Warehouse/WarehouseController.ts`, `Docs/features/warehouse-movement-mob.md`, `Docs/architecture/swipe-action-row.md`, `Docs/architecture/motion-primitives.md`

- Редактор чернетки без прихованого input ШК (краде фокус). Додавання: камера / HID, grouped **Додати ще** + «Ввести ШК вручну». Мок-ШК лише в DebugMode.
- Drawer кількості (`BottomSheet`): залишки джерела/призначення з урахуванням уже доданих порцій SKU; повторний ШК відкриває накопичену кількість; ШК зберігається в рядку чернетки.
- Рядки: на iOS — двосторонній кінетичний swipe (edit / delete), lock вертикального скролу, високий поріг commit; на Android — тап → панель кнопок. Видалення з collapse + undo ~6 с на той самий індекс.
- Хронологія завжди з трьох кроків (pending сірі, «ще не відправлено / отримано», з’єднувальні лінії); показується і на збереженій чернетці.
- Спільні `SwipeActionRow`, `SlideActionButton`, `BottomSheet`, токени `ease.ts`. `lightHaptic()` = лише Android `vibrate`; iOS Taptic-хаки прибрані.
- API: `GET /api/warehouse/product-by-barcode`. Деталі: `Docs/features/warehouse-movement-mob.md`.

---

## 2026-08-28 — ActionBubble: touch-UI бульбашки (каталог і фільтри переміщень)
**Files:** `client/hooks/useTouchUi.ts`, `client/hooks/use-mobile.tsx`, `client/components/action-bubble/**`, `client/pages/Products/index.tsx`, `client/pages/Warehouse/WarehouseMovementMob/index.tsx`, `client/pages/Warehouse/WarehouseMovementMob/components/MovementMobFilterBar.tsx`, `Docs/architecture/action-bubble.md`, `Docs/features/products-catalog-2.0.md`

- Спільні `ActionBubble` + `ActionBubbleDock`: FAB + панель (пресети кольору, placement, badge, клік зовні з ignore для HeroUI popover/календар).
- `useTouchUi()` = viewport `< lg` або `(any-pointer: coarse)`; бульбашки без `md:hidden`, щоб планшети їх бачили.
- `/products`: дерево каталогу в бульбашці замість `CatalogTreeBubble`. `/warehouse/movement-mob`: фільтри в бульбашці на touch-UI, на десктопі — інлайн; Reset більше не підміняє date range.

---

## 2026-08-26 — Бухгалтерія: завантаження банківських виписок
**Files:** `client/pages/BankStatementImport/**`, `server/routes/dilovod-bank-statement.ts`, `server/services/dilovod/BankStatement*.ts`, `shared/types/bankStatement.ts`, `shared/utils/settlementsKindKeywords.ts`, `shared/utils/excelCol.ts`, `client/components/Timeline.tsx`, `client/components/table/**`, `client/hooks/useTableSelection.ts`, `prisma/migrations/20260826120000_settings_base_value_longtext/`, `Docs/features/bank-statement-import.md`, `Docs/architecture/timeline.md`

- Нова сторінка **Бухгалтерія → Банківські виписки** (`/accounting/bank-statements`, `page.accounting.bankStatements`): Excel → preview (таби Витрати / Надходження) → `documents.cashOut` / `documents.cashIn` без прив’язки до замовлень.
- Парсинг за шаблоном (дефолт NovaPay: з 17 рядка, дебет U / кредит W); шаблони, словник ключових слів виду розрахунків і inline-колонки в `settings_base` (`bank_statement_templates`).
- Чекбокси = склад payload (витрати увімкнені, надходження вимкнені). `corAccount` / `settlementsKind` / `cashItem` з довідників Dilovod; автокомпліт і навчання ключових слів з призначення.
- Довідники в кеші: `settlementsKinds`, `cashItems`, `ledgerAccounts`. `settings_base.value` → `LONGTEXT` (план рахунків не вміщався в TEXT). Після деплою: `npx prisma migrate deploy`.
- `Timeline` винесено в спільний компонент (виписки — `sky`, реєстр НП — `amber`).

---

## 2026-08-26 — Каталог: стан папки / пошуку / картки в URL hash
**Files:** `client/hooks/useUrlHashSync.ts`, `client/hooks/useUrlHashSync.spec.ts`, `client/pages/Products/useProductsCatalog.ts`, `Docs/architecture/url-hash-sync.md`, `Docs/features/products-catalog-2.0.md`

- `/products` пише в `location.hash` поточну папку, пошук і відкриту картку (edit). Reload і копіювання URL відновлюють той самий вигляд.
- Спільний хук `useUrlHashSync`: omit порожніх ключів, restore на mount, запис через `history.replaceState` (без зайвої історії). Codec лишається на сторінці.
- SalesDrive поки лишається на своїй інлайн-серіалізації.

---

## 2026-08-26 — Каталог: «В замовленнях» рахує комплекти окремо від порцій
**Files:** `server/services/orderShipmentMetricsService.ts`, `server/services/orderShipmentMetricsService.spec.ts`, `server/routes/orders.ts`, `client/pages/Products/index.tsx`, `client/pages/Products/components/CatalogTable.tsx`, `client/components/modals/ProductOrdersModal.tsx`, `Docs/features/products-catalog-2.0.md`

- Колонка **В замовленнях** для наборів показує кількість комплектів (як таблиця «Монолітні набори» у звіті відвантажень), а не розгорнуті порції з `processedItems`.
- Звичайні SKU: порції мінус компоненти, що пішли в комплекти. Модалка замовлень підхоплює ті самі набори.
- API: `GET /api/orders/products/stats` і `/orders` приймають `splitMonolithic=true` (каталог). `shippedOnly` і sales/general звіти без цього прапорця не змінюються.

---

## 2026-08-24 — NumberInput: десяткові поля з комою
**Files:** `client/lib/numberInput.ts`, `client/lib/numberInput.spec.ts`, `client/components/NumberInput.tsx`, `client/pages/Products/components/ProductDrawer.tsx`, `Docs/architecture/number-input.md`, `Docs/features/products-catalog-2.0.md`

- Спільний інпут замість розкиданих `type="number"` / ручного sanitize: крапка → кома, ліміт знаків, min/max на blur, колесо не крутить значення, нуль виділяється на фокусі.
- `NumberInput` — рядок у стейті; `NumberInputFromNumber` — адаптер для `number` (чернетка всередині).
- ProductDrawer: вага, порції в коробці, unitRatio, «Розрахунок на», qty специфікації, ціна. Комплект лишає `StepperInput`.

---

## 2026-08-20 — UI користувачів/ролей і домен Settings/Users
**Files:** `client/pages/Settings/Users/**`, `client/routes.config.tsx`, `server/routes/auth.ts`, `server/services/authService.ts`, `client/components/UpdateNotificationBanner.tsx`, `client/hooks/usePermissionsRevisionCheck.ts`, `Docs/features/users-and-roles.md`

- UI зібрано в домен `client/pages/Settings/Users/` (як Warehouse): сторінка + `UserRegistrationManager` / `RolesManager`.
- Користувачі: Drawer створення/редагування, генератор пароля, останній візит, `dilovodUserId`, напівпрозорий неактивний рядок, лічильники дій. Register більше не підміняє cookies адміна.
- Ролі: Drawer з колонками Сторінки / Дії. Зміна матриці → банер «оновити сторінку» для активних сесій.

---

## 2026-08-20 — Користувачі, ролі в БД і permission-матриця
**Files:** `shared/constants/permissions.ts`, `shared/constants/roles.ts`, `prisma/schema.prisma`, `prisma/migrations/20260820023000_add_roles_and_permissions/`, `server/services/RoleService.ts`, `server/routes/roles.ts`, `server/middleware/requirePermission.ts`, `server/middleware/auth.ts`, `server/routes/auth.ts`, `client/pages/Settings/Users/`, `routes.config.tsx`, `RolePreviewContext.tsx`, `Docs/features/users-and-roles.md`, `Docs/features/role-preview.md`

- Налаштування → **Користувачі** (`/settings/users`): таби Користувачі / Ролі (`?tab=roles`). CRUD користувачів прибрано з «Адмінських налаштувань».
- Ролі в таблицях `roles` / `role_permissions`. Каталог ключів `page.*` / `action.*` у коді; seed 6 системних ролей = стара матриця `minRole`. `admin` — wildcard, без видалення / зміни slug.
- Доступ: `requirePermission` на API, `route.permission` + `hasPermission` у меню / `ProtectedRoute`. JWT як і раніше несе slug.
- Role preview: селект з `/api/roles` (і кастомні slug); ефективні права — `effectivePermissions`.
- Тести: `npm test` (vitest). Після деплою: `npx prisma migrate deploy` (seed на старті сервера, якщо `roles` порожня).

---

## 2026-08-20 — Перегляд UI як інша роль (admin preview)
**Files:** `shared/constants/roles.ts`, `client/contexts/RolePreviewContext.tsx`, `client/lib/rolePreviewFetch.ts`, `client/components/RolePreviewSelect.tsx`, `SidebarAdminFooter.tsx`, `Sidebar.tsx`, `Header.tsx`, `useRoleAccess.ts`, `ProtectedRoute.tsx`, `server/middleware/auth.ts`, `server/index.ts`, `server/types/auth.ts`, `Docs/features/role-preview.md`

- Адмін бачить меню / сторінки / кнопки обраної ролі, не виходячи з акаунта. `user.role` у AuthContext не підміняється (Debug mode і селект лишаються).
- Селект ролі + Debug mode — спойлер унизу сайдбару (десктоп і мобайл); з хедера прибрано.
- Обережне API-зниження: заголовок `X-Role-Preview`, сервер міняє лише `req.user.role` (не userId). Це не імперсонація: дозволені мутації виконуються від адміна.
- 403 від `requireRole` / `requireMinRole` → toast «Недостатньо прав» (заголовок `X-Insufficient-Role`, без читання body).
- Сесія (`/api/auth/profile`, logout, refresh) завжди йде від реальної ролі.

---

## 2026-08-18 — LAL Аудиторії: вибірка клієнтів і експорт для Ads
**Files:** `shared/types/lalAudiences.ts`, `server/services/LalAudiencesService.ts`, `server/routes/lal-audiences.ts`, `server/index.ts`, `prisma/schema.prisma`, `prisma/migrations/20260818120000_add_order_customer_phone_index/`, `client/pages/Reports/LalAudiences/**`, `client/routes.config.tsx`, `Docs/features/lal-audiences.md`

- Новий розділ **Звіти → LAL Аудиторії** (`/reports/lal-audiences`, ads-manager+): пресети, період, слайдери count/LTV, логіка lifetime/strict, статуси, таблиця з пагінацією.
- Клієнт = нормалізований телефон з `orders`; email/ПІБ з `rawData`. У вибірці лише рядки з валідним телефоном.
- `GET /api/lal-audiences` (список + summary) і `POST /api/lal-audiences/export` (CSV UTF-8 BOM / XLSX). Колонки файлу обираються іконкою біля експорту; дефолт Ads: Phone, Email, First/Last Name, City, Country.
- VIP / B2B: LTV > 10 000 ₴; B2B ще й ≥ 100 порцій в одному замовленні. Військові: `pricinaZnizki = 33`. Дефолтний період — 1 місяць.
- Prisma: індекс `customerPhone` на `orders`.

---

## 2026-08-17 — Products 2.0: пошук, модалка замовлень, Legacy на гілці
**Files:** `client/pages/Products/**`, `client/components/modals/ProductOrdersModal.tsx`, `ProductShippedStatsTable.tsx`, `server/modules/Products/*`, `server/routes/products.ts`, `server/lib/utils.ts`, `DilovodService.ts`, `DilovodCacheService.ts`, `Docs/features/products-catalog-2.0.md`

### Пошук і замовлення
- У режимі пошуку таблиця показує **Категорію** (клік → папка) і **В замовленнях** (статистика new / confirmed / hold).
- Клік по кількості відкриває спільну `ProductOrdersModal` (таби Всі | Нові | Підтверджені | На утриманні); звіт відвантажень використовує ті самі таби regular / monolithic.
- Навігація між товарами — компактний контрол у хедері перед SKU (↑/↓ + лічильник); футер модалки прибрано.

### Legacy `products` (тимчасово)
- Кнопка **Оновити Legacy** у футері картки товару (той самий confirm / `sync-manual` force, що в меню).
- **Синхронізувати гілку** після structure-refresh робить Legacy Update активних SKU гілки (`force` sync-manual).
- Архівні SKU **не** йдуть у Dilovod: у `products` лише `isOutdated: true`. Те саме для вибіркового Legacy Update.
- Прибрати цей крок гілки, коли відмовимось від таблиці `products`.

### Prisma / Dilovod
- Спільний `prisma` на `globalThis`, щоб Vite HMR не плодив пули (MySQL 1040 Too many connections).
- `DilovodService` / `DilovodCacheService` використовують цей клієнт; Legacy гілки — singleton `dilovodService`.

---

## 2026-08-14 — OrderStatusChip: історія статусів у спільному чіпі
**Files:** `client/components/OrderStatusChip.tsx`, `SalesDateDetailsModal.tsx`, `ProductOrdersModal.tsx`, `OrderViewHeader.tsx`, `Docs/features/order-status-chip.md`

- Кольоровий чіп статусу замовлення + тултіп історії винесені в `OrderStatusChip` / `OrderStatusHistoryTooltip`.
- Історія показується, якщо передати `statusHistory`; опційний `dayStartHour` підсвічує «На відправку» в інший звітний день.
- Підключено в деталях дня звіту продажів, модалці замовлень товару та шапці картки замовлення.

---

## 2026-08-09 — Products 2.0: Legacy Update (force sync-manual + weight)
**Files:** `client/pages/Products/index.tsx`, `useProductsCatalog.ts`, `CatalogToolbar.tsx`, `CatalogContextMenu.tsx`, `server/routes/products.ts`, `DilovodService.ts`, `DilovodSyncManager.ts`, `Docs/features/products-catalog-2.0.md`

- UI **Legacy Update** у toolbar (поряд із «В архів») і context menu: обрані товари з SKU → confirm → `POST /api/products/sync-manual`.
- Клієнт завжди шле `force: true` — ігнорує `dilovodDataHash`, завжди перезаписує рядок у `products`.
- API `sync-manual` приймає `{ skus, force? }`; `syncProductsWithDilovod` / `syncProductsToDatabase` прокидають `{ force }`.
- При force для існуючих товарів додатково оновлюється `weight` (`determineWeightByCategory`); `manualOrder` / `unitRatio` не чіпаються.
- Відрізняється від «Синхронізувати з Діловодом» (те лише `catalog_*` refresh).

---

## 2026-08-03 — Products 2.0: ops-поля, сортування DnD, примітки BOM, restore у пошуку
**Files:** `prisma/schema.prisma`, `prisma/migrations/20260803090000_catalog_ops_fields_and_sort/`, `shared/types/catalog.ts`, `shared/utils/catalogSortOrder.ts`, `shared/utils/specColorPalette.ts`, `server/modules/Products/*`, `server/services/dilovod/*`, `client/pages/Products/**`, `Docs/features/products-catalog-2.0.md`

### Дані / API
- `catalog_goods`: `sortOrder` (інтервал 10), `unitRatio`, `stockBalanceByStock` (+ backfill з `products`); індекс `(parentId, sortOrder)`.
- `catalog_good_components.note` ↔ Dilovod `tpGoods.remark` (до 150 символів у save).
- `POST /api/catalog/reorder` — sibling reorder (папки в дереві / товари в таблиці); при нестачі щілини — rebalance `10,20,30…`.
- Dual-write ops-полів у legacy `products` (`unitRatio`, `weight`, `portionsPerBox`←`packageRatio`, `manualOrder`←`sortOrder`, `stockBalanceByStock`) — **без** зміни `set` / hash.
- Dilovod stock bulk також дзеркалить JSON у `catalog_goods.stockBalanceByStock`.
- Sync з Dilovod зберігає локальні ops-поля; `note` мерджиться, якщо payload без `note`.

### UI: таблиця / дерево / сортування
- DnD reorder siblings у `CatalogTree` (папки) і `CatalogTable` (товари, grip); лінія вставки в дереві; grip не конфліктує з виділенням рядків.
- Move (drop на папку) лишається окремо від reorder.
- Колонки гілки «Готова продукція»: вага, `packageRatio`, `unitRatio` (лише Admin), ГП/МС, «В замовленнях» (завжди); `SortDescriptor` + кнопка «Ручний порядок» біля breadcrumbs.

### UI: примітка BOM
- У `ProductDrawer` (специфікація **продукції**, не товарних наборів): Chip/Popover біля назви компонента; мікро-конфірм видалення (іконка → «Видалити?» → clear).
- Для `isKit` примітка прихована; у payload `note: null`.

### UI: trash / archive / пошу
- ПКМ / toolbar: для елементів зі смітника — «Відновити» (move picker) замість «Видалити»; для архіву — «Відновити з архіву».
- Детекція за `parentId` обраних рядків (`resolveCatalogItemLocation`) — працює і в **глобальному пошуку**.
- ПКМ у `TrashDrawer`; breadcrumbs у пошуку: лише `Каталог > Пошук: «…»`.

---

## 2026-08-02 — Products 2.0: партії ШК з ГП + малого складу
**Files:** `useBatchNumbers.ts`, `BatchNumbersAutocomplete.tsx`, `ProductDrawer.tsx`, `Docs/features/products-catalog-2.0.md`

- Picker «Номер партії» запитує `includeSmallStorage=true` (ГП + МС); у рядку — chip зі складом зберігання.
- `useBatchNumbers` приймає `options.includeSmallStorage` / `onlySmallStorage`.

---

## 2026-08-01 — Products 2.0: генерація EAN-13 ШК + вибір партії в Drawer
**Files:** `server/modules/Products/barcodeUtils.ts`, `ProductsDilovodGateway.ts`, `ProductsCatalogService.ts`, `ProductsController.ts`, `client/pages/Products/components/ProductDrawer.tsx`, `Docs/features/products-catalog-2.0.md`

- `GET /api/catalog/barcode/next` — наступний вільний внутрішній EAN-13 серії **`22…`** (приклад `2200000000224`): max з Dilovod `barCodes` → body+1 → GS1 check digit; seed `220000000000`.
- `barcodeUtils.ts`: check digit, `pickLatestEan13` (лише префікс `22`), mutex/`isBarcodeTaken` retry.
- UI «Код»: кнопка генерації (жовтий active) + `ConfirmModal` при заміні існуючого ШК.
- UI «Номер партії»: picker як у переміщенні (`useBatchNumbers` + `BatchNumbersAutocomplete`); `goodPart`/`goodPartName` з вибору; ID — debug-бейдж, без окремого Input.

---

## 2026-08-01 — Products 2.0: довідники Dilovod, TipTap description, BOM sync, Drawer Tabs + unsaved guard
**Files:** `shared/types/catalog.ts`, `shared/types/dilovod.ts`, `server/services/dilovod/DilovodCacheService.ts`, `DilovodService.ts`, `server/routes/dilovod.ts`, `server/modules/Products/*`, `client/components/DilovodCacheManager.tsx`, `client/pages/Products/**`, `Docs/features/products-catalog-2.0.md`, `package.json` (TipTap)

- Кешовані довідники в `settings_base` (`dilovod.cache.*`): `units`, `priceTypes`, `currency`, `accPolicies` (`catalogs.goodsAccPolicies`); TTL 24h; `GET /api/catalog/dictionaries`.
- Settings Dilovod: нові картки кешу + «Оновити все» / `/api/dilovod/directories` включають ці довідники.
- `description`: read через `extractUkName` (фікс `[object Object]`); save як multilang `{uk,ru}`; UI — TipTap (`DescriptionEditor`).
- Live-pull картки пише BOM у `catalog_good_components` (`mapped.components` / `tpGoods`).
- `ProductDrawer`: Tabs Товар/Комплект (`accPolicyId`), BOM лише для комплекту, Select з довідників, `useUnsavedGuard` + `UnsavedChangesModal`.
- `goodTypeLabel` / колонка «Тип» у таблиці — назва з `accPolicies` (fallback: Продукція / Товарні набори).

---

## 2026-07-31 — Products 2.0: архіви в UI, move picker, restore + delMark
**Files:** `client/pages/Products/**`, `server/modules/Products/ProductsCatalogService.ts`, `ProductsDilovodGateway.ts`, `ProductsController.ts`, `ProductsTypes.ts`, `server/routes/catalog.ts`, `Docs/features/products-catalog-2.0.md`

- Sidebar-дерево: папки «Архів – …» приховані як вузли; на батькові — іконка + Tooltip → відкрити архів (`archiveChildId`). Таблиця також ховає рядки-архіви. Breadcrumbs без змін (повний шлях).
- Context menu «Перемістити в…» → `MoveToFolderModal` з повним деревом (архіви видимі); blocked = обрані ids + нащадки.
- Move **в** архів (DnD / picker) → `setDelMark` + локально `delMark=true`; move **з** архіву → `delMark: 0`.
- Усередині архіву toolbar/context menu: «Відновити з архіву» замість «В архів» → `POST /api/catalog/goods/restore` (батько архіву + `saveObject` з `delMark: 0` через `clearDelMark`).
- `buildTreeItems(nodes, { hideArchives })`, `treeItems` / `treeItemsFull`, `isArchiveFolderId`.

---

## 2026-07-30 — Products 2.0: UX дерева, breadcrumbs, DnD confirms, root `parentId=0`
**Files:** `client/pages/Products/**`, `server/modules/Products/ProductsCatalogService.ts`, `server/modules/Products/ProductsDilovodGateway.ts`, `Docs/features/products-catalog-2.0.md`

- Дерево: nested UI з видимим root «Каталог» (завжди відкритий, без drag); chevron лише для папок із дітьми; плавне expand; vertical lines на вкладених рівнях.
- Кліки: неактивна папка — select + expand; згортання — лише активна папка або chevron; chevron не змінює selection / таблицю.
- Breadcrumbs над таблицею (`CatalogBreadcrumbs` + `buildFolderBreadcrumbs`) з навігацією по шляху; у пошуку — крок «Пошук: …».
- Confirm перед move (DnD), trash, duplicate; archive як і раніше через `ArchiveConfirmModal`.
- Drag preview: `createCatalogDragPreview` / `setDragImage` — кастомний ghost, кілька елементів стовпчиком.
- Fix root children: Dilovod `parent="0"` → `getFolderChildren` враховує `null`/`"0"`/`""`; mapper нормалізує `"0"` → `null`.

---

## 2026-07-29 — Products 2.0: домен каталогу Dilovod
**Files:** `prisma/schema.prisma`, `prisma/migrations/20260727010000_add_catalog_tables/`, `shared/types/catalog.ts`, `server/modules/Products/*`, `server/routes/catalog.ts`, `client/pages/Products/**`, `client/routes.config.tsx`, `client/components/Sidebar.tsx`, `Docs/features/products-catalog-2.0.md`

- Новий домен `/products` (мін. роль `WAREHOUSE_MANAGER`): дерево + таблиця + drawer для керування `catalogs.goods` (папки, товари, BOM, ціни, ШК).
- Локальне дзеркало `catalog_goods` / `catalog_good_components` / `catalog_good_prices` / `catalog_good_barcodes`; SoT — Dilovod; hybrid sync після мутацій.
- ШК підтримують кілька записів на товар з привʼязкою до партії (`goodPart` / `goodPartName`).
- API `/api/catalog/*`: tree, CRUD, move, archive, trash, duplicate, units, refresh.
- Legacy таблиця `products` **не** оновлюється Products 2.0 (залишки в картці — read-only join); `/product-sets` без змін.
- Nav: опційний `navBadge` (`label`, `color`, `until`) — для «Товари 2.0» бейдж `NEW` (danger) до `2026-09-30`.

---

## 2026-07-22 — Синхронізація штрих-кодів товарів з Dilovod
**Files:** `server/services/dilovod/DilovodApiClient.ts`, `DilovodService.ts`, `DilovodSyncManager.ts`, `DilovodTypes.ts`, `DilovodUtils.ts`, `Dilovod README.md`, `client/components/NotificationBell.tsx`, `client/pages/MetaLogs/hooks/useMetaLogs.ts`, `client/pages/MetaLogs/components/OtherMetaLogTable.tsx`, `Docs/features/dilovod-product-barcode-sync.md`

- Додано окремий запит до регістру Dilovod `barCodes` (`getBarCodesByObjectIds`) під час sync товарів; у БД пишеться `Product.barcode` з поля `code`.
- У `dilovodDataHash` включено `barcode` — зміна ШК в Dilovod оновлює товар; відсутність у відповіді → `barcode = null`.
- Активні лише записи з `activity === "1"`; `"0"` ігнорується.
- Товари без активного ШК логуються в `meta_logs` (`product_sync` / «Товар без штрих-коду») → NotificationBell.
- MetaLogs → вкладка «Інші помилки» показує `product_sync` у таблиці з колонками Помилка / Товар / Артикул (дизайн як у сусідніх звітах).

---

## 2026-07-22 — Повернення: моноліт лише з `payloadData.shipment.bySku`
**Files:** `client/pages/Warehouse/WarehouseReturns/useWarehouseReturns.ts`, `client/pages/Warehouse/WarehouseReturns/WarehouseReturnsTypes.ts`, `Docs/features/warehouse-returns-dry-run.md`

- Для підготовки повернення `expandProductSets` завжди викликається з `useShipmentPayloadMode: true`.
- Джерело істини: наявність SKU в `orders.payloadData.shipment.bySku` → повернення цілим набором; відсутність → розгортання на порції.
- Виправлено регресію: без `bySku` раніше вимикався payload-режим і спрацьовував fallback по категорії/залишках (`dynamicMonolithic`), тож набори, відвантажені порціями, помилково лишались монолітами.
- `isMonolithicForReturn` тепер дивиться лише на `shippedAsMonolithic` (без OR з `dynamicMonolithic`).

---

## 2026-07-21 — `entry.shipped` в inventory history без подвійного рахунку монолітів
**Files:** `server/services/orderShipmentMetricsService.ts`, `server/modules/Warehouse/WarehouseController.ts`, `server/routes/orders.ts`, `Docs/features/warehouse-inventory-shipped-activity.md`

- Додано спільні хелпери `computeShippedQuantityForSku` / `computeShippedQuantityBreakdown`, `expandSetToLeaves`, `getReportProductDescriptors` у `orderShipmentMetricsService`.
- `GET /api/warehouse/inventory/product-history` тепер рахує `shipped` так само, як shipment-звіти: leaf SKU = cache − mono-компоненти; SKU-набір = кількість з `shipment.bySku`.
- Product-orders endpoint у `orders.ts` переведено на той самий breakdown, щоб уникнути роз'їзду метрик.

---

## 2026-07-16 — Видалено статус чернетки переміщень: збереження = відправка + закриття
**Files:** `server/modules/Warehouse/WarehouseController.ts`, `client/pages/Warehouse/WarehouseMovement/components/MovementActionBar.tsx`, `client/pages/Warehouse/WarehouseMovement/index.tsx`, `client/pages/Warehouse/WarehouseMovement/useWarehouseMovement.ts`

- Прибрано проміжний статус чернетки/active. Будь-яке збереження накладної тепер = створення/оновлення в БД → відправка в Діловод (проведено, `saveType:1`) → статус `finalized` (документ закрито, read-only).
- `POST /api/warehouse/send` (сервер): статус завжди `'finalized'` (параметр `isFinal` більше не впливає).
- `MovementActionBar`: замість трьох кнопок («Зберегти чернетку» / «Відправити в Діловод» / «Завершити переміщення») одна кнопка **«Зберегти та відправити»** (`onSaveAndSend`).
- `index.tsx`: додано `sendAndFinalize` (збереження → відправка → закриття → скидання сторінки до StartScreen); видалено `sendToDilovod`/`handleSendIntermediate`/`handleSendFinal`/`handleFinalizeLocally` та модалки підтвердження проміжної/фінальної відправки; `guard.onSaveDraft` → `sendAndFinalize`.
- Виправлено: кнопка «Розпочати переміщення» на стартовому екрані відкривала накладну з порожніми залишками (публічний `loadProducts` не оновлював `stockData`). Додано обгортку `loadProductsWithStock`, що після завантаження товарів одразу викликає `refreshStockData` для поточного напрямку.
- Залишено без змін (за домовленістю): вкладка «Чернетки» (показуватиме порожній список), cron-автофіналізація 23:55, `finalize-local` (debug), типи `MovementStatus` (зворотна сумісність з існуючими `finalized`-записами).

---

## 2026-07-14 — Додано багатонапрямковий запит історії переміщень
**Files:** `server/modules/Warehouse/MovementHistoryService.ts`, `shared/types/movement.ts`, `client/pages/Warehouse/WarehouseMovement/storageDisplay.ts`, `client/pages/Warehouse/WarehouseMovement/components/MovementHistoryTable.tsx`, `client/pages/Warehouse/WarehouseMovement/components/MovementDraftsTab.tsx`

- Змінено `getMovementHistory()` — тепер робить паралельні запити до Dilovod для обох напрямків: `main→small` та `small→main`.
- Додано поле `direction` до типу `GoodMovingDocument` (`'main-to-small' | 'small-to-main'`).
- Оновлено відображення напрямку у `MovementHistoryTable` — тепер показує бейджі з назвами складів у форматі: `Склад ГП → Склад М`.
- Додано функцію `resolveMovementDirection()` для уніфікованого відображення напрямків.
- Спрощено код через функцію `normalizeDocument()` замість дублювання маппінгу.
- Додано колонку "Напрямок" у `MovementDraftsTab` для відображення напрямку переміщення чернеток.
- Змінено `persistDocumentsToDB()` на `upsert` — тепер синхронізує локальні дані з Діловодом (sourceWarehouse, destinationWarehouse, docNumber, movementDate, notes, items), уникнувши розсинхрону.
- Додано фільтрацію документів за датою при збереженні.

---
**Files:** `client/pages/Warehouse/WarehouseInventory/components/InventoryTableSection.tsx`, `client/pages/Warehouse/WarehouseInventory/components/InventoryHistoryRow.tsx`, `client/pages/Warehouse/WarehouseInventory/components/InventoryHistoryTable.tsx`, `client/pages/Warehouse/WarehouseInventory/WarehouseInventoryTypes.ts`

- Додано 3 GP-колонки у таблицю: `За обліком (ГП)`, `Факт (ГП)`, `Відхилення (ГП)`.
- Оновлено тип `ProductHistoryEntry` з полями `systemBalanceGp`, `actualGp`, `deviationGp`.
- Оновлено `sortItems` для сортування за GP-колонками.
- Оновлено `getSessionItems` для фільтрації застарілих позицій з урахуванням GP-балансів.
- Додано GP-підрахунки у `InventoryHistoryTable` для підсумкових рядків сесій.
- Виправлено помилку `require is not defined` у `InventoryTableSection` (замінено на ES6-імпорт).

## 2026-07-06 — Підтримка обраного складу для `Warehouse` stock snapshot
**Files:** `server/modules/Warehouse/WarehouseController.ts`, `server/services/dilovod/DilovodService.ts`, `server/services/dilovod/DilovodDataProcessor.ts`, `server/services/dilovod/DilovodTypes.ts`

- Додано збереження залишків по довільному `storageId` у Dilovod-процесі.
- `GET`/`POST /api/warehouse/stock-snapshot` тепер повертають `selectedStock` для обраного складу.
- Забезпечено коректне відображення цих даних у запитах складу без прямого доступу до приватного `apiClient`.

## 2026-07-01 — Повернення зберігають монолітні набори цілісними
**Files:** `client/pages/Warehouse/WarehouseReturns/useWarehouseReturns.ts`

- `useWarehouseReturns` тепер завантажує налаштування монолітних категорій (`/api/settings/monolithic_assembly_categories`) при mount.
- `expandProductSets` викликається з реальним списком `monolithicCategoryIds` замість порожнього масиву.
- Якщо набір був відвантажений як монолітний (напр. "Вінегрет"), він повертається цілісним, а не розкладається на компоненти.

---

## 2026-06-27 — `Комплектування` у inventory history стало net по `kit` / `unkit`
**Files:** `server/modules/Warehouse/WarehouseController.ts`, `Docs/features/warehouse-inventory-shipped-activity.md`

- `GET /api/warehouse/inventory/product-history` тепер рахує `kit` як нетто по `warehouseReleaseSet`: `kit - unkit`.
- Описано, як розрізняються `kit` і `unkit` через `operationType`, щоб колонка показувала коректний знак.

---

## 2026-06-27 — Додано колонку `Комплектування` в inventory history SKU
**Files:** `client/pages/Warehouse/WarehouseInventory/components/InventoryHistoryRow.tsx`, `client/pages/Warehouse/WarehouseInventory/WarehouseInventoryTypes.ts`, `server/modules/Warehouse/WarehouseController.ts`, `Docs/features/warehouse-inventory-shipped-activity.md`

- У таблицю історії SKU додано колонку `Комплектування` з відображенням денного агрегату `kit`.
- `GET /api/warehouse/inventory/product-history` тепер повертає `kit`, який рахується з `warehouseReleaseSet` для `operationType='kit'`.
- Оновлено документацію по inventory history, щоб новий рух був описаний разом із `shipped`, `returned` і `writtenOff`.

---

## 2026-06-27 — Додано проміжний шар `Комплектування` у модель shipment payload
**Files:** `Docs/plans/shipment-payload-refactor.md`

- У плані рефакторингу зафіксовано окремий операційний шар `packing` / `Комплектування` між `shipmentSummary` і `packingManifest`.
- Описано його роль: зберігати рішення про monolithic / legacy / regular без прив'язки до коробок і без роздування summary.
- Оновлено бізнес-правила, щоб шар `Комплектування` був видимий як окрема стадія в audit trail.

---

## 2026-06-27 — Спільний shipment metrics helper для warehouse history і звітів
**Files:** `server/services/orderShipmentMetricsService.ts`, `server/routes/orders.ts`, `server/modules/Warehouse/WarehouseController.ts`, `Docs/features/warehouse-inventory-shipped-activity.md`

- Винесено спільний helper для читання shipment payload і побудови report items з `ordersCache.processedItems` / `order.payloadData`.
- `GET /api/warehouse/inventory/product-history` більше не має окремого підрахунку монолітів через `accGood`; він використовує той самий шлях метрик, що і shipment-звіти.
- Звітні ендпоінти по shipped-метриках тепер спираються на один helper, щоб уникнути розбіжностей між reports і warehouse history.

---

## 2026-06-26 — Документація `shipmentPayloadData` з `OrderView` і повторного використання
**Files:** `Docs/features/order-assembly/dynamic-monolithic-order-payload.md`

- Додано окремий опис `shipmentPayloadData` з `OrderView`: як він збирається з `expandedItems` у форматі `{ shipment: { bySku } }`.
- Зафіксовано, як цей payload передається далі в `useOrderNavigation` і `PUT /api/orders/:id/status`.
- Додано рекомендацію винести логіку в окремий helper/hook, якщо її треба перевикористати в інших місцях.

---

## 2026-06-26 — Документація агрегації реально відвантажених наборів у inventory history
**Files:** `Docs/features/warehouse-inventory-shipped-activity.md`

- Описано, як `GET /api/warehouse/inventory/product-history` рахує `shipped`, `returned` і `writtenOff` для кожного SKU в межах одного інвентаризаційного дня.
- Зафіксовано джерела даних для `shipped`: `orders.dilovodSaleExportDate`, `ordersCache.processedItems` з fallback на `order.items`.
- Додано примітку про повторне використання: логіку краще винести в окремий helper/service, якщо її треба застосувати в інших ендпоінтах або звітах.

---

## 2026-06-15 — Dynamic monolithic support, `payloadData` для замовлень і lock для shipment export
**Files:** `client/components/OrderAssemblyRightPanel.tsx`, `client/components/OrderChecklist.tsx`, `client/components/OrderChecklistItem.tsx`, `client/lib/orderAssemblyUtils.ts`, `client/pages/OrderView.tsx`, `client/types/orderAssembly.ts`, `server/routes/orders.ts`, `server/modules/Warehouse/SetReleaseController.ts`, `server/modules/Warehouse/WarehouseController.ts`, `server/services/dilovod/DilovodAutoExportService.ts`, `server/services/dilovod/DilovodExportBuilder.ts`, `server/services/dilovod/DilovodShipmentLockService.ts`, `server/services/orderDatabaseService.ts`, `prisma/schema.prisma`

- Додано `dynamicMonolithic` до `OrderChecklistItem` та оновлено збірку монолітних наборів: UI тепер може окремо керувати відображенням/проведенням таких наборів.
- У `Order` додано `payloadData` для збереження додаткових даних по замовленню; `PUT /api/orders/:id/status` тепер може зберігати цей payload і на його основі списувати залишки для монолітних комплектів.
- Додано shipment lock для Dilovod sale export: нові поля lock у схемі БД і сервіс для атомарного захисту від дублювання відвантажень.
- Розширено `SetReleaseController`: нові поля релізу, покращене списання залишків, підтримка `dilovodDocId`, а також окремий флоу видалення/позначення документів.
- Додано endpoint для активних наборів із інвентарю та оновлено сторінки/таблиці складу для роботи з новими полями й історією випуску наборів.

---

## 2026-06-11 — Поліпшено алокацію ваги: `unitRatio` / `weightRatio` та рекурсивне розгортання наборів
**Files:** `client/lib/orderAssemblyUtils.ts`, `client/components/OrderChecklistItem.tsx`, `client/lib/receiptTemplates.ts`, `client/types/orderAssembly.ts`, `client/lib/__tests__/orderAssemblyUtils.order17601.spec.ts`

- Додано рекурсивний агрегатор `computeFlattenedComponent()` для коректного обчислення `unitRatio` у вкладених наборах (включно з монолітними наборами і набор-пакетами).
- `composition` тепер містить об'єкти з `unitRatio` / `weightRatio` замість простих рядків — це спрощує алокацію і друк чеків.
- Алгоритм розподілу оновлено, щоб використовувати `weightRatio`/`unitRatio` при підрахунку `effectivePortionsPerItem` і `itemWeightPerUnit`.
- UI: у debug-панелі `OrderChecklistItem` додано відображення `unitRatio` для зручного дебагу; числові поля округлено до 2 знаків (`toFixed(2)`).
- Оновлено шаблони чеків (`client/lib/receiptTemplates.ts`) для підтримки нового формату `composition`.
- Тести: оновлено і запущено `client/lib/__tests__/orderAssemblyUtils.order17601.spec.ts` — пройшов локальний тест.
- Додано документацію про градації (GRADATIONS) в `Docs/features/order-assembly/gradations.md`.

---

## 2026-06-11 — Серверне `calc` для batch-розгортання та UI propagation
**Files:** `server/routes/expand.ts`, `client/lib/orderAssemblyUtils.ts`, `client/components/OrderChecklistItem.tsx`, `Docs/features/expand-flatten-calc.md`

- `POST /api/expand/flatten` повертає `products[].calc` (precomputed `sumPortionsOne`, `weightKgOne`), щоб зменшити кількість індивідуальних GET `/api/products/:sku` під час розгортання наборів.
- `client/lib/orderAssemblyUtils.ts`: batch-підвантаження наповнює пер-запитний кеш `prod:SKU` і `calc:SKU`; `computeFlattenedComponent()` використовує `calc` якщо він доступний; `addOrUpdateExpandedItem()` тепер проксіює `product.calc` і `product.unitRatio` в `expandedItems`.
- `client/components/OrderChecklistItem.tsx`: UI тепер віддає пріоритет `item.calc.sumPortionsOne` при візуалізації `displayRatio` для звичайних товарів.

---

---

## 2026-05-30 — Рефакторинг домену Reports і дедуплікація shared-логіки
**Files:** `client/pages/Reports/**`, `client/lib/dateReportingUtils.ts`, `client/hooks/useApi.ts`, `Docs/features/reports-domain-refactor.md`

- Домен `Reports` розбитий на окремі піддомени `ReportsGeneral`, `ReportsSales`, `ReportsShipment`, `ReportsSalesDynamics`.
- Спільні типи, утиліти, cache hooks і fetch-flow винесені в `client/pages/Reports/shared`.
- Прибрано дублювання preset-ів дат, cache validation і локального client-cache orchestration між report-компонентами.
- Для `Sales` спрощено дефолтні значення фільтрів: прибрані зайві alias-константи, залишені прямі `last7Days`, `last30Days`, `day`.
- Додано коротку документацію: `Docs/features/reports-domain-refactor.md`.

---
 
## 2026-05-07 — Фікс: meta_logs — форматування помилок автофіналізації
**Files:** `server/modules/Warehouse/WarehouseAutoFinalizeService.ts`

- **Формат логів:** виправлено формування записів у `meta_logs` при помилках автофіналізації.
- **Title & Message:** тепер `title` = `Помилка автофіналізації накладної`, `message` = `Помилка автофіналізації накладної №{docNumber}, автор документу: {authorName}`.
- **Data:** поле `data` зберігається як серіалізований JSON з полями `docNumber`, `docId`, `dilovodId`, `dilovodResponse`, `authorId`, `authorName`.
- **Callers:** оновлено виклики `writeLog` для передачі `details` (dilovodId / dilovodResponse) при помилках Dilovod і непередбачених помилках.

---

## 2026-05-07 — Фікс: серіалізація запитів до Dilovod і стабілізація Cron
**Files:** `server/services/dilovod/DilovodApiClient.ts`, `server/services/cronService.ts`

- **Серіалізація запитів:** додано внутрішню чергу у `DilovodApiClient.makeRequest()` — запити до Dilovod тепер виконуються послідовно, щоб уникнути помилки `multithreadApiSession`.
- **Retry & backoff:** при тимчасових помилках (multithread) застосовується exponential backoff і коротка пауза (30s penalty) перед повторними спробами.
- **Cron:** виправлено cron-вираз автофіналізації (тепер щодня о 23:55) і додано реєстрацію job у process-level registry, щоб уникнути дублювання завдань при HMR.

---

## 2026-05-06 — Додавання збереження фільтрів SalesDrive у hash URL
**Files:** `client/components/SalesDriveOrdersTable.tsx`, `Docs/features/salesdrive-filter-url.md`

- **Серiалізація фільтрів у hash:** стан фільтрів сторінки SalesDrive (пошук, категорія пошуку, канали, shipment-фільтр, статус, діапазон дат, сторінка/розмір) тепер зберігається в `window.location.hash`.
- **Читабельні канали:** список каналів серіалізується через крапку (наприклад `channels=19.22.24.unknown`) — це уникaє URL-encode `%2C` і більш зручно для візуального копіювання.
- **Опускання дефолтів:** значення за замовчуванням не потрапляють у hash — `searchCategory=orderNumber` і повний набір каналів не записуються, щоб URL залишався коротким.
- **Відновлення стану:** при завантаженні сторінки фільтри відновлюються з hash (захищено від перезапису під час початкового завантаження каналів).
- **Документація:** короткий опис правил серіалізації/парсингу доступний у `Docs/features/salesdrive-filter-url.md`.

---

## 2026-04-30 — WarehouseReturns: створено новий розділ повернень із debug payload preview
**Files:** `server/services/dilovod/DilovodExportBuilder.ts`, `server/modules/Warehouse/WarehouseController.ts`, `client/pages/Warehouse/WarehouseReturns/index.tsx`, `client/pages/Warehouse/WarehouseReturns/ReturnsActionBar.tsx`, `Docs/features/warehouse-returns-dry-run.md`

- **Новий розділ Warehouse Returns**: реалізовано інтерфейс пошуку замовлень, підготовки повернення, вибору партій і збереження чернетки.
- **Dry-run payload**: `POST /api/warehouse/returns/send` тепер підтримує `dryRun: true` і повертає сформований `payload` без експорту в Dilovod.
- **Debug-only кнопка payload**: у UI `ReturnsActionBar` кнопка `payload` доступна лише адміністратору в debug-режимі.
- **Нова документація**: створено розділ `Docs/features/warehouse-returns-dry-run.md` для опису dry-run payload і логіки повернень.
- **Чистий header**: `buildReturnPayload()` прибирає `state`, `number`, `deliveryRemark_forDel` з заголовка та передає `person` як `person.id`.

---

## 2026-04-29 — WarehouseMovement + WarehouseInventory: адмін-доступ та дрібні виправлення
**Files:** `server/modules/Warehouse/WarehouseController.ts`, `client/pages/Warehouse/WarehouseMovement/hooks/use*`, `client/pages/Warehouse/WarehouseMovement/index.tsx`, `client/pages/Warehouse/WarehouseInventory/useWarehouseInventory.ts`, `client/pages/Warehouse/WarehouseInventory/components/InventoryHistoryTable.tsx`

- **Адмін-доступ**: `PUT /:id`, `PATCH /:id/finalize-local`, `PUT /inventory/draft/:id`, `POST /inventory/draft/:id/complete`, `DELETE /inventory/draft/:id` — адмін більше не обмежений `createdBy` фільтром. `GET /drafts` також показує всі активні чернетки.
- **Admin UI в InventoryHistoryTable**: кнопки "Редагувати" / "Видалити" для `in_progress` сесій (тільки для адміна).
- **Fix P2002 + race condition**: прибрано `createdBy` з duplicate-check; `internalDocNumber` генерується через create+update (уникає колізій).
- **Fix boxQuantity=0 у старих чернетках**: перерахунок `boxes/portions` через `totalPortions / portionsPerBox`.
- **Fix isDirty при завантаженні**: snapshot більше не включає `systemBalance` — оновлення залишків не ставить `isDirty`.
- **Автозавантаження залишків**: при відкритті чернетки `refreshSystemBalances` викликається одразу з merged-даними (через `refreshSystemBalancesRef`).
- **Debounce**: `setIsRefreshingBatches(true)` і `refreshStockData` перенесено всередину `setTimeout`.

---

## 2026-04-21 — Інвентаризація: логічна дата проведення (inventoryDate) + DateTimePicker
**Files:** `prisma/schema.prisma`, `server/modules/Warehouse/WarehouseController.ts`, `client/pages/Warehouse/WarehouseInventory/useWarehouseInventory.ts`, `client/components/DateTimePicker.tsx`, `client/pages/Warehouse/WarehouseInventory/components/InventorySessionMeta.tsx`, `client/pages/Warehouse/WarehouseMovement/components/MovementFilterBar.tsx`, `server/modules/Warehouse/WarehouseAutoFinalizeService.ts`, `Docs/features/warehouse-inventory.md`

- **Нове поле `inventoryDate DateTime?`** у моделі `WarehouseInventory` — логічна дата проведення інвентаризації (задається користувачем), незалежна від `createdAt`.
- Міграція `20260420224459_add_inventory_date_to_warehouse_inventory` застосована.
- **API оновлено** — всі 4 ендпоінти (`GET`, `POST`, `PUT /inventory/draft`, `POST /complete`) приймають і повертають `inventoryDate` (ISO-рядок).
- **Клієнт**: `useWarehouseInventory` при завантаженні чернетки читає `draft.inventoryDate ?? draft.createdAt`; передає `inventoryDate: sessionDate` при збереженні/завершенні.
- **`DateTimePicker`** — новий shared-компонент (`client/components/DateTimePicker.tsx`) з пресетами (9:00 / 16:00 / Зараз), замінив дублювання в `MovementFilterBar` та `InventorySessionMeta`.
- **`handleSessionDateChange`**: зміна дати → `isDirty = true` + debounce 1 сек → `refreshSystemBalances` → оновлює `systemBalance` всіх товарів/матеріалів із `/api/warehouse/stock-snapshot`.
- **Bugfix `WarehouseAutoFinalizeService`**: виправлено маппінг плоских items з БД (`batchId`, `boxQuantity`, `portionQuantity`) у вкладений масив `batches` — усував помилку "Список товарів порожній" при автофіналізації.
- Оновлено `Docs/features/warehouse-inventory.md`: схема БД, API, таблиця стану, логіка `sessionDate`.

---

## 2026-04-19 — WarehouseMovement: ID складів у БД, видалення deviation
**Files:** `server/modules/Warehouse/WarehouseController.ts`, `server/modules/Warehouse/WarehouseService.ts`, `client/pages/Warehouse/WarehouseMovement/hooks/useMovementDraftState.ts`, `client/pages/Warehouse/WarehouseMovement/useWarehouseMovement.ts`, `client/pages/Warehouse/WarehouseMovement/WarehouseMovementTypes.ts`, `client/types/warehouse.ts`, `shared/types/movement.ts`
- `/products-for-movement` тепер повертає `warehouseConfig: { storageFrom, storageTo }` — Dilovod ID складів із `settings_base`
- При створенні чернетки `sourceWarehouse`/`destinationWarehouse` записуються як ID складів (раніше були захардкожені людські назви)
- Повністю видалено `deviation`/`deviations` (недореалізований функціонал): з типів, сервісу, контролера, хуків

---

## 2026-04-19 — Оптимізація bulk-оновлення залишків товарів
**Files:** `server/services/dilovod/DilovodSyncManager.ts`, `server/services/dilovod/DilovodService.ts`
- Видалено стару `updateProductStockBalance()` (single-item, N запитів у циклі)
- Додано `updateProductStockBalancesBulk()`: 1 SELECT на всі SKU → фільтрація незмінених → chunk-транзакції по 25
- `updateStockBalancesInDatabase()` переведено на новий bulk-метод; логування показує `updated` + `skipped`

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