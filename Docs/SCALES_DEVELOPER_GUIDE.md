# Руководство разработчика по системе весов

Это практическое руководство для разработчиков, работающих с системой интеграции весов ВТА-60 в NK Backoffice.

## 🚀 Быстрый старт

### Клонирование и запуск
```bash
git clone <repository>
cd nova-field
npm install
npm run dev  # Запуск в development режиме
```

### Первый запуск системы весов
1. Откройте приложение в браузере (Chrome/Edge)
2. Перейдите в **Настройки → Оборудование**  
3. Включите **"Режим симуляции"** для первого тестирования
4. Нажмите **"Тестувати ВТА-60"** для проверки

## 📂 Структура кода

### Ключевые файлы для разработки
```
client/
├── services/
│   ├── ScaleService.ts           # 🔧 Основная логика весов
│   ├── EquipmentService.ts       # 🏭 Базовый сервис оборудования  
│   └── BarcodeScannerService.ts  # 📱 Сервис сканера
├── hooks/
│   └── useEquipment.ts           # ⚡ React хук управления состоянием
├── contexts/ 
│   └── AuthContext.tsx           # 🌍 Глобальное состояние
├── components/
│   └── ScaleWeightDisplay.tsx    # 📊 UI компонент веса
├── pages/
│   └── SettingsEquipment.tsx     # ⚙️ Страница настроек
└── types/
    └── boxes.ts                  # 📦 Типы для весов
```

### Серверная часть
```
server/
├── routes/
│   └── settings.ts               # 🛣️ API настроек оборудования
└── services/
    └── settingsService.ts        # 💾 Сохранение конфигурации
```

## 🏗️ Архитектурные паттерны

### 1. Service Layer Pattern
```typescript
// Каждый тип оборудования имеет свой сервис
class ScaleService {
    private port: SerialPort | null = null;
    private config: ScaleConnectionConfig;
    
    async connect(): Promise<boolean> { /* */ }
    async readScaleOnce(): Promise<VTAScaleData> { /* */ }
}

class BarcodeScannerService {
    private isConnected: boolean = false;
    
    async connect(): Promise<boolean> { /* */ }
    simulateScan(): BarcodeData { /* */ }
}
```

### 2. Hook-based State Management
```typescript
// Централизованное управление состоянием через хук
const useEquipment = (): [EquipmentState, EquipmentActions] => {
    const [currentWeight, setCurrentWeight] = useState<VTAScaleData | null>(null);
    const [isScaleConnected, setIsScaleConnected] = useState(false);
    
    const connectScale = useCallback(async () => { /* */ }, []);
    
    return [state, actions];
};
```

### 3. Context Provider Pattern  
```typescript
// Глобальное состояние через AuthContext
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [equipmentState, equipmentActions] = useEquipment();
    
    return (
        <AuthContext.Provider value={{ equipmentState, equipmentActions }}>
            {children}
        </AuthContext.Provider>
    );
};
```

## ⚡ Основные API

### ScaleService API

#### Подключение к весам
```typescript
const scaleService = new ScaleService();

// Автоматическое подключение (использует сохраненный порт)
const success = await scaleService.connect(true);

// Ручной выбор порта
const success = await scaleService.connect(false);
```

#### Получение данных
```typescript
// Разовое чтение с командой опроса
const data = await scaleService.readScaleOnce(true);
console.log({
    weight: data.weight,    // 1.234 кг  
    price: data.price,      // 45.60 грн/кг
    total: data.total,      // 56.32 грн
    rawData: data.rawData   // Uint8Array(18)
});

// Быстрое получение текущего веса  
const weight = await scaleService.getCurrentWeight();
```

#### Callbacks для реального времени
```typescript
// Подписка на изменения веса
scaleService.onWeightData((data: VTAScaleData) => {
    console.log(`Новый вес: ${data.weight} кг`);
});

// Подписка на сырые данные
scaleService.onRawDataReceived((rawData: Uint8Array) => {
    const hex = Array.from(rawData)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
    console.log(`Сырые данные: ${hex}`);
});
```

### useEquipment Hook API

#### Использование в компонентах
```typescript
const MyComponent = () => {
    const [equipmentState, equipmentActions] = useEquipment();
    
    // Проверка состояния
    if (equipmentState.isScaleConnected) {
        console.log('Весы подключены');
    }
    
    // Получение веса
    const handleGetWeight = async () => {
        const weight = await equipmentActions.getWeight();
        if (weight) {
            console.log(`Текущий вес: ${weight.weight} кг`);
        }
    };
    
    // Подключение весов
    const handleConnect = async () => {
        const success = await equipmentActions.connectScale();
        console.log(success ? 'Подключено' : 'Ошибка подключения');
    };
};
```

#### Конфигурация
```typescript
// Загрузка настроек из БД
await equipmentActions.loadConfig();

// Сохранение новых настроек
const newConfig: EquipmentConfig = {
    connectionType: 'local',
    scale: {
        baudRate: 4800,
        parity: 'even',
        autoConnect: true
    }
};
await equipmentActions.saveConfig(newConfig);
```

## 🛠️ Практические примеры

### 1. Добавление нового компонента с весами

```typescript
// NewWeightComponent.tsx
import React from 'react';
import { useEquipmentFromAuth } from '../contexts/AuthContext';

export const NewWeightComponent: React.FC = () => {
    const [equipmentState] = useEquipmentFromAuth();
    
    return (
        <div>
            <h3>Текущий вес</h3>
            {equipmentState.currentWeight ? (
                <p>{equipmentState.currentWeight.weight} кг</p>
            ) : (
                <p>Данные не получены</p>
            )}
        </div>
    );
};
```

### 2. Создание пользовательского hook

```typescript
// useScaleWeight.ts
import { useCallback, useEffect, useState } from 'react';
import { useEquipmentFromAuth } from '../contexts/AuthContext';
import { VTAScaleData } from '../services/ScaleService';

export const useScaleWeight = () => {
    const [equipmentState, equipmentActions] = useEquipmentFromAuth();
    const [isLoading, setIsLoading] = useState(false);
    
    const refreshWeight = useCallback(async () => {
        setIsLoading(true);
        try {
            await equipmentActions.getWeight();
        } catch (error) {
            console.error('Ошибка получения веса:', error);
        } finally {
            setIsLoading(false);
        }
    }, [equipmentActions]);
    
    return {
        currentWeight: equipmentState.currentWeight,
        isConnected: equipmentState.isScaleConnected,
        isLoading,
        refreshWeight
    };
};
```

### 3. Обработка ошибок

```typescript
// ErrorBoundary для системы весов
class ScaleErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    
    static getDerivedStateFromError(error) {
        return { hasError: true };
    }
    
    componentDidCatch(error, errorInfo) {
        console.error('Scale system error:', error, errorInfo);
        // Отправить ошибку в систему мониторинга
    }
    
    render() {
        if (this.state.hasError) {
            return <ScaleErrorFallback />;
        }
        
        return this.props.children;
    }
}
```

## 🧪 Тестирование

### Unit тесты для ScaleService
```typescript
// ScaleService.test.ts
import ScaleService from '../services/ScaleService';

describe('ScaleService', () => {
    let scaleService: ScaleService;
    
    beforeEach(() => {
        scaleService = new ScaleService();
    });
    
    test('должен правильно парсить цифробайты', () => {
        const digits = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
        const result = scaleService['digits6ToNumber'](digits);
        expect(result).toBe(654321); // Младшие разряды первыми
    });
    
    test('должен форматировать массу с 3 знаками', () => {
        const digits = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
        const result = scaleService['formatMassFromDigits'](digits, 3);
        expect(result).toBe(654.321); // 654321 / 1000
    });
});
```

### Интеграционные тесты
```typescript
// Equipment.integration.test.ts
import { renderHook, act } from '@testing-library/react-hooks';
import { useEquipment } from '../hooks/useEquipment';

describe('Equipment Integration', () => {
    test('должен подключаться к симулированным весам', async () => {
        const { result } = renderHook(() => useEquipment());
        
        await act(async () => {
            const success = await result.current[1].connectScale();
            expect(success).toBe(true);
        });
        
        expect(result.current[0].isScaleConnected).toBe(true);
    });
});
```

### Мокирование Web Serial API
```typescript
// setupTests.ts
global.navigator.serial = {
    requestPort: jest.fn().mockResolvedValue({
        open: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
        readable: {
            getReader: jest.fn().mockReturnValue({
                read: jest.fn().mockResolvedValue({
                    value: new Uint8Array([1, 2, 3]),
                    done: false
                }),
                releaseLock: jest.fn()
            })
        }
    }),
    getPorts: jest.fn().mockResolvedValue([])
};
```

## 🐛 Отладка и диагностика

### Уровни логирования
```typescript
// В development режиме
if (process.env.NODE_ENV === 'development') {
    console.log('🔧 ScaleService: подробная информация');
}

// Всегда логируем ошибки
console.error('❌ ScaleService: критическая ошибка');

// Успешные операции
console.log('✅ ScaleService: операция завершена');
```

### Chrome DevTools для Web Serial
1. Откройте **DevTools** → **Application** → **Storage**
2. Найдите **"Serial Ports"** для просмотра сохраненных портов
3. Используйте **Console** для отладки:
```javascript
// Проверка поддержки
console.log('Serial support:', 'serial' in navigator);

// Список доступных портов  
navigator.serial.getPorts().then(console.log);
```

### Инструменты разработчика
```typescript
// Добавьте в глобальный объект для отладки
if (process.env.NODE_ENV === 'development') {
    (window as any).scaleDebug = {
        connectScale: () => scaleService.connect(),
        getWeight: () => scaleService.getCurrentWeight(),
        rawCommand: (cmd: number[]) => scaleService.sendCustomCommand(cmd)
    };
}
```

## 🔧 Кастомизация и расширение

### Добавление нового протокола весов
```typescript
// NewScaleProtocol.ts
interface CustomScaleProtocol {
    startByte: number;
    endByte: number;
    dataLength: number;
    parseResponse(data: Uint8Array): ScaleData;
}

class CustomScaleService extends ScaleService {
    protected protocol: CustomScaleProtocol = {
        startByte: 0x02,
        endByte: 0x03,
        dataLength: 12,
        parseResponse: (data) => { /* кастомная логика */ }
    };
}
```

### Добавление новых метрик
```typescript
// Расширение интерфейса
interface ExtendedScaleData extends VTAScaleData {
    temperature?: number;   // Температура
    humidity?: number;      // Влажность  
    batteryLevel?: number;  // Уровень батареи
}
```

### Создание плагинов
```typescript
// ScalePlugin.ts
interface ScalePlugin {
    name: string;
    onConnect?(service: ScaleService): void;
    onData?(data: VTAScaleData): VTAScaleData;
    onDisconnect?(): void;
}

class LoggingPlugin implements ScalePlugin {
    name = 'logging';
    
    onData(data: VTAScaleData): VTAScaleData {
        console.log(`[${this.name}] Weight: ${data.weight}`);
        return data;
    }
}
```

## 📊 Производительность  

### Оптимизация запросов
```typescript
// Кэширование данных веса
const CACHE_DURATION = 2000; // 2 секунды

const getWeight = useCallback(async () => {
    const now = Date.now();
    if (lastWeight && (now - lastWeight.timestamp.getTime()) < CACHE_DURATION) {
        return lastWeight; // Возвращаем кэшированное значение
    }
    
    // Запрашиваем новые данные
    const newWeight = await scaleService.getCurrentWeight();
    setLastWeight(newWeight);
    return newWeight;
}, [lastWeight]);
```

### Оптимизация рендеринга
```typescript
// Используем React.memo для компонентов
const ScaleDisplay = React.memo(({ weight }: { weight: VTAScaleData }) => {
    return <div>{weight.weight} кг</div>;
});

// Используем useMemo для тяжелых вычислений
const formattedWeight = useMemo(() => {
    return currentWeight ? 
        `${currentWeight.weight.toFixed(3)} кг` : 
        '---.--- кг';
}, [currentWeight]);
```

## 🚀 Развертывание

### Production готовность
```typescript
// Отключение debug логов в production
const isDevelopment = process.env.NODE_ENV === 'development';

if (isDevelopment) {
    console.log('Debug info');
}
```

### Docker конфигурация
```dockerfile
# Dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment variables
```env
# .env.production
NODE_ENV=production
VITE_SCALE_DEBUG=false
VITE_API_URL=https://your-api.com
```

## 📚 Полезные ресурсы

### Документация API
- [Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)
- [React Hooks](https://reactjs.org/docs/hooks-intro.html)
- [TypeScript](https://www.typescriptlang.org/docs/)

### Инструменты разработки  
- [Chrome DevTools](https://developers.google.com/web/tools/chrome-devtools)
- [React DevTools](https://chrome.google.com/webstore/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi)
- [Redux DevTools](https://chrome.google.com/webstore/detail/redux-devtools/lmhkpmbekcpmknklioeibfkpmmfibljd)

### Тестирование
- [Jest](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [MSW (Mock Service Worker)](https://mswjs.io/docs/)

---

## ❓ FAQ

**Q: Почему используется Web Serial API вместо WebSocket?**
A: Web Serial API дает прямой доступ к последовательному порту, что снижает латентность и упрощает архитектуру.

**Q: Можно ли использовать другие модели весов?**
A: Да, нужно создать новый сервис, реализующий интерфейс ScaleService с другим протоколом.

**Q: Как добавить поддержку Bluetooth весов?**  
A: Используйте Web Bluetooth API вместо Serial API, создав BluetoothScaleService.

**Q: Почему данные кэшируются на 2 секунды?**
A: Это предотвращает излишние запросы при частых обновлениях UI.

---
*Руководство обновлено: Сентябрь 2025*  
*Для вопросов: создайте issue в репозитории*
