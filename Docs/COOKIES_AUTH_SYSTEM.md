# 🍪 Система Аутентификации с Cookies

## 📋 Обзор

Мы успешно перешли с localStorage на cookies для хранения токенов аутентификации. Это решение полностью устраняет проблему `Failed to fetch` и обеспечивает более надежную работу системы.

## ✅ Преимущества Cookies над localStorage

- **Автоматическая отправка** - cookies автоматически отправляются с каждым HTTP запросом
- **Надежность** - не зависят от JavaScript и работают даже при проблемах с fetch API
- **Безопасность** - HttpOnly флаг защищает от XSS атак
- **Автоматическое управление** - браузер автоматически управляет истечением cookies
- **Нет проблем с setInterval** - работают корректно в неактивных вкладках

## 🏗️ Архитектура

### Серверная часть

#### 1. Middleware
- **cookie-parser** - парсинг cookies
- **CORS с credentials: true** - разрешение cookies между доменами

#### 2. AuthService
```typescript
// Установка cookies
static async setAuthCookies(res: Response, accessToken: string, refreshToken: string)

// Очистка cookies
static async clearAuthCookies(res: Response)

// Получение токенов из cookies
static async getTokenFromCookies(req: Request)
```

#### 3. Маршруты
- **POST /api/auth/register** - регистрация с установкой cookies
- **POST /api/auth/login** - вход с установкой cookies
- **POST /api/auth/refresh** - обновление токенов
- **POST /api/auth/logout** - выход с очисткой cookies
- **GET /api/auth/profile** - получение профиля по cookies

### Клиентская часть

#### 1. AuthContext
- Убрана зависимость от localStorage
- Автоматическое обновление токенов каждые 14 минут
- Стратегия для неактивных вкладок (Page Visibility API)
- Отслеживание активности пользователя

#### 2. useApi
- Автоматическое добавление `credentials: 'include'`
- Обработка 401 ошибок с автоматическим выходом

## 🔧 Конфигурация

### Сервер
```typescript
// server/index.ts
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true // Важно для cookies
}));
app.use(cookieParser());
```

### Cookies
```typescript
// Access Token (15 минут)
{
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 15 * 60 * 1000,
  path: '/'
}

// Refresh Token (7 дней)
{
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/'
}
```

## 🚀 Использование

### Вход в систему
```typescript
const { login } = useAuth();

const success = await login({
  email: 'user@example.com',
  password: 'password123'
});

if (success) {
  // Пользователь вошел в систему
  // Cookies установлены автоматически
}
```

### API запросы
```typescript
const { apiCall } = useApi();

// Cookies автоматически отправляются
const response = await apiCall('/api/protected/endpoint');
```

### Выход из системы
```typescript
const { logout } = useAuth();

await logout(); // Cookies очищаются автоматически
```

## 🧪 Тестирование

### 1. Тест cookies системы
```bash
# Откройте в браузере
test-cookies-browser.html
```

### 2. Тест AuthContext
```bash
# Откройте в браузере
test-auth-context.html
```

### 3. Node.js тест
```bash
node test-cookies-auth.js
```

## 🔄 Автоматическое обновление токенов

### Стратегия обновления
1. **Основной таймер** - каждые 14 минут
2. **Page Visibility API** - при активации неактивной вкладки
3. **Отслеживание активности** - mousemove, keypress, scroll, etc.
4. **API fallback** - при получении 401 ошибки

### Логика обновления
```typescript
// Проверяем каждые 5 минут
setInterval(() => {
  const timeSinceLastRefresh = Date.now() - lastActivityTime;
  if (timeSinceLastRefresh > 14 * 60 * 1000) {
    refreshToken();
  }
}, 5 * 60 * 1000);
```

## 🛡️ Безопасность

### HttpOnly Cookies
- Защита от XSS атак
- JavaScript не может получить доступ к токенам

### SameSite: Strict
- Защита от CSRF атак
- Cookies отправляются только при навигации на тот же сайт

### Secure Flag
- В продакшене cookies работают только по HTTPS
- Автоматическое переключение по NODE_ENV

## 📊 Мониторинг

### Логирование
- Все операции с токенами логируются
- Отслеживание ошибок аутентификации
- Мониторинг активности пользователей

### Метрики
- Количество успешных входов
- Частота обновления токенов
- Ошибки аутентификации

## 🚨 Обработка ошибок

### Сетевые ошибки
- Не вызываем forceLogout при сетевых проблемах
- Повторные попытки при временных сбоях

### Истекшие токены
- Автоматический выход при 401
- Очистка состояния пользователя

### Неактивность
- Проверка lastActivityAt на сервере
- Блокировка при длительной неактивности

## 🔮 Будущие улучшения

### 1. Refresh Token Rotation
- Генерация нового refresh token при каждом обновлении
- Отзыв старых refresh токенов

### 2. Device Management
- Отслеживание устройств пользователя
- Возможность отзыва токенов для конкретного устройства

### 3. Rate Limiting
- Ограничение частоты обновления токенов
- Защита от злоупотреблений

### 4. Analytics
- Детальная статистика использования
- Анализ паттернов активности

## 📝 Заключение

Переход на cookies полностью решает проблему `Failed to fetch` и обеспечивает:

- ✅ **Надежность** - токены работают стабильно
- ✅ **Безопасность** - защита от XSS и CSRF
- ✅ **Удобство** - автоматическая отправка с запросами
- ✅ **Производительность** - нет проблем с setInterval
- ✅ **Масштабируемость** - готовность к продакшену

Система готова к использованию в production среде! 🎉
