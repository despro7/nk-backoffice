# Исправления системы аутентификации

## Проблемы которые были исправлены

### 1. 🔑 Неправильная генерация токенов при регистрации
**Проблема**: В `AuthService.register` токены генерировались с `userId=0`, что делало их невалидными сразу после создания.

**Исправление**: 
- Сначала создаем пользователя в БД с помощью `prisma.user.create()`
- Затем генерируем токены с реальным `user.id` 
- Обновляем пользователя с хешем refresh токена

```typescript
// ❌ БЫЛО (генерация токенов ДО создания пользователя):
const { accessToken, refreshToken } = await this.generateTokenPair({
  id: 0, // Временный ID!
  email: userData.email,
  // ...
});
const newUser = await prisma.user.create({ /* ... */ });

// ✅ СТАЛО (генерация токенов ПОСЛЕ создания пользователя):
const newUser = await prisma.user.create({ /* ... */ });
const { accessToken, refreshToken } = await this.generateTokenPair(newUser);
await prisma.user.update({
  where: { id: newUser.id },
  data: { refreshToken: this.hashToken(refreshToken) }
});
```

### 2. 🍪 Неправильные настройки cookies и CORS
**Проблема**: Неправильные настройки SameSite/Secure/CORS для кроссдоменных запросов.

**Исправления**:

#### A) Динамические настройки cookies:
```typescript
// Для cross-site обязательно SameSite=None и Secure=true (HTTPS)
// Для localhost в dev — Secure=false
const cookieOptions = {
  httpOnly: true,
  secure: isHTTPS,
  sameSite: isHTTPS ? 'none' as const : 'lax' as const,
  path: '/'
};
```

#### B) Правильная CORS конфигурация:
```typescript
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:3000',
  'http://localhost:3000',
  'http://localhost:5173', // Vite dev server
  'http://localhost:8080', // Дополнительный dev server
  'https://localhost:3000',
  'https://localhost:5173',
  'https://localhost:8080'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      console.log(`✅ CORS: Allowed origin ${origin || 'no-origin'}`);
      callback(null, true);
    } else {
      console.log(`🚫 CORS: Blocked origin ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Обязательно для cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  exposedHeaders: ['Set-Cookie']
}));
```

#### C) Исправление `clearAuthCookies`:
```typescript
static async clearAuthCookies(res: Response) {
  // Используем те же опции что и при установке
  const cookieOptions = {
    httpOnly: true,
    secure: isHTTPS,
    sameSite: isHTTPS ? 'none' as const : 'lax' as const,
    path: '/'
  };
  
  res.clearCookie('accessToken', cookieOptions);
  res.clearCookie('refreshToken', cookieOptions);
}
```

### 3. 🌐 Фронтенд: включение credentials для всех запросов
**Проблема**: Не все fetch запросы включали `credentials: 'include'`.

**Исправления**:
- `AuthContext.tsx` - ✅ уже был исправлен
- `useApi.ts` - ✅ уже был исправлен  
- `useWarehouse.ts` - ✅ уже был исправлен
- `SettingsManager.tsx` - ✅ уже был исправлен
- `WeightToleranceSettings.tsx` - ✅ уже был исправлен
- `useEquipment.ts` - 🔧 **ИСПРАВЛЕНО**: заменили Authorization header на credentials
- `SettingsProductSets.tsx` - 🔧 **ИСПРАВЛЕНО**: заменили все Authorization headers на credentials

```typescript
// ❌ БЫЛО:
const response = await fetch('/api/endpoint', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
  }
});

// ✅ СТАЛО:
const response = await fetch('/api/endpoint', {
  credentials: 'include'
});
```

### 4. 🔄 Проверка работы refresh эндпоинта
**Статус**: ✅ **УЖЕ ПРАВИЛЬНО**
- `/auth/refresh` НЕ использует middleware `authenticateToken`
- Правильно читает refresh токен из cookies
- Устанавливает новые cookies в ответе

## Переменные окружения

Для production добавьте в `.env`:
```bash
NODE_ENV=production
HTTPS=true  # если используете HTTPS
CLIENT_URL=https://yourdomain.com
```

Для development:
```bash
NODE_ENV=development
CLIENT_URL=http://localhost:3000
```

## Тестирование

Запустите тестовый скрипт для проверки всех исправлений:
```bash
npm run ts-node test-auth-fixes.ts
```

### 5. 🔄 Автоматическое обновление токенов в middleware
**Проблема**: Access token отсутствует, но есть валидный refresh token.

**Исправление**: Middleware теперь автоматически обновляет токены:
```typescript
// Если нет access token, но есть refresh token - пытаемся обновить
if (!accessToken && refreshToken) {
  try {
    const refreshResult = await AuthService.refreshToken({ refreshToken });
    await AuthService.setAuthCookies(res, refreshResult.token, refreshResult.refreshToken);
    // Продолжаем с новым токеном
    const decoded = jwt.verify(refreshResult.token, secret) as JwtPayload;
    req.user = decoded;
    return next();
  } catch (refreshError) {
    return res.status(401).json({ 
      message: 'Сесія закінчилася. Будь ласка, увійдіть знову.',
      code: 'REFRESH_FAILED'
    });
  }
}
```

### 6. 🔄 Умный редирект после авторизации
**Добавлено**: Автоматический редирект на последнюю посещенную страницу.

**Функциональность**:
- При переходе на `/auth` с авторизованным пользователем → редирект на последнюю страницу или главную
- При попытке доступа к защищенной странице без авторизации → сохранение пути и редирект на `/auth`
- После успешного логина → редирект на сохраненную страницу

Создан хук `useAuthRedirect`:
```typescript
export const useAuthRedirect = () => {
  // Сохраняет последнюю посещенную страницу (кроме /auth)
  // Автоматически редиректит с /auth если пользователь авторизован
  // Возвращает утилиты для управления редиректами
};
```

## Результат

После всех исправлений:
- ✅ Токены генерируются с правильным user.id при регистрации
- ✅ Cookies правильно передаются в кроссдоменных запросах  
- ✅ CORS настроен для работы с credentials (включая localhost:8080)
- ✅ Все фронтенд запросы используют credentials: 'include'
- ✅ Refresh токен работает корректно
- ✅ Автоматическое обновление токенов функционирует в middleware
- ✅ Умный редирект с сохранением последней посещенной страницы

Система аутентификации теперь работает стабильно как для localhost, так и для production cross-site конфигураций, с улучшенным UX благодаря умным редиректам.
