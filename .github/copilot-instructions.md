# Copilot Coding Agent Instructions for nk-food.shop/nova-field

## Project Overview
**Full-stack order management backoffice** for a food delivery business (NK Food Shop). React 18 SPA frontend (`client/`), Express API backend (`server/`), MySQL + Prisma ORM, shared types (`shared/`). Integrates with external services (Dilovod ERP, SalesDrive CRM, shipping providers) and supports specialized hardware (scales, barcode scanners, QZ Tray label printing).

- **Build**: Vite for frontend, TSC for backend, npm package manager (NOT pnpm/yarn)
- **Dev server**: Single port (8080) serves both client and API via Vite's `expressPlugin` in `vite.config.dev.ts`
- **Production**: PM2 process manager (`ecosystem.config.cjs`), separate client/server builds
- **Styling**: TailwindCSS 4, HeroUI component library, design tokens in `client/global.css`
- **Database**: MySQL via Prisma (`prisma/schema.prisma`), migrations in `prisma/migrations/`

## Critical Architecture Patterns

### Service-Oriented Backend
All backend business logic is organized as **singleton service classes** in `server/services/`:
```typescript
// Pattern: Export instantiated singleton
export class MyService { ... }
export const myService = new MyService();
```
Key services: `salesDriveService` (CRM sync), `orderDatabaseService`, `ordersCacheService`, `DilovodService` (ERP), `cronService` (scheduled jobs), `settingsService` (equipment config).

**Service module structure** (e.g., `server/services/dilovod/`):
- `DilovodService.ts` - Main coordinator class
- `DilovodApiClient.ts` - HTTP client for external API
- `DilovodDataProcessor.ts` - Data transformation logic
- `DilovodSyncManager.ts` - DB synchronization
- `DilovodCacheManager.ts` - Cache management
- `DilovodTypes.ts` - TypeScript interfaces
- `DilovodUtils.ts` - Helper functions
- `README.md` - Module-specific documentation

When integrating external services, **always follow this modular pattern** with clear separation of concerns.

### Frontend Patterns
- **Route config**: Centralized in `client/routes.config.tsx` with role-based access control (ROLES hierarchy: ADS_MANAGER < STOREKEEPER < SHOP_MANAGER < BOSS < ADMIN)
- **Contexts**: `AuthContext` (user/auth state), `DebugContext` (debug mode), `ServerStatusContext` (server health)
- **Services**: Client-side services in `client/services/` (ToastService, LoggingService, ScaleService, BarcodeScannerService, EquipmentService) - use singleton pattern with static methods
- **State management**: React Query (`@tanstack/react-query`) for server state, Context for global UI state
- **Protected routes**: Wrap with `<ProtectedRoute>` + `<Layout>` in `client/App.tsx`

### Authentication & Session Management
- **JWT tokens**: Access token (short-lived, 15min) + refresh token (long-lived, 7 days) stored in HTTP-only cookies
- **Middleware**: `server/middleware/auth.ts` handles automatic token refresh when access token expires within threshold
- **VS Code tasks**: API testing workflows require login first (`api:login` task stores session in `.vscode/.api-session.xml`)
- **Settings sync**: User settings (toast, equipment) loaded from server and cached in AuthContext

### Cron Jobs & Background Tasks
**Critical**: Cron jobs managed via `cronService` with process-level registry to prevent "zombie" jobs during Vite HMR:
```typescript
// Pattern: Use process-level registry for HMR safety
const cronJobsRegistry = getProcessLevelCronRegistry();
// Call forceStopAllCronJobs() before starting new jobs
```
Scheduled tasks: Orders sync (every 5 min), cache cleanup, reporting data aggregation. All cron jobs must call `syncSettingsService.isSyncEnabled()` before execution.

## Developer Workflows

### Local Development
```bash
npm run dev              # Start Vite dev server (port 8080, serves client + API)
npm run dev:server       # Watch mode for server-only development
npm run build            # Build both client and server
npm run start            # Run production build
```

**HMR behavior**: Server reloads on changes (Express middleware re-attached), but cron jobs must be manually cleaned up via `forceStopAllCronJobs()`.

### Database Operations
```bash
npm run db:generate      # Generate Prisma client (auto-runs on postinstall)
npm run db:migrate       # Create/apply dev migrations
npm run db:migrate:prod  # Deploy migrations (production)
npm run db:studio        # Open Prisma Studio GUI
```
**Migration pattern**: Always run `prisma migrate dev` after schema changes, seeds in `prisma/seed.ts`.

### API Testing with VS Code Tasks
**Prerequisite**: Start dev server (`npm run dev`) first.
1. Run `api:login` task (stores session in `.vscode/.api-session.xml`)
2. Run `api:test`, `api:stats`, `api:orders`, or `api:products` tasks
3. Run `api:logout` to clear session

Tasks use PowerShell's `Invoke-WebRequest` with `-WebSession` for cookie-based auth.

### Server Management (Production)
```bash
npm run server:stop:win      # Stop server via PowerShell script
npm run server:status:win    # Check running processes
npm run deploy:prepare       # Build + migrate for production
npm run deploy:start         # Start with PM2
```
PM2 config in `ecosystem.config.cjs` (single instance, auto-restart, 1G memory limit).

### QZ Tray Integration (Label Printing)
```bash
npm run qz:test     # Test QZ Tray connection
npm run qz:cert     # Generate self-signed certificate
```
See `Docs/QZ_TRAY_INSTRUCTIONS.md` for setup. Routes in `server/routes/qz-tray.ts`, client service in `client/services/EquipmentService.ts`.

## Key Conventions

### TypeScript Everywhere
- All client/server/shared code is TypeScript (`.ts`/`.tsx`)
- Path aliases: `@/` (client), `@shared/` (shared)
- Server uses `.js` extensions in imports (ESM compatibility): `import { x } from './module.js'`

### Component Structure
```
client/components/          # Shared React components
client/components/ui/       # HeroUI wrapper components (Button, Modal, etc.)
client/pages/               # Route components (Index.tsx = /, OrderView.tsx = /orders/:externalId)
client/hooks/               # Custom React hooks
client/contexts/            # React Context providers
client/services/            # Client-side business logic (static classes)
```

**React patterns**: Functional components, hooks > HOCs, colocate related code, use `ErrorBoundary` for error handling.

### API Design
- **Endpoints**: Prefixed with `/api/`, grouped by domain in `server/routes/`
- **Authentication**: Most routes require `authenticateToken` middleware (JWT validation)
- **Error handling**: Return structured JSON errors with status codes, client shows toasts via `ToastService`
- **CORS**: Configured in `server/index.ts` for localhost origins (3000, 5173, 8080) + credentials support
- **Shared types**: Define API contracts in `shared/types/`, import in both client and server

### Logging & Debugging
- **Server logs**: Use `logServer()` utility from `server/lib/utils.ts` (timestamps, colored output)
- **Client logs**: `LoggingService.log()` (settings-controlled, can be disabled per user)
- **Toast notifications**: `ToastService` with per-user settings (auth errors, API errors, equipment status, etc.) - settings fetched from `/api/settings/toast`
- **Debug mode**: Toggle via `DebugContext`, shows extra UI controls and logging

### Settings Management
**Two-tier system**:
1. **Base settings** (`settings_base` table): Global app config (reporting day start hour, sync intervals)
2. **User settings** (`users` table JSON fields): Per-user preferences (toast settings, equipment config)

Access via `settingsService` (server) or API endpoints (`/api/settings/*`). Always validate with Zod schemas.

## Integration Points

### External Services
- **Dilovod**: ERP system for products/inventory (see `server/services/dilovod/README.md`)
  - Sync products with prices, stock balances, product sets
  - Cron job: Every 30 min (configurable)
  - Cache: SKU mapping cached in memory
- **SalesDrive**: CRM for orders (webhook + polling sync)
  - Webhook: `/api/webhooks/salesdrive` (CORS allows no-origin)
  - Active polling: Every 5 min via `cronService`
  - Data: `salesDriveService` fetches orders, transforms, stores in DB
- **Shipping providers**: Nova Poshta, other carriers
  - Routes: `server/routes/shipping.ts`, `server/routes/shipping-providers.ts`
  - Service: `shippingService`, `shippingProviderService`

### Hardware Integrations
- **Scales**: Serial/USB connection via `ScaleService.ts` (configurable connection strategy)
- **Barcode scanners**: `BarcodeScannerService.ts` (keyboard input capture)
- **Label printers**: QZ Tray bridge (`qz-tray` npm package), certificate-based auth

**Equipment settings**: Stored per user in `users` table, loaded via AuthContext, updated via `/api/settings/equipment`.

## Domain-Specific Context

### Order Management
- **Order lifecycle**: Created (webhook) → Cached → Synced to DB → Viewed/Assembled → Shipped
- **External IDs**: Primary identifier (e.g., SalesDrive order ID), used in URLs (`/orders/:externalId`)
- **Assembly view**: `OrderView.tsx` with checklist, weight tracking, deviation handling
- **Reporting day**: Orders grouped by "reporting day" (configurable start hour, default 0) for daily reports

### Product Management
- **Categories**: Mapped from Dilovod groups (see `DilovodUtils.ts` - DEFAULT_DILOVOD_CONFIG.categoriesMap)
- **SKUs**: Critical for matching orders to products, cached from WordPress API
- **Product sets**: Dilovod "комплекти" (bundles), expanded into components during sync
- **Stock balances**: Synced from Dilovod, used for warehouse management

### Roles & Permissions
**Role hierarchy** (see `client/routes.config.tsx`):
- `ADS_MANAGER` (1): View reports only
- `STOREKEEPER` (2): Assembly operations
- `SHOP_MANAGER` (3): Order management
- `BOSS` (4): Full access except admin settings
- `ADMIN` (5): Full system access

**Route protection**: Use `minRole` or `roles` array in route config, enforced by `ProtectedRoute` component.

## Common Patterns

### Adding a New Service Integration
1. Create directory: `server/services/myservice/`
2. Create files: `MyService.ts` (coordinator), `MyApiClient.ts`, `MyDataProcessor.ts`, `MyTypes.ts`, `MyUtils.ts`, `README.md`
3. Export singleton: `export const myService = new MyService();`
4. Add routes: `server/routes/myservice.ts`, register in `server/index.ts`
5. Add cron job (if needed): Register in `cronService.ts`, check `isSyncEnabled()` before running
6. Document: Add README with API docs, configuration, examples

### Adding a New Page/Route
1. Create component: `client/pages/MyPage.tsx`
2. Add to route config: `client/routes.config.tsx` (specify roles, icon, nav label)
3. Routes auto-rendered in `client/App.tsx` (no manual route addition needed)
4. Protect with `ProtectedRoute` wrapper (already applied in App.tsx loop)

### Adding Settings
1. Define schema in `server/routes/settings.ts` (use Zod)
2. Add API endpoints: GET/PUT `/api/settings/my-setting`
3. Add UI: Create settings component in `client/components/`, add to `SettingsAdmin.tsx` or `SettingsEquipment.tsx`
4. Use `settingsService` (server) or fetch API (client)

## References
- `Docs/AGENTS.md` - Project structure overview
- `server/services/dilovod/README.md` - Dilovod integration details
- `Docs/QUICK_START.md` - Reporting day start hour implementation
- `Docs/TESTING_GUIDE.md` - API testing workflows
- `Docs/QZ_TRAY_INSTRUCTIONS.md` - Label printer setup
- `.vscode/tasks.json` - Available VS Code tasks

**When patterns are unclear**: Check referenced docs, search for existing implementations (e.g., `grep_search` for similar services), or ask for clarification before major changes.
