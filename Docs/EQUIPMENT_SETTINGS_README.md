# Система налаштувань обладнання

## Огляд

Система налаштувань обладнання дозволяє зберігати та керувати всіма параметрами обладнання (ваги, сканер, WebSocket) в базі даних MySQL через таблицю `settings_base`.

## Структура бази даних

### Таблиця `settings_base`

```sql
CREATE TABLE settings_base (
  id INT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(255) UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  category VARCHAR(100), -- 'equipment', 'system', etc.
  isActive BOOLEAN DEFAULT TRUE,
  createdAt TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);

-- Індекси
CREATE INDEX idx_category ON settings_base(category);
CREATE INDEX idx_isActive ON settings_base(isActive);
```

### Структура ключів налаштувань

Всі налаштування обладнання зберігаються з префіксом `equipment_`:

- `equipment_connectionType` - тип підключення (local/websocket/simulation)
- `equipment_scale.comPort` - COM-порт ваг
- `equipment_scale.baudRate` - швидкість передачі даних
- `equipment_scale.dataBits` - біти даних
- `equipment_scale.stopBits` - стоп-біти
- `equipment_scale.parity` - парність
- `equipment_scanner.autoConnect` - автоматичне підключення сканера
- `equipment_scanner.timeout` - таймаут сканера
- `equipment_websocket.url` - URL WebSocket сервера
- `equipment_websocket.autoReconnect` - автоматичне перепідключення
- `equipment_websocket.reconnectInterval` - інтервал перепідключення
- `equipment_websocket.maxReconnectAttempts` - максимальна кількість спроб
- `equipment_websocket.heartbeatInterval` - інтервал heartbeat
- `equipment_simulation.enabled` - режим симуляції
- `equipment_simulation.weightRange.min` - мінімальна вага
- `equipment_simulation.weightRange.max` - максимальна вага
- `equipment_simulation.scanDelay` - затримка сканування
- `equipment_simulation.weightDelay` - затримка ваги

## API Endpoints

### GET `/api/settings/equipment`
Отримання всіх налаштувань обладнання

**Response:**
```json
{
  "success": true,
  "data": {
    "connectionType": "simulation",
    "scale": { ... },
    "scanner": { ... },
    "websocket": { ... },
    "simulation": { ... }
  }
}
```

### POST `/api/settings/equipment`
Збереження налаштувань обладнання

**Request Body:**
```json
{
  "connectionType": "websocket",
  "scale": { ... },
  "scanner": { ... },
  "websocket": { ... },
  "simulation": { ... }
}
```

### PATCH `/api/settings/equipment/:key`
Оновлення конкретної настройки

**Request Body:**
```json
{
  "value": "COM5"
}
```

### POST `/api/settings/equipment/reset`
Скидання налаштувань до значень за замовчуванням

### GET `/api/settings/equipment/history?limit=50`
Отримання історії змін налаштувань

## Сервіс EquipmentSettingsService

### Основні методи

```typescript
class EquipmentSettingsService {
  // Отримання налаштувань
  async getEquipmentSettings(): Promise<EquipmentSettings>
  
  // Збереження налаштувань
  async saveEquipmentSettings(settings: EquipmentSettings): Promise<void>
  
  // Оновлення конкретної настройки
  async updateEquipmentSetting(key: string, value: any): Promise<void>
  
  // Скидання до значень за замовчуванням
  async resetEquipmentSettings(): Promise<EquipmentSettings>
  
  // Історія змін
  async getSettingsHistory(limit: number): Promise<any[]>
}
```

### Значення за замовчуванням

```typescript
const defaultSettings: EquipmentSettings = {
  connectionType: 'local',
  scale: {
    comPort: 'COM4',
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none'
  },
  scanner: {
    autoConnect: true,
    timeout: 5000
  },
  websocket: {
    url: 'ws://localhost:8080/equipment',
    autoReconnect: true,
    reconnectInterval: 5000,
    maxReconnectAttempts: 10,
    heartbeatInterval: 30000
  },
  simulation: {
    enabled: true,
    weightRange: { min: 0.1, max: 5.0 },
    scanDelay: 800,
    weightDelay: 1200
  }
};
```

## Використання в React компоненті

### Хук useEquipment

```typescript
const [state, actions] = useEquipment();

// Завантаження налаштувань
await actions.loadConfig();

// Збереження налаштувань
await actions.saveConfig(newConfig);

// Скидання налаштувань
await actions.resetConfig();
```

### Компонент SettingsEquipment

```typescript
export const SettingsEquipment = () => {
  const [state, actions] = useEquipment();
  const [localConfig, setLocalConfig] = useState<EquipmentConfig | null>(null);

  // Ініціалізація при завантаженні
  useEffect(() => {
    if (state.config && !localConfig) {
      setLocalConfig(state.config);
    }
  }, [state.config, localConfig]);

  // Збереження налаштувань
  const applyConfig = async () => {
    if (!localConfig) return;
    try {
      await actions.saveConfig(localConfig);
      alert('Налаштування збережено успішно!');
    } catch (error) {
      alert('Помилка збереження налаштувань!');
    }
  };

  // ... рендер форми
};
```

## Переваги нової системи

1. **Централізоване зберігання** - всі налаштування в одній таблиці
2. **Історія змін** - відстеження всіх змін налаштувань
3. **Категорізація** - можливість групування налаштувань по категоріях
4. **Версіонування** - збереження попередніх версій налаштувань
5. **API інтеграція** - REST API для керування налаштуваннями
6. **Типізація** - повна TypeScript підтримка
7. **Валідація** - автоматична валідація даних
8. **Резервне копіювання** - можливість відновлення налаштувань

## Міграція

Для оновлення схеми БД виконайте:

```bash
npx prisma migrate dev --name add_equipment_settings
```

## Тестування

Для тестування сервісу налаштувань:

```bash
npx ts-node server/test-equipment-settings.ts
```

## Майбутні покращення

1. **Веб-інтерфейс адміністратора** для керування налаштуваннями
2. **Експорт/імпорт** налаштувань
3. **Шаблони налаштувань** для різних типів обладнання
4. **Автоматичне резервне копіювання** налаштувань
5. **Сповіщення** про зміни критичних налаштувань
6. **Аудит** доступу до налаштувань
