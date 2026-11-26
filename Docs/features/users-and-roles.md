# Користувачі та ролі

**Дата:** 2026-10-10  
**Маршрут:** `/settings/users` (`page.settings.users`, seed — лише admin)  
**API:** `/api/auth/users`, `/api/auth/roles`, `/api/roles`

---

## Огляд

Керування користувачами винесене з «Адмінських налаштувань» в окремий пункт **Налаштування → Користувачі**. Ролі більше не зашиті лише в код: slug і набір прав зберігаються в БД, каталог ключів — у коді.

| Що | Рішення |
| --- | --- |
| Сторінки / меню | ключі `page.*` на маршруті (`routes.config.tsx`) |
| API / кнопки | ключі `action.*` (`requirePermission`, `hasPermission`) |
| Каталог прав | `shared/constants/permissions.ts` (не CRUD у БД) |
| Призначення ролі | таблиці `roles`, `role_permissions` |
| JWT | як і раніше лише slug ролі |

Куди дивитись:

- Каталог / seed-матриця: `shared/constants/permissions.ts`
- Домени / HR-підрозділи редактора: `shared/constants/permissionRoleEditor.ts`
- Сервіс: `server/services/RoleService.ts`
- API ролей: `server/routes/roles.ts`
- Middleware: `server/middleware/requirePermission.ts`
- UI: `client/pages/Settings/Users/` (`index.tsx`, `UserRegistrationManager.tsx`, `RolesManager.tsx`, `RolePermissionsEditor.tsx`, `CatalogFolderAclTree.tsx`)

---

## UI

Один пункт меню, таби через `PageTabs`, стан у query:

- `/settings/users` — користувачі
- `/settings/users?tab=roles` — ролі

**Користувачі:** список на всю ширину, створення / редагування в Drawer. Селект ролі з `GET /api/auth/roles`. Генератор пароля (10 символів) + індикатор сили паролю (`PasswordStrengthIndicator`, `shared/lib/passwordStrength.ts`). Роль за замовчуванням **порожня** — треба обрати явно. У таблиці: останній візит (`lastActivityAt` / `lastLoginAt`), статус (неактивний рядок напівпрозорий), лічильники замовлень і складських документів. `POST /api/auth/register` не змінює сесію адміна. Не можна видалити себе.

**Спільний Drawer створення:** `client/components/users/CreateUserDrawer.tsx` — використовується в `UserRegistrationManager` (через `openCreate`) і вкладений у `EmployeeDrawer` (HR). Після створення викликає `onCreated` з `{ id, name, email }`.

**Привʼязка Dilovod** (`DilovodUserEmailFields` + `DilovodDictAutocomplete`):

- Autocomplete з довідника `catalogs.users` (у т.ч. вимкнені; `menuTrigger="focus"`).
- Створення: обрати існуючого в Dilovod **або** «Створити лише в Backoffice» (без `dilovodUserId`). API Dilovod **не** дозволяє `saveObject` у `catalogs.users` — `createDilovodUser` відхиляється.
- Для вимкненого облікового запису — опція «Активувати користувача?» (`activateDilovodUser`).
- Dilovod ID показується в картці під autocomplete (не в колонці таблиці).
- Dirty: після відкриття edit baseline перефіксовується після гідрації `dilovodRoleId`, щоб автопідстановка не вмикала «Зберегти».

**Ролі:** таблиця (назва, slug, користувачі, сторінки/дії). Редактор у Drawer:

1. **Метадані** — назва, опис; для нової ролі — «скопіювати права з ролі».
2. **`RolePermissionsEditor`** — права за доменами меню (`PERMISSION_ROLE_EDITOR_DOMAINS`):
   - пошук за назвою + фільтр Усі / Увімкнені / Вимкнені; з текстом пошук іде по всіх доменах одразу: секції «Домен › Підрозділ», на вкладках доменів – «знайдено N», клік по домену скидає пошук;
   - у домені дві колонки: **перегляд** (`page.*`) і **дії** (`action.*`); заголовок колонки з суфіксом стану (немає доступу / частковий / повний), якщо в групі є права;
   - HR — accordion за підрозділами (`PERMISSION_HR_SUBSECTION_*`); секції без жодного увімкненого права згорнуті за замовчуванням;
   - UI overrides: якщо увімкнено пріоритетне право (`PERMISSION_UI_OVERRIDES`), підлеглі права приховані в редакторі, не рахуються в лічильниках і стані групи (частковий / повний) і не потрапляють у save (`stripSupersededPermissions`). Зараз: повне `action.hr.timesheet.edit` перекриває `action.hr.timesheet.edit-own-today`.
3. **`CatalogFolderAclTree`** — ACL папок каталогу (перегляд / редагування) у табличному дереві; повний доступ до каталогу окремим switch.

Після зміни матриці інші сесії бачать жовтий банер «оновити сторінку» (як після деплою). Закриття drawer з незбереженими змінами — `isDirty` + `ConfirmModal`; «Зберегти» активна лише при `isDirty`.

Адмінські налаштування (`/settings/admin`) лишаються для логів, JWT, статусу сервера тощо.

---

## Модель

```
User.role  ──slug──►  Role  ──►  RolePermission.permissionKey
```

`User.role` лишається string. При зміні ролі `roleName` синхронізується з `Role.name`. Невідомий slug на register/update — 400.

Системні 6 ролей сіються зі старими slug (`admin`, `boss`, `shop-manager`, `warehouse-manager`, `storekeeper`, `ads-manager`), якщо таблиця `roles` порожня (`RoleService.seedIfEmpty` на старті сервера). **Runtime auto-restore seed-прав немає** — зміни матриці в UI зберігаються; нові ключі для існуючих інстансів додаються через Prisma-міграцію (не через `ensureSeeded`).

Обмеження:

- `admin` — не видаляється, slug не змінюється, `hasPermission` завжди true (wildcard). Матриця в UI read-only.
- Інші `isSystem` ролі не видаляються.
- Кастомну роль з користувачами видалити не можна.
- Кастомний slug — kebab-case латиницею.

Міграція: `prisma/migrations/20260820023000_add_roles_and_permissions/`.

```bash
npx prisma migrate deploy
```

---

## Каталог прав

Два шари:

| Префікс | Приклад | Де |
| --- | --- | --- |
| `page.*` | `page.settings.users` | меню, `ProtectedRoute` |
| `action.*` | `action.users.manage`, `action.storefront.read`, `action.products.editSpec` | API і кнопки, суворіші за сторінку |

Групування API — за доменом, не 1:1 з handler. `PERMISSION_SEEDS` задає початкову матрицю лише для **порожньої** таблиці `roles`. Далі адмін може звужувати/розширювати кастомні й системні (крім admin) через UI — зміни не відкочуються при наступному API-запиті.

**Новий ключ** (чеклист релізу):

1. `shared/constants/permissions.ts` — `PERMISSION_SEEDS`, `PERMISSIONS`, маршрут у `routes.config.tsx` (для `page.*`).
2. **Prisma-міграція** — `INSERT` у `role_permissions` для потрібних системних ролей за seed-матрицею (`minRole` / `roles`). Еталон: `prisma/migrations/20261005120000_grant_product_movements_report_permission/`.
3. Або вручну через UI **Налаштування → Користувачі → Ролі** (без міграції, якщо достатньо одноразового оновлення).

---

## API

Усі `/api/roles*` — `authenticateToken` + `action.roles.manage`.

| Метод | Шлях | Дія |
| --- | --- | --- |
| GET | `/api/roles` | список + `permissions[]` + `userCount` |
| GET | `/api/roles/catalog` | каталог ключів для UI |
| GET | `/api/roles/:id` | одна роль |
| POST | `/api/roles` | створити |
| PUT | `/api/roles/:id` | name / slug / description / rank |
| PUT | `/api/roles/:id/permissions` | замінити набір ключів |
| DELETE | `/api/roles/:id` | видалити (не system, без користувачів) |

Користувачі:

| Метод | Шлях | Право |
| --- | --- | --- |
| GET/POST/PUT/DELETE | `/api/auth/users`, `/api/auth/register` | `action.users.manage` |
| GET | `/api/auth/roles` | `{ value, label }` для селекта |
| GET | `/api/auth/profile` | `permissions[]`, `roleMeta { slug, name, rank }` |
| GET | `/api/auth/effective-permissions` | права **поточної** (включно з preview) ролі |

`requirePermission(key)` → 403 + `X-Insufficient-Role` / `code: INSUFFICIENT_ROLE`. Системний запит (`userId === 0`, див. «Сесії та токени») проходить. `requireMinRole` / `requireRole` лишились у middleware, з доменних роутів прибрані.

Права ролі кешуються в пам’яті (`slug → Set`); інвалідація після CRUD / `setPermissions`.

---

## Сесії та токени

**Модель.** `UserSession` (`user_sessions`): одна сесія на пристрій або браузер. Поля: `tokenHash` / `prevTokenHash` (sha256 refresh token), `rotatedAt`, `expiresAt`, `lastUsedAt`, `ip` / `lastIp`, `city` / `region` / `country`, `deviceType` / `browser` / `os` (`ua-parser-js`), `revokedAt` / `revokedReason` / `revokedByUserId`. `AuthLoginAttempt` (`auth_login_attempts`): невдалі спроби входу (email, IP, user agent, причина). Старі поля `User.refreshToken*` не використовуються. Міграція: `prisma/migrations/20261126120000_user_sessions/`.

**Токени.** Access і refresh JWT містять `sid`. Обидва лежать у httpOnly cookies.

- `/api/auth/refresh` ротує атомарно (`updateMany` за старим `tokenHash`). Якщо той самий refresh token приходить ще раз протягом 60 с (`REFRESH_ROTATION_GRACE_MS`), видається лише новий access token, refresh cookie не змінюється. Так паралельні запити та вкладки не викидають одне одного.
- Помилки refresh: 401 `REFRESH_MISSING` (cookie немає взагалі, клієнт виходить без тосту), 401 `REFRESH_INVALID`, 403 `USER_BLOCKED`. `/api/auth/profile` без жодної cookie повертає `NO_TOKEN`, і клієнт тоді refresh не пробує.
- Middleware автоматичного оновлення не робить. Налаштування `middlewareAutoRefreshEnabled` / `middlewareRefreshThresholdSeconds` лишились у БД, але не використовуються.
- Middleware перевіряє, що сесію `sid` не завершено (кеш 30 с, інвалідація при завершенні в цьому ж процесі): інакше 401 `SESSION_REVOKED`, клієнт одразу виходить. `lastUsedAt` оновлюється не частіше раз на 60 с.

**Клієнт** (`AuthContext`, `useApi`): один спільний `refreshInFlight` на всі запити і таймер, між вкладками `navigator.locks` (`nk-auth-refresh`). Після отримання lock спершу `/api/auth/profile`: якщо 200, інша вкладка вже оновила токен. Невдалий refresh розлогінює лише після повторного 401 від `/profile` або при `USER_BLOCKED`. Мережева помилка не розлогінює.

**Завершення сесій.** Сесії не видаляються, а позначаються `revokedAt` з причиною: `logout`, `self_revoke`, `admin_revoke`, `password_change`, `user_blocked`, `inactivity`, `expired`. Блокування користувача і зміна пароля адміном завершують усі його сесії; зміна власного пароля завершує всі, крім поточної. Записи старші за 90 днів видаляються при вході.

**Місцезнаходження.** Без зовнішніх сервісів: заголовки Cloudflare `cf-ipcity`, `cf-region`, `cf-ipcountry`, IP з `cf-connecting-ip`. Щоб приходили місто й регіон, у Cloudflare має бути увімкнено Managed Transforms → «Add visitor location headers». Приватні IP показуються як «Локальна мережа» (у dev завжди так).

**Системні запити.** Обхід авторизації (`userId: 0`, роль admin) лише із заголовком `x-system-token`, що збігається з `SYSTEM_REQUEST_TOKEN` у `.env` (>= 32 символи, порівняння за сталий час). Без змінної обхід вимкнено. Старий `x-system-request: true` з localhost не працює: за проксі `req.ip` завжди локальний.

| Метод | Шлях | Право | Дія |
| --- | --- | --- | --- |
| GET | `/api/auth/sessions` | вхід | власні: активні + завершені до 10 рядків, `isCurrent` |
| DELETE | `/api/auth/sessions/:id` | вхід | завершити свою сесію |
| POST | `/api/auth/sessions/revoke-others` | вхід | завершити всі, крім поточної |
| GET | `/api/auth/users/:id/sessions` | `action.users.manage` | сесії користувача, пагінація по 10 |
| POST | `/api/auth/users/:id/sessions/revoke` | `action.users.manage` | `{ sessionIds? }`, без масиву: усі |
| GET | `/api/auth/users/:id/login-attempts` | `action.users.manage` | невдалі спроби, пагінація по 10 |

**UI.** Спільний `client/components/sessions/UserSessionsTable.tsx`: у `/profile` (власні сесії) і в drawer користувача `/settings/users` (режим адміна з вибором кількох і невдалими спробами). Поточна сесія перша, з chip «Поточний». Усі дії завершення через `ConfirmModal`. Контейнер вужчий за 672 px (`@2xl`): список карток замість таблиці.

**Старі сесії.** Токени, видані до `user_sessions`, не мають `sid`: працюють до кінця access token, але не видні в списку пристроїв. `/api/auth/profile` віддає для них `legacySession: true`, і `LegacySessionPrompt` (у `Layout`) пропонує перезайти: «Так, вийти зараз», «Нагадати пізніше» (1 год, 4 год, завтра о 9:00), «Не зараз» (стан у `localStorage`, ключ `nk-legacy-session-prompt:<userId>`). Вихід зі старої сесії не завершує нові сесії користувача. Після кінця терміну клієнт показує жовтий тост «Сесію завершено». Коли старих токенів не лишиться (найпізніше 48 год після деплою v1.4.0), компонент і прапор можна прибрати.

Типи: `shared/types/authSessions.ts`. Тести: `server/services/authService.spec.ts`, `server/middleware/auth.spec.ts`.

---

## Клієнтський доступ

- `getNavGroups(role, permissions)` / `ProtectedRoute` — `canAccessRoute` (спочатку `route.permission`).
- `useRoleAccess().hasPermission(key)` дивиться на `effectivePermissions` з `RolePreviewContext`.
- `isAdmin()` — реальний slug `admin` і не в прев’ю (debug / інструменти). Продуктові кнопки (історія складу, редагування товарів) — конкретні `action.*`.

**Storefront / spec (Products 2.0):** `action.storefront.read|edit|manage`, `action.products.editSpec` — деталі seed і перевірки на save у [`woocommerce-storefront-phase1.md`](./woocommerce-storefront-phase1.md#права-доступу-rbac).

**Модерація специфікації:** `action.products.approveSpec` – затвердження, відхилення й відкат чернеток BOM / `specQty`; збереження специфікації без чернетки. Seed `admin`, `boss`; для наявної ролі `boss` видано міграцією `20261105140000_catalog_spec_moderation`. Без цього права користувач з `action.products.editSpec` створює чернетку на затвердження. Див. [`products-catalog-2.0.md`](./products-catalog-2.0.md#модерація-специфікації).

**Журнал змін каталогу:** `action.products.viewAudit` (вкладка «Історія» в картці товару + API `/api/catalog/goods/:id/audit`, `/api/catalog/audit`) і `page.main.productsAudit` (сторінка `/products/audit`). Seed – `admin`, `boss`; для наявних ролей видано міграцією `20261105130000_grant_products_audit_permissions`. Див. [`products-catalog-2.0.md`](./products-catalog-2.0.md#журнал-змін-товарів).

Тести: `npm test` (vitest). Юніти: `shared/constants/permissions.spec.ts`, `permissionRoleEditor.spec.ts`, `RoleService.spec.ts`, `requirePermission.spec.ts`.
