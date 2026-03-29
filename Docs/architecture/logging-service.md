# LoggingService Documentation

## Overview
`LoggingService` is a centralized logging management service for the client-side application. It provides configurable logging for various application domains, supports runtime settings updates, and persists settings to the backend API.

## Features
- Centralized logging for multiple categories (auth, API, routing, equipment, etc.)
- Initialization from server-side settings via `/api/settings/logging`
- Local and remote settings update
- Time-stamped, formatted log output
- Category-specific logging methods
- Fallback to default settings if server fetch fails

## Usage
### Initialization
Automatically initializes on module load (browser only):
```typescript
LoggingService.initialize();
```

### Logging Example
```typescript
LoggingService.authLog('User logged in', { userId: 123 });
LoggingService.apiLog('API call made', { endpoint: '/api/orders' });
```

### Update Settings Locally
```typescript
LoggingService.updateSettings(newSettings);
```

### Save Settings to Server
```typescript
await LoggingService.saveSettings(newSettings);
```

### Get Current Settings
```typescript
const settings = LoggingService.getSettings();
```

## API
- `initialize()`: Loads settings from server
- `updateSettings(settings)`: Updates settings locally
- `saveSettings(settings)`: Persists settings to server
- `getSettings()`: Returns current settings
- `isServiceInitialized()`, `isReady()`: Initialization status
- Category log methods: `authLog`, `apiLog`, `routeLog`, `equipmentLog`, `debugLog`, `perfLog`, `loggingSettingsLog`, `orderAssemblyLog`, `cookieLog`, `warehouseMovementLog`, `productSetsLog`

## Settings Type
See `client/types/logging.ts` for `LoggingSettingsTypes` definition.

## Error Handling
- Falls back to default settings if server fetch fails
- Logs errors to console with context

---
