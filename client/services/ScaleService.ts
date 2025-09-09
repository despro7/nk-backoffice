import { ScaleData } from './EquipmentService';

// Типы для Web Serial API (если не поддерживаются браузером)
declare global {
  interface Navigator {
    serial?: {
      requestPort(options?: { filters?: Array<{ usbVendorId?: number; usbProductId?: number }> }): Promise<SerialPort>;
      getPorts(): Promise<SerialPort[]>;
    };
  }

  interface SerialPort {
    open(options: SerialOptions): Promise<void>;
    close(): Promise<void>;
    readable: ReadableStream<Uint8Array> | null;
    writable: WritableStream<Uint8Array> | null;
  }

  interface SerialOptions {
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: string;
    bufferSize?: number;
  }
}

export interface ScaleConnectionConfig {
  comPort: string;
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: 'none' | 'even' | 'odd';
}

export interface ScaleProtocol {
  startByte: string;
  endByte: string;
  dataLength: number;
  checksum: boolean;
}

export class ScaleService {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private isConnected: boolean = false;
  private config: ScaleConnectionConfig;
  private protocol: ScaleProtocol;
  private weightBuffer: string = '';
  private onWeightChange: ((data: ScaleData) => void) | null = null;
  private onRawData: ((data: string) => void) | null = null;

  constructor() {
    this.config = {
      comPort: 'COM5',
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none'
    };

    // Протокол для ваг ВТА-60 (простой текстовый формат)
    this.protocol = {
      startByte: '',     // Нет стартового байта
      endByte: '\n',     // Конец строки
      dataLength: 0,     // Переменная длина
      checksum: false
    };
  }

  // Підключення до ваг через Web Serial API
  public async connect(autoConnect: boolean = false): Promise<boolean> {
    try {
      // Перевіряємо підтримку Web Serial API
      if (!('serial' in navigator)) {
        console.log('⚠️ ScaleService: Web Serial API не підтримується в цьому браузері');
        return false;
      }

      // Проверяем, не подключены ли уже
      if (this.isConnected && this.port) {
        console.log('🔧 ScaleService: Ваги вже підключені');
        return true;
      }

      console.log('🔧 ScaleService: Запрашиваем доступ к COM порту...');

      // При автоматическом подключении пытаемся найти сохраненный порт
      if (autoConnect) {
        try {
          const ports = await navigator.serial.getPorts();
          console.log('🔧 ScaleService: Найдено сохраненных портов:', ports.length);

          if (ports.length > 0) {
            // Используем первый доступный порт
            this.port = ports[0];
            console.log('🔧 ScaleService: Используем сохраненный порт');
          } else {
            console.log('⚠️ ScaleService: Сохраненных портов не найдено, требуется ручной выбор');
            return false;
          }
        } catch (error) {
          console.log('⚠️ ScaleService: Не удалось получить сохраненные порты:', error);
          return false;
        }
      } else {
        // Ручной выбор порта
        this.port = await navigator.serial.requestPort({
          // filters: [
          //   { usbVendorId: 0x1a86, usbProductId: 0x7523 }, // CH340
          //   { usbVendorId: 0x067b, usbProductId: 0x2303 }, // Prolific
          //   { usbVendorId: 0x0403, usbProductId: 0x6001 }  // FTDI
          // ]
        });
      }

      console.log('🔧 ScaleService: Відкриваємо порт з налаштуваннями...');

      // Відкриваємо порт з налаштуваннями
      await this.port.open({
        baudRate: this.config.baudRate,
        dataBits: this.config.dataBits,
        stopBits: this.config.stopBits,
        parity: this.config.parity,
        bufferSize: 1024
      });

      this.isConnected = true;
      console.log('✅ ScaleService: Ваги успішно підключені');

      // Запускаємо читання даних
      this.startReading();

      return true;
    } catch (error) {
      console.log('❌ ScaleService: Не вдалося підключити ваги:', error);
      this.isConnected = false;
      return false;
    }
  }

  // Відключення від ваг
  public async disconnect(): Promise<void> {
    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader = null;
      }

      if (this.writer) {
        await this.writer.close();
        this.writer = null;
      }

      if (this.port) {
        await this.port.close();
        this.port = null;
      }

      this.isConnected = false;
      console.log('Scale disconnected');
    } catch (error) {
      console.error('Error disconnecting scale:', error);
    }
  }

  // Запуск читання даних з ваг
  private async startReading(): Promise<void> {
    if (!this.port || !this.isConnected) return;

    try {
      const textDecoder = new TextDecoder();
      this.reader = this.port.readable?.getReader();

      if (!this.reader) {
        throw new Error('Failed to get reader');
      }

      while (this.isConnected) {
        try {
          const { value, done } = await this.reader.read();

          if (done) break;

          if (value) {
            const chunk = textDecoder.decode(value, { stream: true });
            this.processWeightData(chunk);
          }
        } catch (error) {
          console.error('Error reading from scale:', error);
          break;
        }
      }
    } catch (error) {
      console.error('Failed to start reading from scale:', error);
    }
  }

  // Обробка даних з ваг
  private processWeightData(data: string): void {
    this.weightBuffer += data;

    // Передаємо сирі дані через callback
    if (this.onRawData && data.trim()) {
      this.onRawData(data);
    }

    // Шукаємо повні повідомлення (простой текстовый формат)
    let endIndex = this.weightBuffer.indexOf(this.protocol.endByte);

    while (endIndex !== -1) {
      const message = this.weightBuffer.substring(0, endIndex);
      this.parseWeightMessage(message);

      // Видаляємо оброблене повідомлення
      this.weightBuffer = this.weightBuffer.substring(endIndex + 1);

      // Шукаємо наступне повідомлення
      endIndex = this.weightBuffer.indexOf(this.protocol.endByte);
    }

    // Если endByte не найден, но данные выглядят как вес - парсим их сразу
    if (this.weightBuffer.length > 0 && endIndex === -1) {
      // Проверяем, содержит ли буфер число с точкой
      const weightMatch = this.weightBuffer.match(/[\d]+[.,][\d]+/);
      if (weightMatch) {
        this.parseWeightMessage(this.weightBuffer);
        this.weightBuffer = ''; // Очищаем буфер после парсинга
      }
    }

    // Очищаємо буфер якщо він занадто великий
    if (this.weightBuffer.length > 1000) {
      this.weightBuffer = this.weightBuffer.substring(this.weightBuffer.length - 500);
    }
  }

  // Парсинг повідомлення з ваг
  private parseWeightMessage(message: string): void {
    try {
      // Очищаем сообщение от лишних символов
      let cleanMessage = message.trim();

      // Убираем единицы измерения и другие текстовые части
      cleanMessage = cleanMessage.replace(/[a-zA-Z\s]/g, '');

      // Ищем числа с точкой (вес в формате 1.234 или 1,234)
      const weightMatch = cleanMessage.match(/[\d]+[.,][\d]+/);

      if (weightMatch) {
        // Заменяем запятую на точку для корректного парсинга
        const weightStr = weightMatch[0].replace(',', '.');
        const weight = parseFloat(weightStr);

        if (!isNaN(weight) && weight >= 0) {
          const scaleData: ScaleData = {
            weight: weight,
            unit: 'kg',
            isStable: true, // Предполагаем стабильность
            timestamp: new Date()
          };

          // Викликаємо callback якщо він встановлений
          if (this.onWeightChange) {
            this.onWeightChange(scaleData);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error parsing weight message:', error);
    }
  }

  // Встановлення callback для зміни ваги
  public onWeightData(callback: (data: ScaleData) => void): void {
    this.onWeightChange = callback;
  }

  // Встановлення callback для сирих даних
  public onRawDataReceived(callback: (data: string) => void): void {
    this.onRawData = callback;
  }

  // Отримання поточної ваги
  public async getCurrentWeight(): Promise<ScaleData | null> {
    if (!this.isConnected) {
      console.log('⚠️ ScaleService: Ваги не підключені');
      return null;
    }

    console.log('🔧 ScaleService: Отримання поточного ваги з буфера...');

    // Проверяем, есть ли данные в буфере
    if (this.weightBuffer.length > 0) {
      console.log('🔧 ScaleService: Есть данные в буфере, парсим:', this.weightBuffer);

      // Парсим последний вес из буфера
      const weightMatch = this.weightBuffer.match(/[\d]+[.,][\d]+/);
      if (weightMatch) {
        const weightStr = weightMatch[0].replace(',', '.');
        const weight = parseFloat(weightStr);

        if (!isNaN(weight) && weight >= 0) {
          const scaleData: ScaleData = {
            weight: weight,
            unit: 'kg',
            isStable: true,
            timestamp: new Date()
          };

          console.log('✅ ScaleService: Возвращаем вес из буфера:', scaleData);
          return scaleData;
        }
      }
    }

    // Если в буфере нет данных, проверяем последний известный вес через callback
    console.log('🔧 ScaleService: Буфер пуст, пытаемся получить последний вес...');

    // Ждем немного, вдруг данные придут
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('⏰ ScaleService: Таймаут ожидания данных от весов');
        resolve(null);
      }, 1000); // Уменьшаем таймаут до 1 секунды

      // Если за время ожидания придут данные, используем их
      const originalCallback = this.onWeightChange;
      this.onWeightChange = (data: ScaleData) => {
        console.log('✅ ScaleService: Получены свежие данные:', data);
        clearTimeout(timeout);
        this.onWeightChange = originalCallback;
        resolve(data);
      };
    });
  }

  // Надсилання команди на ваги
  private async sendCommand(command: string): Promise<void> {
    if (!this.port || !this.isConnected) {
      throw new Error('Scale is not connected');
    }

    try {
      this.writer = this.port.writable?.getWriter();
      
      if (!this.writer) {
        throw new Error('Failed to get writer');
      }

      const encoder = new TextEncoder();
      const data = encoder.encode(command);
      await this.writer.write(data);
      
      await this.writer.releaseLock();
    } catch (error) {
      console.error('Error sending command to scale:', error);
      throw error;
    }
  }

  // Перевірка з'єднання
  public isScaleConnected(): boolean {
    return this.isConnected;
  }

  // Оновлення конфігурації
  public updateConfig(newConfig: Partial<ScaleConnectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // Отримання конфігурації
  public getConfig(): ScaleConnectionConfig {
    return { ...this.config };
  }

  // Тестування з'єднання
  public async testConnection(): Promise<boolean> {
    try {
      const result = await this.connect();
      if (result) {
        await this.disconnect();
      }
      return result;
    } catch (error) {
      console.error('Scale connection test failed:', error);
      return false;
    }
  }

  // Тест различных конфигураций подключения
  public async testConnectionConfigs(): Promise<{config: ScaleConnectionConfig, success: boolean}[]> {
    const configs: ScaleConnectionConfig[] = [
      { comPort: 'COM5', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
      { comPort: 'COM5', baudRate: 19200, dataBits: 8, stopBits: 1, parity: 'none' },
      { comPort: 'COM5', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'even' },
      { comPort: 'COM5', baudRate: 19200, dataBits: 8, stopBits: 1, parity: 'even' },
      { comPort: 'COM5', baudRate: 4800, dataBits: 8, stopBits: 1, parity: 'none' },
      { comPort: 'COM5', baudRate: 38400, dataBits: 8, stopBits: 1, parity: 'none' }
    ];

    const results: {config: ScaleConnectionConfig, success: boolean}[] = [];

    console.log('🧪 Тестирование различных конфигураций подключения к весам...\n');

    for (const config of configs) {
      console.log(`Тестируем: ${config.baudRate} baud, ${config.parity} parity`);

      try {
        // Обновляем конфигурацию
        this.updateConfig(config);

        // Пытаемся подключиться
        const success = await this.connect();

        if (success) {
          console.log('✅ Подключение успешно');

          // Ждем немного данных (5 секунд)
          let dataReceived = false;
          const timeout = setTimeout(() => {
            if (!dataReceived) {
              console.log('⚠️ Данные не получены в течение 5 секунд');
            }
          }, 5000);

          const originalCallback = this.onWeightChange;
          this.onWeightChange = (data) => {
            dataReceived = true;
            clearTimeout(timeout);
            console.log(`✅ Получены данные: ${data.weight} кг`);
          };

          await new Promise(resolve => setTimeout(resolve, 5000));

          // Отключаемся
          await this.disconnect();
          this.onWeightChange = originalCallback;

          results.push({ config, success: dataReceived });
          console.log(`Результат: ${dataReceived ? 'УСПЕХ' : 'ПОДКЛЮЧЕНИЕ БЕЗ ДАННЫХ'}\n`);
        } else {
          console.log('❌ Подключение не удалось\n');
          results.push({ config, success: false });
        }

      } catch (error) {
        console.error(`❌ Ошибка при тестировании: ${error.message}\n`);
        results.push({ config, success: false });
      }
    }

    return results;
  }
}

export default ScaleService;
