# Система токенов авторизации

## Обзор

Система была переработана для улучшения пользовательского опыта и безопасности. Теперь используется двухуровневая система токенов:

- **Access Token** - короткоживущий токен (15 минут) для доступа к API
- **Refresh Token** - долгоживущий токен (7 дней) для обновления access токенов

## Основные принципы

### 1. Автоматическое обновление токенов
- Access токен автоматически обновляется каждые 14 минут (за 1 минуту до истечения)
- Пользователь остается в системе, пока активен (не более недели бездействия)

### 2. Отслеживание активности пользователя
- `lastLoginAt` - время последнего входа в систему
- `lastActivityAt` - время последней активности (обновляется при каждом API запросе)
- `isActive` - статус активности пользователя

### 3. Блокировка неактивных пользователей
- Если пользователь неактивен более 7 дней, он автоматически блокируется
- При попытке обновления токена проверяется активность

## Конфигурация

### Переменные окружения
```env
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=15m        # Access token lifetime
JWT_REFRESH_EXPIRES_IN=7d # Refresh token lifetime
```

### Время жизни токенов
- **Access Token**: 15 минут
- **Refresh Token**: 7 дней
- **Проверка активности**: каждые 14 минут

## API Endpoints

### Аутентификация
- `POST /api/auth/login` - вход в систему
- `POST /api/auth/register` - регистрация
- `POST /api/auth/refresh` - обновление токена
- `POST /api/auth/logout` - выход из системы

### Защищенные маршруты
- `GET /api/auth/profile` - профиль пользователя
- `PUT /api/auth/profile` - обновление профиля

## Безопасность

### Хеширование refresh токенов
- Refresh токены хешируются с помощью SHA-256 перед сохранением в БД
- В базе хранятся только хеши, не сами токены

### Валидация токенов
- Каждый API запрос проверяет валидность access токена
- При истечении access токена автоматически используется refresh token
- Недействительные токены немедленно удаляются

### Защита от перехвата
- Refresh токены имеют ограниченное время жизни
- При выходе из системы все refresh токены пользователя удаляются

## Клиентская часть

### Автоматическое обновление
```typescript
// Токен обновляется автоматически каждые 14 минут
useEffect(() => {
  if (!token) return;
  
  const interval = setInterval(() => {
    refreshToken();
  }, 14 * 60 * 1000);
  
  return () => clearInterval(interval);
}, [token, refreshToken]);
```

### Обработка ошибок 401
```typescript
// При ошибке 401 автоматически пытаемся обновить токен
if (response.status === 401) {
  const refreshed = await refreshToken();
  if (refreshed) {
    // Повторяем запрос с новым токеном
    return retryRequest();
  } else {
    // Выходим из системы
    logout();
  }
}
```

## База данных

### Новая таблица RefreshToken
```sql
CREATE TABLE refresh_tokens (
  id VARCHAR(191) NOT NULL,
  token VARCHAR(191) NOT NULL UNIQUE,
  userId INTEGER NOT NULL,
  expiresAt DATETIME(3) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  
  PRIMARY KEY (id),
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
  INDEX (userId),
  INDEX (expiresAt)
);
```

### Обновленная таблица User
```sql
ALTER TABLE User ADD COLUMN isActive BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE User ADD COLUMN lastActivityAt DATETIME(3) NULL;
ALTER TABLE User ADD COLUMN lastLoginAt DATETIME(3) NULL;
```

## Миграция

Для применения изменений выполните:
```bash
npx prisma migrate dev --name add_user_activity_tracking
npx prisma generate
```

## Тестирование

### Проверка автоматического обновления
1. Войдите в систему
2. Подождите 15 минут (или измените время в переменных окружения)
3. Выполните любой API запрос
4. Токен должен автоматически обновиться

### Проверка блокировки неактивных пользователей
1. Создайте тестового пользователя
2. Измените `lastActivityAt` на дату более недели назад
3. Попробуйте обновить токен
4. Пользователь должен быть заблокирован

## Логирование

Все операции с токенами логируются:
- Создание новых токенов
- Обновление токенов
- Блокировка пользователей
- Ошибки аутентификации

## Мониторинг

Рекомендуется мониторить:
- Количество активных refresh токенов
- Время жизни токенов
- Количество заблокированных пользователей
- Ошибки аутентификации
