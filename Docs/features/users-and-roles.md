# Користувачі та ролі

**Дата:** 2026-08-20  
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
- Сервіс: `server/services/RoleService.ts`
- API ролей: `server/routes/roles.ts`
- Middleware: `server/middleware/requirePermission.ts`
- UI: `client/pages/Settings/Users/` (`index.tsx`, `components/UserRegistrationManager.tsx`, `components/RolesManager.tsx`)

---

## UI

Один пункт меню, таби через `PageTabs`, стан у query:

- `/settings/users` — користувачі
- `/settings/users?tab=roles` — ролі

**Користувачі:** список на всю ширину, створення / редагування в Drawer. Селект ролі з `GET /api/auth/roles`. Генератор пароля. У таблиці: останній візит (`lastActivityAt` / `lastLoginAt`), `dilovodUserId` (inline), статус (неактивний рядок напівпрозорий), лічильники замовлень і складських документів. `POST /api/auth/register` не змінює сесію адміна. Не можна видалити себе.

**Ролі:** таблиця (назва, slug, користувачі, сторінки/дії). Редактор у Drawer: метадані, «скопіювати права з ролі», дві колонки **Сторінки** (`page.*`) і **Дії** (`action.*`). Після зміни матриці інші сесії бачать жовтий банер «оновити сторінку» (як після деплою).

Адмінські налаштування (`/settings/admin`) лишаються для логів, JWT, статусу сервера тощо.

---

## Модель

```
User.role  ──slug──►  Role  ──►  RolePermission.permissionKey
```

`User.role` лишається string. При зміні ролі `roleName` синхронізується з `Role.name`. Невідомий slug на register/update — 400.

Системні 6 ролей сіються зі старими slug (`admin`, `boss`, `shop-manager`, `warehouse-manager`, `storekeeper`, `ads-manager`), якщо таблиця `roles` порожня (`RoleService.ensureSeeded` на старті сервера).

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
| `action.*` | `action.users.manage`, `action.warehouse.history.delete` | API і кнопки, суворіші за сторінку |

Групування API — за доменом, не 1:1 з handler. Seed системних ролей повторює стару матрицю `minRole` / `roles` (день релізу без зміни доступу). Далі адмін може звужувати/розширювати кастомні й системні (крім admin).

Новий ключ: додати в `PERMISSIONS` + `PERMISSION_CATALOG` (label, група, `seed`). Існуючі рядки в БД самі не підхоплять новий ключ — треба оновити матрицю ролі або пересіяти порожню таблицю.

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

Тести: `npm test` (vitest). Юніти: `shared/constants/*.spec.ts`, `RoleService.spec.ts`, `requirePermission.spec.ts`.
