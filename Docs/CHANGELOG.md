# Changelog

Всі значущі зміни в проєкті фіксуються тут.
Формат: одна секція на задачу, нові записи **додаються зверху**.


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