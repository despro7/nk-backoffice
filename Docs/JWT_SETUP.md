# JWT Авторизация - Инструкция по настройке

## Что уже настроено

✅ Установлены необходимые пакеты (jsonwebtoken, bcryptjs)
✅ Создан сервер с JWT middleware
✅ Созданы роуты для авторизации (/api/auth/login, /api/auth/register)
✅ Созданы защищенные роуты (/api/protected/data, /api/protected/admin)
✅ Создан React контекст для управления авторизацией
✅ Созданы компоненты для входа и регистрации
✅ Добавлена защита роутов на клиенте
✅ Создана тестовая страница для проверки JWT

## Что нужно сделать от вас

### 1. Создать файл .env

Создайте файл `.env` в корне проекта со следующим содержимым:

```env
JWT_SECRET=your_super_secret_key_here_change_this_in_production
JWT_EXPIRES_IN=24h
PORT=3001
```

**ВАЖНО**: Замените `your_super_secret_key_here_change_this_in_production` на реальный секретный ключ!

### 2. Запустить сервер

```bash
npm run dev
```

## Как использовать

### Тестовые данные

В системе уже есть пользователь-админ:
- **Email**: `admin@example.com`
- **Пароль**: `admin123`
- **Роль**: `admin`

## Создание новых пользователей и паролей

### Создание хеша для нового пароля

Если хотите изменить пароль админа или создать хеш для другого пароля:

1. **Создайте файл** `create-hash.js` в корне проекта:

```javascript
import bcrypt from 'bcryptjs';

const password = 'ваш_новый_пароль';
const hash = bcrypt.hashSync(password, 10);

console.log('Password:', password);
console.log('Hash:', hash);
```

2. **Запустите скрипт**:
```bash
node create-hash.js
```

3. **Скопируйте полученный хеш** в `server/services/authService.ts`

### Добавление нового пользователя вручную

Чтобы добавить нового пользователя без регистрации:

1. **Откройте файл** `server/services/authService.ts`
2. **Найдите массив** `users`
3. **Добавьте нового пользователя**:

```typescript
const users: User[] = [
  {
    id: '1',
    email: 'admin@example.com',
    password: '$2a$10$rQZ9K8mN2pL1vX3yB6cD7eF8gH9iJ0kL1mN2oP3qR4sT5uV6wX7yZ8',
    role: 'admin',
    createdAt: new Date()
  },
  // Новый пользователь
  {
    id: '2',
    email: 'manager@example.com',
    password: '$2a$10$новый_хеш_пароля',
    role: 'user',
    createdAt: new Date()
  }
];
```

### Пример создания хеша для пароля "manager123"

```bash
node -e "import bcrypt from 'bcryptjs'; console.log(bcrypt.hashSync('manager123', 10))"
```

## Авторизация

1. **Регистрация**: POST `/api/auth/register`
   ```json
   {
     "email": "user@example.com",
     "password": "password123",
     "role": "user"
   }
   ```

2. **Вход**: POST `/api/auth/login`
   ```json
   {
     "email": "user@example.com",
     "password": "password123"
   }
   ```

3. **Профиль**: GET `/api/auth/profile` (требует токен)

### Защищенные роуты

1. **Общие данные**: GET `/api/protected/data` (требует авторизации)
2. **Админ данные**: GET `/api/protected/admin` (требует роль admin)

### Тестирование

После авторизации перейдите на страницу `/test-auth` для проверки работы JWT токенов.

## Структура файлов

```
server/
├── middleware/
│   └── auth.ts          # JWT middleware
├── routes/
│   ├── auth.ts          # Роуты авторизации
│   └── protected.ts     # Защищенные роуты
├── services/
│   └── authService.ts   # Сервис авторизации
├── types/
│   └── auth.ts          # Типы TypeScript
└── index.ts             # Основной сервер

client/
├── components/
│   ├── LoginForm.tsx    # Форма входа
│   ├── RegisterForm.tsx # Форма регистрации
│   ├── ProtectedRoute.tsx # Защита роутов
│   └── Header.tsx       # Обновленный хедер
├── contexts/
│   └── AuthContext.tsx  # Контекст авторизации
├── hooks/
│   └── useApi.ts        # Хук для API с токеном
└── pages/
    ├── Auth.tsx         # Страница авторизации
    └── TestAuth.tsx     # Тестовая страница
```

## Безопасность

- Пароли хешируются с помощью bcrypt
- JWT токены имеют время жизни (по умолчанию 24 часа)
- Все защищенные роуты проверяют токен
- Роли проверяются на сервере и клиенте

## Следующие шаги

1. Замените in-memory хранилище на реальную базу данных
2. Добавьте refresh токены
3. Добавьте валидацию email и паролей
4. Добавьте rate limiting для роутов авторизации
5. Добавьте логирование попыток входа

## Устранение неполадок

### Ошибка "JWT_SECRET is not defined"
- Убедитесь, что файл `.env` создан в корне проекта
- Проверьте, что переменная `JWT_SECRET` установлена

### Ошибка "Invalid credentials"
- Проверьте правильность email и пароля
- Для админа используйте: `admin@example.com` / `admin123`
- Убедитесь, что хеш пароля в `authService.ts` соответствует реальному паролю

### Ошибка "Access token required"
- Убедитесь, что вы авторизованы
- Проверьте, что токен не истек
- Проверьте заголовок `Authorization: Bearer <token>`

### Проблемы с хешем пароля
- Используйте скрипт `create-hash.js` для генерации нового хеша
- Убедитесь, что bcrypt установлен: `npm install bcryptjs`
- Проверьте, что хеш скопирован полностью, без лишних символов
