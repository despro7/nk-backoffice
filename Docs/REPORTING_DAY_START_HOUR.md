# Налаштування години звітного дня - Документація

## 📋 Огляд

Цей документ описує реалізацію функції налаштування години початку звітного дня для системи звітів. Це дозволяє гнучко конфігурувати період звітування замість фіксованої опівночі (00:00).

## 🎯 Мета

Дозволити користувачам встановлювати довільну годину як початок звітного дня, наприклад:
- Замість стандартної 00:00 (полунічь)
- Встановити 16:00 для індивідуальних звітних періодів

## 📝 Приклад використання

Якщо встановлено `dayStartHour = 16`:

```
Звітний день 18 жовтня включає замовлення з 17.10 16:00:01 до 18.10 16:00:00
├─ Замовлення о 18.10 16:00:00 → потрапляє в звіт за 18.10 ✅
├─ Замовлення о 18.10 15:59:59 → потрапляє в звіт за 17.10 ✅
└─ Замовлення о 18.10 16:00:01 → потрапляє в звіт за 19.10 ✅
```

## 🛠️ Технічна реалізація

### 1. База даних
**Таблиця:** `settings_base`
**Ключ:** `reporting_day_start_hour`
**Значення:** `0-23` (година, за замовчуванням `0`)

```sql
-- Приклад запису:
INSERT INTO settings_base (key, value, description, category, isActive)
VALUES (
  'reporting_day_start_hour',
  '16',
  'Start hour for reporting day (0-23, 0 = midnight)',
  'reporting',
  1
)
```

### 2. Backend (Node.js + Express)

#### API Ендпоінти

**GET `/api/settings/reporting-day-start-hour`**
- Отримати поточне значення
- Авторизація: ✅ Обов'язкова

Відповідь:
```json
{
  "dayStartHour": 16
}
```

**PUT `/api/settings/reporting-day-start-hour`**
- Оновити значення
- Авторизація: ✅ Обов'язкова

Запит:
```json
{
  "dayStartHour": 16
}
```

Відповідь:
```json
{
  "success": true,
  "message": "Reporting day start hour updated successfully",
  "dayStartHour": 16
}
```

#### Utility Функції (`server/lib/utils.ts`)

**`getReportingDayStartHour(): Promise<number>`**
- Отримує час початку звітного дня з налаштувань
- За замовчуванням повертає 0 (полунічь)

**`getReportingDate(orderDate: Date, dayStartHour: number = 0): string`**
- Розраховує звітну дату для замовлення
- Повертає дату у форматі `YYYY-MM-DD`
- Якщо час замовлення >= `dayStartHour`, замовлення належить наступному дню

```typescript
const reportingDate = getReportingDate(new Date('2024-10-18T15:30:00'), 16);
// Результат: '2024-10-18' (оскільки 15:30 < 16:00)

const reportingDate2 = getReportingDate(new Date('2024-10-18T16:30:00'), 16);
// Результат: '2024-10-19' (оскільки 16:30 >= 16:00)
```

**`getReportingDateRange(reportingDate: string, dayStartHour: number = 0): {start: Date; end: Date}`**
- Розраховує діапазон дат для фільтру звітів
- Повертає об'єкт з початком та кінцем звітного дня

```typescript
const range = getReportingDateRange('2024-10-18', 16);
// range.start = 2024-10-18T16:00:00
// range.end = 2024-10-19T15:59:59.999
```

#### Модифіковані Ендпоінти

Наступні ендпоінти були оновлені для використання `dayStartHour`:

1. **GET `/api/orders/products/stats`** - Статистика по товарам
2. **GET `/api/orders/products/stats/dates`** - Статистика з розбивкою по датах
3. **GET `/api/orders/products/chart`** - Дані для графіку
4. **GET `/api/orders/sales/report`** - Звіт про продажі

Все змінюється однозначно: замість прямого розрахунку дат використовуються `getReportingDate()` і `getReportingDateRange()`.

### 3. Frontend (React + TypeScript)

#### Компонент `ReportingDayStartHourSettings`

Розташування: `client/components/ReportingDayStartHourSettings.tsx`

**Функціональність:**
- 📊 Завантаження поточного значення при монтуванні
- 🎛️ Вибір години (0-23) через Select компонент
- 💾 Збереження нових налаштувань на сервер
- ⚠️ Попередження про вплив на звіти
- ✅ Повідомлення про успіх/помилку

**Props:**
```typescript
interface ReportingDayStartHourSettingsProps {
  onClose?: () => void;
}
```

**Використання:**
```tsx
import { ReportingDayStartHourSettings } from '@/components/ReportingDayStartHourSettings';

export const MyComponent = () => {
  return <ReportingDayStartHourSettings />;
};
```

#### Інтеграція в адмін-панель

Компонент інтегрований в `client/pages/SettingsAdmin.tsx`:

```tsx
<section>
  <h2 className="text-2xl font-semibold mb-2">Налаштування звітів</h2>
  <p className="text-sm text-gray-600 mb-4">
    Керування параметрами розрахунку звітів та статистики
  </p>
  <ReportingDayStartHourSettings />
</section>
```

## 🔄 Логіка розрахунку

### Основний алгоритм

```typescript
function getReportingDate(orderDate: Date, dayStartHour: number): string {
  const date = new Date(orderDate);
  
  // Якщо час замовлення >= часу початку звітного дня,
  // то замовлення належить наступному дню
  if (date.getHours() >= dayStartHour) {
    date.setDate(date.getDate() + 1);
  }
  
  // Повертаємо дату у форматі YYYY-MM-DD
  return formatDate(date);
}
```

### Приклади розрахунків

| Час замовлення | dayStartHour | Звітна дата | Пояснення |
|---|---|---|---|
| 2024-10-17 15:30:00 | 16 | 2024-10-17 | 15:30 < 16:00 → той же день |
| 2024-10-17 16:00:00 | 16 | 2024-10-18 | 16:00 ≥ 16:00 → наступний день |
| 2024-10-17 16:00:01 | 16 | 2024-10-18 | 16:00 ≥ 16:00 → наступний день |
| 2024-10-17 23:59:59 | 16 | 2024-10-18 | 23:59 ≥ 16:00 → наступний день |
| 2024-10-18 15:30:00 | 16 | 2024-10-18 | 15:30 < 16:00 → той же день |
| 2024-10-18 16:00:00 | 16 | 2024-10-19 | 16:00 ≥ 16:00 → наступний день |

## 🔐 Безпека

- ✅ Всі ендпоінти налаштування захищені авторизацією
- ✅ Валідація значення (0-23)
- ✅ Тільки адміністратори можуть змінювати налаштування
- ✅ Логування всіх змін налаштувань

## 📚 Сумісність

- ✅ **Зворотна сумісність:** При відсутності налаштувань система використовує значення за замовчуванням (0 = полунічь)
- ✅ **Існуючі дані:** Усі історичні звіти не змінюються автоматично
- ✅ **Динамічна обробка:** Звіти пересраховуються на основі поточного налаштування

## ⚡ Кеш

- 📊 Статистика кешується на 5 хвилин
- 🔄 При зміні `dayStartHour` кеш автоматично інвалідується для наступного запиту
- 💡 Підтримується параметр `sync=true` для силування пересраховування

## 🧪 Тестування

### Ручне тестування API

```bash
# Отримати поточне значення
curl -X GET http://localhost:8080/api/settings/reporting-day-start-hour \
  -H "Authorization: Bearer YOUR_TOKEN"

# Встановити нове значення
curl -X PUT http://localhost:8080/api/settings/reporting-day-start-hour \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"dayStartHour": 16}'
```

### Тестові сценарії

1. **Базовий сценарій:**
   - Встановити dayStartHour = 16
   - Перевірити, що замовлення розподіляються правильно
   - Проверить, что статистика обновляется

2. **Граничные значения:**
   - dayStartHour = 0 (полунічь) - стандартне значення
   - dayStartHour = 23 - найпізніше значення
   - Спробувати встановити 24 - має бути помилка

3. **Форматування дат:**
   - Перевірити, що графіки відображають правильні дати
   - Перевірити, що таблиці звітів групують дані правильно

## 📝 Примітки для розробників

### При додаванні нових звітних ендпоінтів:

1. Завантажте `dayStartHour` на початку функції:
```typescript
const dayStartHour = await getReportingDayStartHour();
```

2. Використовуйте `getReportingDate()` при розрахунку дат замовлень:
```typescript
const dateKey = getReportingDate(new Date(order.orderDate), dayStartHour);
```

3. Використовуйте `getReportingDateRange()` при фільтруванні за датами:
```typescript
const startRange = getReportingDateRange(startDate as string, dayStartHour);
const endRange = getReportingDateRange(endDate as string, dayStartHour);
```

### Конвенції кодування:

- Всі звітні дати у форматі `YYYY-MM-DD`
- `dayStartHour` завжди 0-23 (число)
- Функції роботи з датами знаходяться у `server/lib/utils.ts`

## 📖 Посилання

- **ТЗ:** `Налаштування години початку звітного дня`
- **API документація:** Див. `/api/settings/reporting-day-start-hour`
- **Компоненти:** `ReportingDayStartHourSettings.tsx`
- **Утіліти:** `server/lib/utils.ts`

## 🚀 Розгортання

1. Запустити міграцію БД (якщо необхідно)
2. Перезавантажити сервер
3. Оновити фронтенд
4. Перевірити налаштування через адмін-панель

## 📞 Підтримка

При виникненні проблем:
1. Перевірити консоль браузера на помилки
2. Перевірити логи сервера
3. Перевірити, що БД містить запис `reporting_day_start_hour`
4. Перезавантажити сторінку адмін-панелі
