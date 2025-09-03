# Технічні специфікації інтеграції обладнання

## Огляд

Цей документ описує технічні вимоги та процес інтеграції реального обладнання (сканер штрихкодів та ваги) з системою комплектації замовлень.

## 1. Сканер штрихкодів

### Технічні вимоги
- **Тип з'єднання:** USB або Bluetooth
- **Підтримувані формати:** EAN-13, Code-128, QR-код
- **Швидкість сканування:** Мінімум 100 сканувань/хв
- **Точність:** 99.9%+

### API Інтеграція

#### Web Serial API (USB)
```javascript
// Приклад інтеграції USB сканера
class BarcodeScanner {
  constructor() {
    this.port = null;
    this.reader = null;
  }

  async connect() {
    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: 9600 });
      this.startReading();
    } catch (error) {
      console.error('Помилка підключення сканера:', error);
    }
  }

  async startReading() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        // Обробка отриманого штрихкоду
        this.handleBarcode(value.trim());
      }
    } catch (error) {
      console.error('Помилка читання:', error);
    } finally {
      reader.releaseLock();
    }
  }

  handleBarcode(barcode) {
    // Логіка обробки штрихкоду
    console.log('Відскановано:', barcode);
    // Відправка події в систему
    window.dispatchEvent(new CustomEvent('barcodeScanned', { 
      detail: { barcode, timestamp: Date.now() } 
    }));
  }
}
```

#### WebSocket (Bluetooth/Network)
```javascript
// Приклад інтеграції через WebSocket
class WebSocketBarcodeScanner {
  constructor(url) {
    this.ws = null;
    this.url = url;
  }

  connect() {
    this.ws = new WebSocket(this.url);
    
    this.ws.onmessage = (event) => {
      const barcode = JSON.parse(event.data).barcode;
      this.handleBarcode(barcode);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket помилка:', error);
    };
  }

  handleBarcode(barcode) {
    window.dispatchEvent(new CustomEvent('barcodeScanned', { 
      detail: { barcode, timestamp: Date.now() } 
    }));
  }
}
```

## 2. Ваги

### Технічні вимоги
- **Тип з'єднання:** USB або RS-232
- **Точність:** Мінімум 1 грам
- **Максимальна вага:** 10-15 кг
- **Швидкість оновлення:** Мінімум 10 разів/сек

### API Інтеграція

#### Web Serial API (USB)
```javascript
// Приклад інтеграції USB вагів
class Scale {
  constructor() {
    this.port = null;
    this.currentWeight = 0;
    this.isStable = false;
  }

  async connect() {
    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: 9600 });
      this.startReading();
    } catch (error) {
      console.error('Помилка підключення вагів:', error);
    }
  }

  async startReading() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        // Парсинг даних з вагів
        this.parseWeightData(value.trim());
      }
    } catch (error) {
      console.error('Помилка читання вагів:', error);
    } finally {
      reader.releaseLock();
    }
  }

  parseWeightData(data) {
    // Приклад парсингу даних з вагів
    // Формат: "S, 1.234, g" (стабільність, вага, одиниця)
    const parts = data.split(',');
    if (parts.length >= 3) {
      const stability = parts[0].trim();
      const weight = parseFloat(parts[1].trim());
      const unit = parts[2].trim();

      this.isStable = stability === 'S';
      this.currentWeight = weight;

      // Відправка події в систему
      window.dispatchEvent(new CustomEvent('weightChanged', { 
        detail: { 
          weight: this.currentWeight, 
          isStable: this.isStable, 
          unit,
          timestamp: Date.now() 
        } 
      }));
    }
  }

  getCurrentWeight() {
    return this.currentWeight;
  }

  isWeightStable() {
    return this.isStable;
  }
}
```

## 3. Інтеграція з системою

### Event System
```javascript
// Система подій для інтеграції обладнання
class EquipmentEventManager {
  constructor() {
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Слухаємо події сканера
    window.addEventListener('barcodeScanned', (event) => {
      this.handleBarcodeScanned(event.detail);
    });

    // Слухаємо події вагів
    window.addEventListener('weightChanged', (event) => {
      this.handleWeightChanged(event.detail);
    });
  }

  handleBarcodeScanned({ barcode, timestamp }) {
    // Знаходимо товар по штрихкоду
    const product = this.findProductByBarcode(barcode);
    if (product) {
      // Встановлюємо статус "pending" для товару
      this.setProductStatus(product.id, 'pending');
      // Показуємо повідомлення
      this.showNotification(`Товар знайдено: ${product.name}`);
    } else {
      this.showError(`Товар з штрихкодом ${barcode} не знайдено`);
    }
  }

  handleWeightChanged({ weight, isStable, unit, timestamp }) {
    if (isStable) {
      // Вага стабільна, можна проводити валідацію
      const pendingProduct = this.getPendingProduct();
      if (pendingProduct) {
        this.validateWeight(weight, pendingProduct);
      }
    }
  }

  findProductByBarcode(barcode) {
    // Логіка пошуку товару по штрихкоду
    return this.products.find(p => p.sku === barcode);
  }

  validateWeight(actualWeight, product) {
    const expectedWeight = product.expectedWeight;
    const tolerance = 0.1; // Допуск 100 грам

    if (Math.abs(actualWeight - expectedWeight) <= tolerance) {
      // Вага відповідає очікуваній
      this.setProductStatus(product.id, 'success');
      setTimeout(() => {
        this.setProductStatus(product.id, 'done');
      }, 1500);
      
      this.showSuccess(`Вага відповідає: ${actualWeight} кг`);
    } else {
      // Вага не відповідає
      this.setProductStatus(product.id, 'error');
      this.showError(`Вага не відповідає. Очікувана: ${expectedWeight} кг, Фактична: ${actualWeight} кг`);
    }
  }
}
```

## 4. Налаштування та конфігурація

### Конфігураційний файл
```json
{
  "equipment": {
    "barcodeScanner": {
      "type": "usb",
      "baudRate": 9600,
      "dataBits": 8,
      "stopBits": 1,
      "parity": "none"
    },
    "scale": {
      "type": "usb",
      "baudRate": 9600,
      "dataBits": 8,
      "stopBits": 1,
      "parity": "none",
      "weightTolerance": 0.1
    }
  },
  "validation": {
    "weightTolerance": 0.1,
    "autoAdvance": true,
    "soundEnabled": true
  }
}
```

### Налаштування браузера
```javascript
// Перевірка підтримки Web Serial API
if ('serial' in navigator) {
  console.log('Web Serial API підтримується');
} else {
  console.error('Web Serial API не підтримується');
}

// Запит дозволів
async function requestPermissions() {
  try {
    // Запит дозволу на доступ до серійних портів
    const ports = await navigator.serial.getPorts();
    if (ports.length === 0) {
      await navigator.serial.requestPort();
    }
    
    // Запит дозволу на доступ до Bluetooth
    if ('bluetooth' in navigator) {
      await navigator.bluetooth.requestDevice({
        filters: [
          { services: ['battery_service'] }
        ]
      });
    }
  } catch (error) {
    console.error('Помилка запиту дозволів:', error);
  }
}
```

## 5. Тестування та валідація

### Тестові сценарії
1. **Сканування штрихкоду**
   - Відсканувати існуючий товар
   - Відсканувати неіснуючий товар
   - Тест помилок з'єднання

2. **Зважування**
   - Зважити товар з правильною вагою
   - Зважити товар з неправильною вагою
   - Тест нестабільної ваги

3. **Інтеграція**
   - Тест автоматичного переходу між етапами
   - Тест обробки помилок
   - Тест продуктивності

### Інструменти тестування
- **Mock обладнання:** Імітація обладнання для тестування
- **Логування:** Детальне логування всіх операцій
- **Моніторинг:** Відстеження продуктивності та помилок

## 6. Розгортання та підтримка

### Вимоги до середовища
- **Браузер:** Chrome 89+, Edge 89+
- **ОС:** Windows 10+, macOS 10.15+, Linux
- **Драйвери:** Встановлені драйвери для обладнання

### Процес розгортання
1. Встановлення драйверів обладнання
2. Налаштування конфігурації
3. Тестування з'єднання
4. Інтеграція з системою
5. Навчання персоналу

### Підтримка та обслуговування
- Регулярна перевірка з'єднання
- Оновлення драйверів
- Моніторинг помилок
- Резервне копіювання конфігурації

## 7. Безпека та надійність

### Безпека
- Валідація всіх вхідних даних
- Обмеження доступу до обладнання
- Логування всіх операцій
- Захист від атак

### Надійність
- Автоматичне перепідключення при втраті з'єднання
- Обробка помилок обладнання
- Резервні режими роботи
- Відновлення після збоїв

## Висновок

Система готова до інтеграції реального обладнання. Всі необхідні компоненти реалізовані та протестовані. Наступним кроком є фізичне підключення обладнання та налаштування з'єднання.
