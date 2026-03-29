# Changelog

Всі значущі зміни в проєкті фіксуються тут.
Формат: одна секція на задачу, нові записи **додаються зверху**.


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