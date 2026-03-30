---
trigger: always_on
description: "Головні інструкції та правила розробки для проекту nk-food.shop/nova-field"
---

# AntiGravity Agent Instructions for nk-food.shop/nova-field

## Project Overview
**Full-stack order management backoffice** для бізнесу з доставки їжі (NK Food Shop). React 18 SPA frontend (`client/`), Express API backend (`server/`), MySQL + Prisma ORM, shared types (`shared/`). Інтегрується з зовнішніми сервісами (Dilovod ERP, SalesDrive CRM, shipping providers) та підтримує спеціалізоване обладнання (ваги, сканери штрих-кодів, QZ Tray для друку етикеток).

- **Build**: Vite для frontend, TSC для backend, npm (НЕ pnpm/yarn)
- **Dev server**: Один порт (8080) обслуговує і клієнт, і API через Vite `expressPlugin` у `vite.config.dev.ts`
- **Styling**: TailwindCSS 4, HeroUI component library, design tokens у `client/global.css`
- **Database**: MySQL через Prisma (`prisma/schema.prisma`)

## Agent Behavior Rules

### Language
- **Завжди відповідай УКРАЇНСЬКОЮ мовою**, незалежно від мови запиту користувача.
- **Коментарі в коді** повинні бути **УКРАЇНСЬКОЮ або АНГЛІЙСЬКОЮ** мовами.

### Workflow & Commands
- Ти маєш доступ до терміналу через `run_command`. Використовуй його для запуску скриптів (`npm run dev`, `npm run db:migrate` тощо).
- Перевіряй `.vscode/tasks.json` для розуміння тестових сценаріїв API, але запускай їх відповідними командами через `run_command`.

### Before Starting Any Task
1. **Перевір `/Docs`** на наявність документації по відповідній зоні перед внесенням змін.
2. Якщо зона не задокументована і завдання не тривіальне — коротко досліди архітектуру (grep, читання ключових файлів).
3. Якщо обсяг змін незрозумілий — постав уточнююче питання перед написанням коду.

### Documentation & Changelog
Після завершення будь-якого нетривіального завдання **завжди запитуй користувача**:
> *"Чи потрібно задокументувати ці зміни?"*

Якщо так — дотримуйся цього процесу:
1. Покажи **короткий превью в чаті** (що змінилося, які файли зачеплено, де запропоновано створити док).
2. Чекай на **схвалення користувача**.
3. Тільки після схвалення — пиши файл документації у відповідну підпапку в `/Docs` та оновлюй `CHANGELOG.md`.

**`/Docs` folder structure:**
- `CHANGELOG.md` — головний ченджлог (один файл, додавати нові записи зверху)
- `architecture/`, `features/`, `integrations/`, `hardware/`, `api/`, `guides/`

## Critical Architecture Patterns

### Service-Oriented Backend
Весь бізнес-логіка бекенда організована як **singleton service classes** у `server/services/`. Експортуй вже ініціалізований синглтон:
```typescript
export class MyService { ... }
export const myService = new MyService();
```

### Frontend Patterns
- **Route config**: Центр в `client/routes.config.tsx` з RBAC.
- **Contexts**: AuthContext, DebugContext, ServerStatusContext.
- **Services**: Клієнтські сервіси в `client/services/` (ToastService, LoggingService тощо) — використовуй синглтони з статичними методами.
- **State management**: React Query (`@tanstack/react-query`) для стану сервера, Context для UI стану.

### Authentication & Session Management
- **JWT tokens**: Access (48h) + Refresh (30d) у HTTP-only cookies.
- **Middleware**: `server/middleware/auth.ts` обробляє оновлення токенів.
- **Settings sync**: Налаштування користувача завантажуються **тільки після** успішного `/api/auth/profile`.

### Cron Jobs & Background Tasks
**Критично**: Крон-задачі керуються через `cronService` з процесною реєстрацією для безпеки HMR:
```typescript
const cronJobsRegistry = getProcessLevelCronRegistry();
// Викликай forceStopAllCronJobs() перед стартом нових задач
```

## Key Conventions

### TypeScript Everything
- Шляхи: `@/` (client), `@shared/` (shared).
- Сервер використовує `.js` розширення в імпортах (ESM): `import { x } from './module.js'`.
- **Сувора типізація обов'язкова**: уникай `any`.
- **Обробка помилок**: завжди використовуй `try-catch`. На сервері `logServer()`, на клієнті `ToastService`.

### Component Structure
- `client/components/ui/` — обгортки HeroUI.
- `client/pages/` — компоненти роутів.
- `client/services/` — клієнтська бізнес-логіка.

### UI & Styling
- **HeroUI v2.8.x** — стандарт для всіх елементів інтерфейсу.
- **TailwindCSS v4** — для стилізації.

## Integration Points
- **Dilovod**: ERP для продуктів/складу. 3 незалежні крони (товари, залишки, замовлення).
- **SalesDrive**: CRM для замовлень (webhook + polling кожну годину).
- **Hardware**: Ваги (`ScaleService.ts`), сканери (`BarcodeScannerService.ts`), принтери (QZ Tray).

## Roles & Permissions
- Використовуй константи з `shared/constants/roles.ts`.
- Рівні: `ADS_MANAGER` (1), `STOREKEEPER` (2), `WAREHOUSE_MANAGER` (3), `SHOP_MANAGER` (4), `BOSS` (5), `ADMIN` (6).
- Ніколи не хардкодь рядки ролей — тільки імпорт констант.