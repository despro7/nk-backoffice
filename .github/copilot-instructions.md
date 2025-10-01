# Copilot Coding Agent Instructions for nk-food.shop/nova-field

## Project Overview
- **Full-stack monorepo**: React 18 SPA frontend (`client/`), Express API backend (`server/`), shared types (`shared/`), and modular service integrations (e.g., `server/services/dilovod/`).
- **Build system**: Uses Vite for frontend, Express for backend, and npm for package management. Prefer npm for all dependency operations.
- **Styling**: TailwindCSS 4, with design tokens and theming in `client/global.css`. UI components in `client/components/ui/`.
- **Testing**: Vitest is used for unit/integration tests.

## Key Architectural Patterns
- **SPA Routing**: All routes are defined in `client/App.tsx` using React Router 6. Route components live in `client/pages/`.
- **API Design**: Backend endpoints are implemented in Express (`server/`). Only create new endpoints when logic must run server-side (e.g., secrets, DB access).
- **Shared Types**: Use `shared/` for types/interfaces shared between client and server.
- **Service Modules**: Integrations (e.g., Dilovod) are organized as modular directories under `server/services/`, each with its own README and clear boundaries.

## Developer Workflows
- **Build/Run**: Use npm scripts and Vite for dev/build. See `package.json` for available scripts.
- **API Auth/Test**: Use VS Code tasks (see `.vscode/tasks.json`) for API login, test, stats, and logout. Example: run `api:login` before any API test task.
- **Session Management**: API session/cookies are stored in `.vscode/.api-session.xml` and `.api-cookies.xml`.
- **Debugging**: Use the provided PowerShell scripts in the root for server status and control.

## Conventions & Patterns
- **TypeScript everywhere**: All code (client/server/shared) is TypeScript.
- **Prefer functional components** in React, colocate hooks/context in `client/hooks/` and `client/contexts/`.
- **Error handling**: Use utility functions (e.g., `handleDilovodApiError`) for consistent error processing in service modules.
- **Data flow**: Data transformations are handled in dedicated processor modules (e.g., `DilovodDataProcessor.ts`).
- **Cache management**: Use cache manager modules (e.g., `DilovodCacheManager.ts`) for all caching logic.

## Integration Points
- **Dilovod Service**: Modularized in `server/services/dilovod/` with clear separation: API client, data processor, sync manager, cache manager, types, and utils. See its README for details.
- **External APIs**: All external API logic should be encapsulated in service modules, not scattered across the codebase.

## Examples
- **Add a new route**: Create a component in `client/pages/`, add it to the routes in `client/App.tsx`.
- **Add a new API endpoint**: Implement in `server/routes/` or a service module, export types via `shared/` if needed.
- **Integrate a new external service**: Create a new directory under `server/services/`, follow the modular pattern (types, client, processor, etc.), and document in a README.

## References
- See `Docs/AGENTS.md` for more on project structure and conventions.
- See `server/services/dilovod/README.md` for Dilovod integration details.
- See `.vscode/tasks.json` for available VS Code tasks.

---

If a pattern or workflow is unclear, check the referenced docs or ask for clarification before proceeding with major changes.
