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

**Користувачі:** список на всю ширину, створення / редагування в Drawer. Селект ролі з `GET /api/auth/roles`. Генератор пароля (10 символів) + індикатор сили паролю (`PasswordStrengthIndicator`, `shared/lib/passwordStrength.ts`). Роль за замовчуванням **порожня** — треба обрати явно. У таблиці: останній візит (`lastActivityAt` / `lastLoginAt`), `dilovodUserId` (inline), статус (неактивний рядок напівпрозорий), лічильники замовлень і складських документів. `POST /api/auth/register` не змінює сесію адміна. Не можна видалити себе.

**Спільний Drawer створення:** `client/components/users/CreateUserDrawer.tsx` — використовується в `UserRegistrationManager` (через `openCreate`) і вкладений у `EmployeeDrawer` (HR). Після створення викликає `onCreated` з `{ id, name, email }`.

**Dilovod user ID:** поле опційне; значення потрапляє в `users.dilovodUserId` і далі в `author` складських документів Dilovod. Зараз — ручний Input. Довідник Dilovod `catalogs.users` (див. `Docs/integrations/dilovod-metadata.md`) дозволяє замінити на Autocomplete з іменем і email.

**Ролі:** таблиця (назва, slug, користувачі, сторінки/дії). Редактор у Drawer:

1. **Метадані** — назва, опис; для нової ролі — «скопіювати права з ролі».
2. **`RolePermissionsEditor`** — права за доменами меню (`PERMISSION_ROLE_EDITOR_DOMAINS`):
   - пошук за назвою + фільтр Усі / Увімкнені / Вимкнені;
   - у домені дві колонки: **перегляд** (`page.*`) і **дії** (`action.*`); заголовок колонки з суфіксом стану (немає доступу / частковий / повний), якщо в групі є права;
   - HR — accordion за підрозділами (`PERMISSION_HR_SUBSECTION_*`); секції без жодного увімкненого права згорнуті за замовчуванням;
   - UI overrides: якщо увімкнено пріоритетне право (`PERMISSION_UI_OVERRIDES`), підлеглі чекбокси disabled і не потрапляють у save (`stripSupersededPermissions`). Зараз: повне `action.hr.timesheet.edit` перекриває `action.hr.timesheet.edit-own-today`.
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

`requirePermission(key)` → 403 + `X-Insufficient-Role` / `code: INSUFFICIENT_ROLE`. Cron (`userId === 0`) проходить. `requireMinRole` / `requireRole` лишились у middleware, з доменних роутів прибрані.

Права ролі кешуються в пам’яті (`slug → Set`); інвалідація після CRUD / `setPermissions`.

---

## Клієнтський доступ

- `getNavGroups(role, permissions)` / `ProtectedRoute` — `canAccessRoute` (спочатку `route.permission`).
- `useRoleAccess().hasPermission(key)` дивиться на `effectivePermissions` з `RolePreviewContext`.
- `isAdmin()` — реальний slug `admin` і не в прев’ю (debug / інструменти). Продуктові кнопки (історія складу, редагування товарів) — конкретні `action.*`.

**Storefront / spec (Products 2.0):** `action.storefront.read|edit|manage`, `action.products.editSpec` — деталі seed і перевірки на save у [`woocommerce-storefront-phase1.md`](./woocommerce-storefront-phase1.md#права-доступу-rbac).

Тести: `npm test` (vitest). Юніти: `shared/constants/permissions.spec.ts`, `permissionRoleEditor.spec.ts`, `RoleService.spec.ts`, `requirePermission.spec.ts`.
