# План фільтрації нотифікацій по ролях користувачів

## 🔍 Поточна ситуація

### Проблеми
1. **Всі користувачі бачать всі системні помилки та попередження**
   - Нотифікації з `meta_logs` (error/warning) відображаються всім користувачам системи
   - Немає можливості надсилати цільові повідомлення конкретним ролям чи відділам

2. **Відсутність сегментації повідомлень**
   - Адмін отримує повідомлення про проблеми на складі, які його не стосуються
   - Складський працівник бачить повідомлення про проблеми з експортом, які він не може вирішити
   - Відсутня можливість пріоритизації повідомлень по ролях

3. **Потенційні ризики**
   - Інформаційне перевантаження користувачів
   - Зниження ефективності реакції на критичні проблеми
   - Можливість ігнорування важливих повідомлень через "шум"

---

## 📋 План реалізації

### **ФАЗА 1: Розширення моделі даних** (0.5 дня)

#### 1.1 Додати поле `targetRoles` до моделі `meta_logs`
```typescript
// prisma/schema.prisma
model meta_logs {
  // ... існуючі поля ...
  targetRoles String?  @db.VarChar(255)  // JSON array: ["admin", "storekeeper"] або null для всіх
}
```

**Міграція**: `prisma/migrations/YYYYMMDD_add_target_roles_to_meta_logs`

#### 1.2 Оновити типи
```typescript
// shared/types/notifications.ts
export interface AppNotification {
  // ... існуючі поля ...
  targetRoles?: string[];  // масив ролей, які мають бачити цю нотифікацію
}
```

### **ФАЗА 2: Серверна логіка фільтрації** (1 день)

#### 2.1 Оновити API `/api/notifications`
```typescript
// server/routes/notifications.ts
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  // ... існуючий код ...

  const userRoles = getUserRoles(req.user!.userId); // отримати ролі користувача

  const logs = await prisma.meta_logs.findMany({
    where: {
      status: { in: statusFilter },
      OR: [
        { targetRoles: null },  // повідомлення для всіх
        { targetRoles: { not: null } }  // повідомлення з targetRoles (фільтруємо нижче)
      ]
    },
    // ... решта конфігурації
  });

  // Фільтрація по ролях на рівні додатку
  const roleFilteredLogs = logs.filter(log => {
    if (!log.targetRoles) return true; // для всіх
    const targetRoles = JSON.parse(log.targetRoles);
    return targetRoles.some((role: string) => userRoles.includes(role));
  });

  // ... решта логіки з roleFilteredLogs
});
```

#### 2.2 Допоміжні функції
```typescript
// server/routes/notifications.ts
function getUserRoles(userId: number): string[] {
  // Отримати ролі користувача з БД або кешу
  // Використовувати існуючу логіку з shared/constants/roles.ts
}

function parseTargetRoles(raw: string | null): string[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
```

### **ФАЗА 3: Клієнтська підтримка** (0.5 дня)

#### 3.1 Оновити компонент створення логів
```typescript
// server/services/LoggingService.ts або інше місце створення логів
export interface LogOptions {
  // ... існуючі опції ...
  targetRoles?: string[];  // нові ролі для фільтрації
}

export function logError(message: string, options: LogOptions = {}) {
  const { targetRoles, ...otherOptions } = options;

  await prisma.meta_logs.create({
    data: {
      // ... існуючі поля ...
      targetRoles: targetRoles ? JSON.stringify(targetRoles) : null,
    }
  });
}
```

#### 3.2 Оновити відображення в NotificationBell
```typescript
// client/components/NotificationBell.tsx
function NotificationRow({ notification, ... }) {
  // Додати індикатор цільової аудиторії для адмінів
  const isAdmin = user?.role === 'admin';

  return (
    <div>
      {/* ... існуючий код ... */}
      {isAdmin && notification.targetRoles && (
        <Chip size="sm" variant="flat" color="secondary" className="h-4 text-[10px] px-1">
          {notification.targetRoles.join(', ')}
        </Chip>
      )}
    </div>
  );
}
```

### **ФАЗА 4: Міграція існуючих даних** (0.5 дня)

#### 4.1 Скрипт міграції
```typescript
// scripts/migrate-notification-target-roles.ts
// Встановити targetRoles = null для всіх існуючих записів
// (тобто вони будуть видимі всім, як і раніше)
```

### **ФАЗА 5: Тестування та документація** (1 день)

#### 5.1 Тестування
- Створити тестові нотифікації з різними `targetRoles`
- Перевірити фільтрацію для різних ролей користувачів
- Тестувати edge cases (порожні масиви, неіснуючі ролі)

#### 5.2 Оновити документацію
- `Docs/api/meta-logs-api.md` — додати інформацію про `targetRoles`
- `Docs/features/notifications.md` — новий файл з описом функціональності

---

## 🎯 Очікуваний результат

### Переваги
1. **Зменшення інформаційного шуму** — користувачі бачать тільки релевантні повідомлення
2. **Покращення реакції** — критичні проблеми доходять до відповідальних осіб
3. **Гнучкість** — можливість створювати цільові повідомлення для конкретних ролей

### Приклади використання
```typescript
// Повідомлення тільки для адміністраторів
logError('Помилка підключення до зовнішнього API', {
  targetRoles: ['admin']
});

// Повідомлення для складу та менеджерів
logWarning('Закінчуються товари на складі', {
  targetRoles: ['storekeeper', 'warehouse_manager']
});

// Повідомлення для всіх (за замовчуванням)
logError('Критична помилка системи'); // targetRoles: undefined
```

### Сумісність
- **Зворотна сумісність**: існуючі логи без `targetRoles` будуть видимі всім
- **Опціональність**: поле `targetRoles` необов'язкове
- **Гнучкість**: можна комбінувати ролі як потрібно

---

## 📅 Оцінка часу: 3-4 дні

## 🔗 Зв'язані файли
- `prisma/schema.prisma` — модель `meta_logs`
- `server/routes/notifications.ts` — API логіка
- `shared/types/notifications.ts` — типи
- `client/components/NotificationBell.tsx` — відображення
- `server/services/LoggingService.ts` — створення логів</content>
<parameter name="filePath">d:\Projects\nk-food.shop\nova-field\Docs\plans\notification-role-filtering.md