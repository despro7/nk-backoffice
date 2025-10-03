# ToastService Documentation

## Overview
`ToastService` provides centralized toast notification management for the client-side application. It supports configurable notification types, runtime settings updates, and persistence to the backend API.

## Features
- Centralized toast notification management
- Initialization from server-side settings via `/api/settings/toast`
- Local and remote settings update
- Category-specific toast methods (auth, token, API errors, equipment, system notifications)
- Fallback to default settings if server fetch fails
- Integration with `@heroui/react` for toast rendering

## Usage
### Initialization
```typescript
await ToastService.initialize();
```

### Show Toast Example
```typescript
ToastService.show({
  title: 'Success',
  description: 'Operation completed',
  color: 'success',
  settingKey: 'authSuccess'
});
```

### Category Toasts
```typescript
ToastService.loginSuccess('user@example.com');
ToastService.authError('Invalid credentials');
```

### Update Settings Locally
```typescript
ToastService.updateSettings(newSettings);
```

### Save Settings to Server
```typescript
await ToastService.saveSettings(newSettings);
```

### Get Current Settings
```typescript
const settings = ToastService.getSettings();
```

## API
- `initialize()`: Loads settings from server
- `show(options)`: Shows a toast notification
- Category methods: `tokenGenerated`, `tokenRefreshed`, `tokenRemoved`, `tokenExpired`, `loginSuccess`, `logoutSuccess`, `authError`, `refreshError`
- `updateSettings(newSettings)`: Updates settings locally
- `saveSettings(settings)`: Persists settings to server
- `getSettings()`: Returns current settings

## Settings Type
See `client/types/toast.ts` for `ToastSettingsTypes` definition.

## Error Handling
- Falls back to default settings if server fetch fails
- Logs errors to console with context

---
