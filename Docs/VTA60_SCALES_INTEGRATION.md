# Интеграция весов ВТА-60

Это документация по интеграции весов ВТА-60 в систему NK Backoffice, созданная на основе реализованного функционала.

## 📋 Обзор системы

### Архитектура интеграции весов
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   UI Components │◄──►│   AuthContext   │◄──►│  useEquipment   │
│                 │    │                 │    │      Hook       │
│ ScaleWeight     │    │ Global State    │    │                 │
│ Display         │    │ Management      │    │ State Logic     │
│ Settings        │    │                 │    │                 │
│ Equipment       │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                      ▲
                                                      │
                           ┌─────────────────────────────────────┐
                           ▼                                     ▼
                  ┌─────────────────┐                 ┌─────────────────┐
                  │  ScaleService   │                 │ EquipmentService│
                  │                 │                 │                 │
                  │ Web Serial API  │                 │  Base Service   │
                  │ VTA-60 Protocol │                 │  Simulation     │
                  │ Raw Data Parse  │                 │  Configuration  │
                  └─────────────────┘                 └─────────────────┘
```

## 🔧 Технические характеристики ВТА-60

### Протокол связи
- **Подключение**: USB (через CH340 конвертер USB-COM)
- **Скорость**: 4800 baud (по умолчанию)
- **Формат**: 8E1 (8 бит данных, Even parity, 1 стоп-бит)
- **Протокол**: Собственный протокол с 18-байтовыми кадрами

### Формат данных
```
┌───────────┬───────────┬───────────┐
│   Mass    │   Price   │   Total   │
│  (6 bytes)│  (6 bytes)│  (6 bytes)│
│ m1...m6   │ c1...c6   │ v1...v6   │
└───────────┴───────────┴───────────┘

Каждый байт содержит цифру (0x00-0x09)
Младшие разряды идут первыми
```

### Команда опроса
- **Запрос**: `00 00 03` (3 байта)
- **Ответ**: 18 байт цифровых данных
- **Таймаут**: 1.5 секунды

## 📁 Структура файлов

### Основные компоненты

#### `client/services/ScaleService.ts`
**Назначение**: Низкоуровневый сервис для работы с весами ВТА-60
**Ключевые функции**:
- `connect()` - подключение через Web Serial API
- `readScaleOnce()` - получение данных от весов
- `digits6ToNumber()` - парсинг 6-байтовых чисел
- `formatMassFromDigits()` - форматирование массы

```typescript
// Пример использования
const scaleService = new ScaleService();
const connected = await scaleService.connect();
if (connected) {
    const data = await scaleService.readScaleOnce(true);
    console.log(`Вес: ${data.weight} кг, Цена: ${data.price}, Сумма: ${data.total}`);
}
```

#### `client/hooks/useEquipment.ts`  
**Назначение**: React хук для управления состоянием оборудования
**Ключевые функции**:
- `connectScale()` - подключение весов
- `getWeight()` - получение текущего веса
- `loadConfig()` - загрузка конфигурации
- `saveConfig()` - сохранение настроек

#### `client/components/ScaleWeightDisplay.tsx`
**Назначение**: UI компонент отображения веса в реальном времени
**Особенности**:
- Парсинг сырых HEX данных
- Индикатор подключения
- Сравнение ожидаемого и фактического веса
- Кнопка ручного подключения

#### `client/pages/SettingsEquipment.tsx`
**Назначение**: Страница настроек оборудования
**Функционал**:
- Настройка параметров соединения
- Тестирование весов ВТА-60  
- Диагностика соединения
- Переключение режимов

## ⚙️ Конфигурация

### Настройки весов в базе данных
```typescript
interface ScaleConfig {
    baudRate: number;     // 4800, 9600, 19200
    dataBits: number;     // 7, 8
    stopBits: number;     // 1, 2  
    parity: string;       // 'none', 'even', 'odd'
    autoConnect: boolean; // Автоподключение
}
```

### Переменные окружения
```env
NODE_ENV=development  # Включает отладочные логи
```

## 🔄 Жизненный цикл подключения

### 1. Инициализация
```typescript
// В useEquipment hook
const scaleService = useRef(new ScaleService());

useEffect(() => {
    loadConfig(); // Загружаем настройки из БД
}, []);
```

### 2. Подключение
```typescript
const connectScale = async () => {
    // Проверяем режим симуляции
    if (config.connectionType === 'simulation') {
        return true;
    }
    
    // Подключаемся к реальным весам
    const result = await scaleService.current.connect();
    
    if (result) {
        // Устанавливаем callbacks
        scaleService.current.onWeightData((data) => {
            setCurrentWeight(data);
        });
    }
};
```

### 3. Получение данных
```typescript
const getWeight = async () => {
    // Кэширование (2 секунды)
    if (currentWeight && (Date.now() - currentWeight.timestamp.getTime()) < 2000) {
        return currentWeight;
    }
    
    // Запрос новых данных
    const weightData = await scaleService.current.getCurrentWeight();
    if (weightData) {
        setCurrentWeight(weightData);
        return weightData;
    }
};
```

## 🛠️ API Reference

### ScaleService

#### Methods

**`connect(autoConnect?: boolean): Promise<boolean>`**
- Подключение к весам через Web Serial API
- `autoConnect` - использовать сохраненный порт если доступен

**`readScaleOnce(usePolling?: boolean): Promise<VTAScaleData | null>`**
- Получение данных от весов
- `usePolling` - отправлять команду опроса (00 00 03)

**`disconnect(): Promise<void>`**
- Отключение от весов

**`getCurrentWeight(): Promise<VTAScaleData | null>`**  
- Получение текущего веса с отправкой команды

#### Interfaces

```typescript
interface VTAScaleData extends ScaleData {
    weight: number;      // Масса в кг
    unit: string;        // 'kg'
    isStable: boolean;   // Стабильность показаний
    timestamp: Date;     // Время измерения
    price?: number;      // Цена за кг
    total?: number;      // Общая сумма
    rawData?: Uint8Array; // Сырые данные (18 байт)
}
```

### useEquipment Hook

#### State
```typescript
interface EquipmentState {
    currentWeight: VTAScaleData | null;
    isScaleConnected: boolean;
    isSimulationMode: boolean;
    config: EquipmentConfig | null;
    // ... другие поля
}
```

#### Actions  
```typescript
interface EquipmentActions {
    connectScale(): Promise<boolean>;
    disconnectScale(): Promise<void>;
    getWeight(): Promise<VTAScaleData | null>;
    saveConfig(config: EquipmentConfig): Promise<void>;
    // ... другие методы
}
```

## 🧪 Тестирование

### Тест подключения ВТА-60
```typescript
// В SettingsEquipment.tsx
const handleVTA60Test = async () => {
    const scaleService = new ScaleService();
    const connected = await scaleService.connect();
    
    if (connected) {
        const scaleData = await scaleService.readScaleOnce(true);
        // Обработка результатов
    }
};
```

### Режим симуляции
```typescript
// Включение симуляции
const toggleSimulation = async (enabled: boolean) => {
    const updatedConfig = {
        ...localConfig,
        connectionType: enabled ? 'simulation' : 'local',
        simulation: { enabled }
    };
    
    await applyConfig(updatedConfig);
};
```

## 🐛 Отладка

### Логирование
Система использует подробное логирование с префиксами:
- `🔧 ScaleService:` - операции сервиса весов  
- `📊 ScaleWeightDisplay:` - компонент отображения
- `⚠️` - предупреждения
- `❌` - ошибки
- `✅` - успешные операции

### Отладочные данные
В development режиме отображаются:
- Сырые HEX данные от весов
- Распарсенные значения  
- Временные метки
- Состояние буфера

### Типичные проблемы

**Весы не подключаются**
1. Проверить поддержку Web Serial API (Chrome 89+)
2. Убедиться в правильном COM порте
3. Проверить настройки baud rate (4800 для ВТА-60)

**Неверные данные**  
1. Проверить формат протокола (18 байт цифробайтов)
2. Убедиться в настройке parity (Even для ВТА-60)  
3. Проверить таймауты

**Потеря соединения**
1. Проверить качество USB кабеля
2. Убедиться в стабильности драйвера CH340
3. Проверить настройки энергосбережения USB

## 📱 UI/UX особенности

### ScaleWeightDisplay компонент
- **Индикатор состояния**: Зеленый/красный для подключения
- **Кнопка подключения**: Появляется при отключении  
- **Сравнение весов**: Цветовая индикация отклонений
- **Отладочные данные**: Только в development режиме

### Цветовая схема отклонений
- **Зеленый**: Отклонение < 0.1 кг (точное совпадение)
- **Желтый**: Отклонение 0.1-0.5 кг (небольшое расхождение)  
- **Красный**: Отклонение > 0.5 кг (значительная разница)

## 🔄 Будущие улучшения

1. **Автоматическое переподключение** при потере связи
2. **Калибровка весов** через интерфейс
3. **История измерений** с графиками
4. **Поддержка других моделей весов**
5. **Экспорт данных** в различные форматы

## 📚 См. также

- [EQUIPMENT_INTEGRATION_README.md](./EQUIPMENT_INTEGRATION_README.md) - Общая интеграция оборудования
- [EQUIPMENT_INTEGRATION_SPECS.md](./EQUIPMENT_INTEGRATION_SPECS.md) - Технические спецификации
- [API документация Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)

---
*Документация обновлена: Сентябрь 2025*
*Версия системы весов: v2.1*
