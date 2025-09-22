# 🔐 Система настроек авторизации в БД

## 📋 Обзор изменений

Система авторизации была переведена с хардкодированных констант на гибкую систему настроек, хранящихся в базе данных. Теперь все параметры токенов можно изменять через веб-интерфейс без перезапуска сервера.

## 🗄️ Структура базы данных

### Таблица `auth_settings`

```sql
CREATE TABLE `auth_settings` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(100) NOT NULL,
    `value` VARCHAR(255) NOT NULL,
    `description` TEXT,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `auth_settings_key_key` (`key`)
);
```

### Настройки по умолчанию

| Ключ | Значение | Описание |
|------|----------|----------|
| `access_token_expires_in` | `1h` | Время жизни access токена |
| `refresh_token_expires_in` | `30d` | Время жизни refresh токена |
| `user_activity_threshold_days` | `30` | Порог неактивности пользователя в днях |
| `middleware_refresh_threshold_seconds` | `300` | Порог обновления в middleware (сек) |
| `client_refresh_threshold_minutes` | `10` | Порог обновления в клиенте (мин) |
| `token_refresh_enabled` | `true` | Включить автоматическое обновление |
| `middleware_auto_refresh_enabled` | `true` | Включить автообновление в middleware |
| `client_auto_refresh_enabled` | `true` | Включить автообновление в клиенте |

## 🏗️ Архитектура системы

### 1. AuthSettingsService

**Файл:** `server/services/authSettingsService.ts`

```typescript
export class AuthSettingsService {
  // Получить настройку по ключу
  static async getSetting(key: string, defaultValue: string = ''): Promise<string>
  
  // Установить настройку
  static async setSetting(key: string, value: string, description?: string): Promise<void>
  
  // Получить все настройки авторизации с типизацией
  static async getAuthSettings(): Promise<AuthSettingsData>
  
  // Парсинг времени жизни токена в секунды
  static parseExpiryTime(expiryTime: string): number
  
  // Парсинг времени жизни токена в миллисекунды
  static parseExpiryTimeMs(expiryTime: string): number
}
```

**Особенности:**
- ✅ Кеширование на 5 минут для производительности
- ✅ Автоматическое создание настроек при первом обращении
- ✅ Валидация и парсинг времени жизни токенов

### 2. Обновленный AuthService

**Файл:** `server/services/authService.ts`

**Изменения:**
- ❌ Удалены константы `ACCESS_TOKEN_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN`
- ✅ Добавлен метод `getSettings()` для получения настроек из БД
- ✅ Все методы теперь используют настройки из БД

**Пример использования:**
```typescript
// Старый код
const accessToken = jwt.sign(payload, secret, { 
  expiresIn: '1h' // хардкод
});

// Новый код
const settings = await this.getSettings();
const accessToken = jwt.sign(payload, secret, { 
  expiresIn: settings.accessTokenExpiresIn // из БД
});
```

### 3. Обновленный Middleware

**Файл:** `server/middleware/auth.ts`

**Изменения:**
- ✅ Получает порог обновления из БД
- ✅ Проверяет, включено ли автообновление
- ✅ Использует настройки `middlewareRefreshThresholdSeconds`

```typescript
// Получаем настройки из БД
const settings = await AuthSettingsService.getAuthSettings();

// Если автоматическое обновление включено и токен истекает в ближайшее время
if (settings.middlewareAutoRefreshEnabled && 
    timeUntilExpiry <= settings.middlewareRefreshThresholdSeconds && 
    timeUntilExpiry > 0) {
  // Обновляем токен
}
```

### 4. Обновленный AuthContext

**Файл:** `client/contexts/AuthContext.tsx`

**Изменения:**
- ✅ Загружает настройки авторизации при инициализации
- ✅ Использует настройки из БД для расчета времени обновления
- ✅ Проверяет, включено ли автообновление

```typescript
// Рассчитываем время до истечения токена на основе настроек из БД
const getRefreshDelay = (expiresIn?: number): number => {
  if (expiresIn) {
    const thresholdMinutes = authSettings?.clientRefreshThresholdMinutes || 10;
    const isEnabled = authSettings?.clientAutoRefreshEnabled !== false;
    
    if (!isEnabled) {
      return 24 * 60 * 60 * 1000; // 24 часа если отключено
    }
    
    return Math.max((expiresIn * 1000) - (thresholdMinutes * 60 * 1000), 60000);
  }
  return 50 * 60 * 1000; // По умолчанию 50 минут
};
```

## 🌐 API для управления настройками

### Маршруты

**Базовый URL:** `/api/auth/settings`

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| `GET` | `/settings` | Получить настройки (для клиента) | Аутентифицированные |
| `GET` | `/settings/admin` | Получить настройки (для админов) | Только админы |
| `PUT` | `/settings` | Обновить настройки | Только админы |
| `POST` | `/settings/reset` | Сбросить к умолчанию | Только админы |
| `POST` | `/settings/clear-cache` | Очистить кеш | Только админы |

### Примеры запросов

**Получить настройки:**
```bash
GET /api/auth/settings/admin
Authorization: Bearer <token>
```

**Обновить настройки:**
```bash
PUT /api/auth/settings
Authorization: Bearer <token>
Content-Type: application/json

{
  "accessTokenExpiresIn": "2h",
  "refreshTokenExpiresIn": "7d",
  "middlewareRefreshThresholdSeconds": 600,
  "clientRefreshThresholdMinutes": 15,
  "tokenRefreshEnabled": true,
  "middlewareAutoRefreshEnabled": true,
  "clientAutoRefreshEnabled": true
}
```

## 🖥️ Веб-интерфейс

### Компонент AuthSettings

**Файл:** `client/components/AuthSettings.tsx`

**Функции:**
- ✅ Отображение всех настроек авторизации
- ✅ Редактирование параметров через форму
- ✅ Валидация введенных значений
- ✅ Сброс к значениям по умолчанию
- ✅ Очистка кеша настроек

**Расположение:** Настройки → Админские настройки → Настройки авторизации

### Интерфейс настроек

```typescript
interface AuthSettingsData {
  accessTokenExpiresIn: string;           // "1h", "2h", "30m"
  refreshTokenExpiresIn: string;          // "30d", "7d", "1d"
  userActivityThresholdDays: number;      // 30
  middlewareRefreshThresholdSeconds: number; // 300
  clientRefreshThresholdMinutes: number;  // 10
  tokenRefreshEnabled: boolean;           // true
  middlewareAutoRefreshEnabled: boolean;  // true
  clientAutoRefreshEnabled: boolean;      // true
}
```

## ⚡ Преимущества новой системы

### 1. Гибкость
- ✅ Изменение настроек без перезапуска сервера
- ✅ Разные настройки для разных окружений
- ✅ A/B тестирование параметров авторизации

### 2. Удобство управления
- ✅ Веб-интерфейс для админов
- ✅ Валидация параметров
- ✅ Автоматическое создание настроек по умолчанию

### 3. Производительность
- ✅ Кеширование настроек на 5 минут
- ✅ Минимальное количество запросов к БД
- ✅ Автоматическая очистка кеша при изменениях

### 4. Безопасность
- ✅ Доступ только для админов
- ✅ Валидация всех параметров
- ✅ Логирование изменений

## 🔄 Миграция с старой системы

### Что изменилось

**До:**
```typescript
// Хардкодированные константы
private static readonly ACCESS_TOKEN_EXPIRES_IN = '1h';
private static readonly REFRESH_TOKEN_EXPIRES_IN = '30d';
private static readonly USER_ACTIVITY_THRESHOLD = 30 * 24 * 60 * 60 * 1000;
```

**После:**
```typescript
// Настройки из БД
const settings = await this.getSettings();
const accessTokenExpiresIn = settings.accessTokenExpiresIn;
const refreshTokenExpiresIn = settings.refreshTokenExpiresIn;
const userActivityThresholdMs = settings.userActivityThresholdDays * 24 * 60 * 60 * 1000;
```

### Обратная совместимость

- ✅ Старые токены продолжают работать
- ✅ При первом запуске создаются настройки по умолчанию
- ✅ Если БД недоступна, используются fallback значения

## 🚀 Использование

### Для разработчиков

1. **Получить настройки:**
```typescript
import { AuthSettingsService } from './services/authSettingsService.js';

const settings = await AuthSettingsService.getAuthSettings();
console.log('Access token expires in:', settings.accessTokenExpiresIn);
```

2. **Обновить настройку:**
```typescript
await AuthSettingsService.setSetting(
  'access_token_expires_in', 
  '2h', 
  'Время жизни access токена'
);
```

### Для администраторов

1. Перейдите в **Настройки → Админские настройки**
2. Найдите секцию **"🔐 Настройки авторизации"**
3. Измените нужные параметры
4. Нажмите **"Сохранить"**
5. Настройки вступят в силу немедленно

## 🔧 Устранение неполадок

### Проблема: Настройки не применяются
**Решение:** Очистите кеш через кнопку "Очистить кеш" или перезапустите сервер

### Проблема: Ошибка "Setting not found"
**Решение:** Запустите миграцию БД или создайте настройки вручную

### Проблема: Токены не обновляются
**Решение:** Проверьте, что `tokenRefreshEnabled` установлен в `true`

## 📝 Заключение

Новая система настроек авторизации обеспечивает:
- 🔧 **Гибкость** - легкое изменение параметров
- ⚡ **Производительность** - кеширование и оптимизация
- 🔒 **Безопасность** - контроль доступа и валидация
- 👥 **Удобство** - веб-интерфейс для управления

Система полностью обратно совместима и готова к использованию в продакшене.

---

**Дата создания:** 22 января 2025  
**Версия:** 1.0  
**Автор:** AI Assistant
