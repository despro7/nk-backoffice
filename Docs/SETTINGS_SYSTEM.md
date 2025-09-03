# Система настроек NK Backoffice

## Обзор

Система настроек позволяет гибко управлять различными параметрами приложения через базу данных. Реализована по принципу `wp_options` - каждая настройка хранится в отдельной строке с уникальным ключом.

## Структура базы данных

### Таблица `settings_base`

```sql
CREATE TABLE "settings_base" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL UNIQUE,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL
);
```

**Поля:**
- `id` - уникальный идентификатор
- `key` - уникальный ключ настройки (например: `weight_tolerance_percentage`)
- `value` - значение настройки в текстовом формате
- `description` - описание назначения настройки
- `created_at` - дата создания
- `updated_at` - дата последнего обновления

## Предустановленные настройки

### Настройки погрешности веса

1. **`weight_tolerance_type`** - тип погрешности веса
   - Значение по умолчанию: `combined`
   - Описание: `Тип погрешности веса (combined/percentage/absolute)`
   - Возможные значения:
     - `combined` - комбинированная (процентная + абсолютная)
     - `percentage` - только процентная
     - `absolute` - только абсолютная

2. **`weight_tolerance_percentage`** - допустимая погрешность веса в процентах
   - Значение по умолчанию: `5`
   - Описание: `Допустимая погрешность веса в процентах`

3. **`weight_tolerance_absolute`** - абсолютная погрешность веса в граммах
   - Значение по умолчанию: `20`
   - Описание: `Допустимая погрешность веса в граммах`

## API Endpoints

### Базовые операции с настройками

- `GET /api/settings` - получить все настройки
- `GET /api/settings/:key` - получить настройку по ключу
- `POST /api/settings` - создать новую настройку
- `PUT /api/settings/:key` - обновить настройку по ключу
- `DELETE /api/settings/:key` - удалить настройку по ключу

### Специализированные endpoints

- `GET /api/settings/weight-tolerance/values` - получить настройки погрешности веса
- `PUT /api/settings/weight-tolerance/values` - обновить настройки погрешности веса

## Использование в коде

### Сервис настроек

```typescript
import { SettingsService } from '../services/settingsService';

const settingsService = new SettingsService();

// Получить значение настройки
const tolerance = await settingsService.getSettingValue('weight_tolerance_percentage');

// Обновить настройку
await settingsService.updateSettingByKey('weight_tolerance_percentage', {
  value: '10',
  description: 'Новая погрешность'
});
```

### Получение настроек погрешности веса

```typescript
// Получить все настройки погрешности
const toleranceSettings = await settingsService.getWeightToleranceSettings();
// Результат: { percentage: 5, absolute: 0.1 }

// Обновить настройки погрешности
await settingsService.updateWeightToleranceSettings(10, 0.2);
```

## Интерфейс управления

### Страница настроек

Доступна по адресу: `/settings/order-assembly`

**Разделы:**
1. **Налаштування погрешності ваги** - управление настройками веса
2. **Налаштування коробок** - управление настройками коробок
3. **Загальні налаштування** - полное управление всеми настройками

### Возможности интерфейса

- Просмотр текущих значений
- Редактирование настроек
- Создание новых настроек
- Удаление настроек
- Поиск и фильтрация

## Добавление новых настроек

### 1. Через интерфейс

1. Перейти в раздел "Загальні налаштування"
2. Нажать "Додати"
3. Заполнить поля:
   - **Ключ**: уникальный идентификатор (например: `max_order_items`)
   - **Значення**: значение настройки
   - **Опис**: описание назначения

### 2. Программно

```typescript
await settingsService.createSetting({
  key: 'max_order_items',
  value: '50',
  description: 'Максимальное количество товаров в заказе'
});
```

### 3. Через миграцию

```sql
INSERT INTO "settings_base" ("key", "value", "description") VALUES
('new_setting_key', 'default_value', 'Описание новой настройки');
```

## Рекомендации по именованию

### Формат ключей

- Использовать snake_case
- Добавлять префикс категории: `weight_tolerance_`, `order_`, `system_`
- Делать ключи описательными: `max_order_items`, `default_currency`

### Примеры хороших ключей

- `weight_tolerance_percentage`
- `order_auto_assign`
- `system_maintenance_mode`
- `notification_email_enabled`

## Безопасность

- Все API endpoints защищены middleware авторизации
- Доступ к настройкам ограничен ролями пользователей
- Валидация входных данных на сервере
- Логирование всех изменений настроек

## Мониторинг и логирование

### Логирование изменений

Все изменения настроек логируются в базе данных:
- `created_at` - время создания
- `updated_at` - время последнего изменения

### Отслеживание изменений

Для критических настроек рекомендуется:
- Добавить уведомления об изменениях
- Вести журнал изменений
- Настроить резервное копирование

## Расширение функциональности

### Новые типы настроек

Для сложных настроек можно создать дополнительные таблицы:

```sql
-- Пример: настройки уведомлений
CREATE TABLE "settings_notifications" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSON,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Валидация значений

Добавить проверку типов и диапазонов значений:

```typescript
// Пример валидации
function validateWeightTolerance(percentage: number, absolute: number) {
  if (percentage < 0 || percentage > 100) {
    throw new Error('Процент должен быть от 0 до 100');
  }
  if (absolute < 0 || absolute > 10) {
    throw new Error('Абсолютная погрешность должна быть от 0 до 10 кг');
  }
}
```

## Troubleshooting

### Частые проблемы

1. **Настройка не сохраняется**
   - Проверить права доступа пользователя
   - Проверить валидность JSON в запросе
   - Проверить логи сервера

2. **Значение не обновляется**
   - Проверить уникальность ключа
   - Проверить формат данных
   - Проверить constraints в базе данных

3. **Ошибка доступа**
   - Проверить JWT токен
   - Проверить роль пользователя
   - Проверить middleware авторизации

### Отладка

```typescript
// Включить подробное логирование
console.log('Current settings:', await settingsService.getAllSettings());
console.log('Setting value:', await settingsService.getSettingValue('key'));
```

## Заключение

Система настроек предоставляет гибкий и масштабируемый способ управления параметрами приложения. Она позволяет:

- Централизованно управлять настройками
- Легко добавлять новые параметры
- Обеспечивать безопасность доступа
- Вести историю изменений
- Интегрироваться с существующей системой авторизации

Для дальнейшего развития рекомендуется:
- Добавить кэширование настроек
- Реализовать версионирование
- Добавить импорт/экспорт настроек
- Создать API для массовых операций
