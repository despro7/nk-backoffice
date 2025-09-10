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
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: 'none' | 'even' | 'odd';
}

export interface VTAScaleData extends ScaleData {
  price?: number;
  total?: number;
  rawData?: Uint8Array;
}

export class ScaleService {
  private port: SerialPort | null = null;
  private isConnected: boolean = false;
  private config: ScaleConnectionConfig;
  private onWeightChange: ((data: VTAScaleData) => void) | null = null;
  private onRawData: ((data: Uint8Array) => void) | null = null;

  constructor() {
    // Настройки для ВТА-60: 4800-8E1 по умолчанию
    this.config = {
      baudRate: 4800,
      dataBits: 8,
      stopBits: 1,
      parity: 'even'
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
          filters: [
            { usbVendorId: 0x1a86, usbProductId: 0x7523 }, // CH340
            { usbVendorId: 0x067b, usbProductId: 0x2303 }, // Prolific
            { usbVendorId: 0x0403, usbProductId: 0x6001 }  // FTDI
          ]
        });
      }

      console.log(`🔧 ScaleService: Відкриваємо порт з налаштуваннями ВТА-60 (${this.config.baudRate}-${this.config.dataBits}${this.config.parity.charAt(0).toUpperCase()}${this.config.stopBits})`);

      // Відкриваємо порт з налаштуваннями для ВТА-60
      await this.port.open({
        baudRate: this.config.baudRate,
        dataBits: this.config.dataBits,
        stopBits: this.config.stopBits,
        parity: this.config.parity,
        bufferSize: 1024
      });

      this.isConnected = true;
      console.log('✅ ScaleService: Ваги ВТА-60 успішно підключені');

      return true;
    } catch (error) {
      console.log('❌ ScaleService: Не вдалося підключити ваги:', error);
      this.isConnected = false;
      return false;
    }
  }

  // Помощник: сборка числа из 6 «цифробайтів» 0x00..0x09, младшие разряды первыми
  private digits6ToNumber(bytes6: Uint8Array): number {
    // bytes6: [m1,m2,m3,m4,m5,m6] где m1 — младший разряд [2]
    let str = '';
    for (let i = 5; i >= 0; i--) { // разворот разрядов: m6..m1
      const d = bytes6[i] & 0x0F;
      if (d > 9) return NaN; // защита от мусора
      str += d.toString();
    }
    // Удалим лидирующие нули, но оставим хотя бы один
    str = str.replace(/^0+(?!$)/, '');
    return Number(str);
  }

  // Расстановка десятичной точки для массы (ВТА-60 обычно 3 знака после точки для кг)
  private formatMassFromDigits(bytes6: Uint8Array, decimals: number = 3): number {
    const raw = this.digits6ToNumber(bytes6); // например 1234
    const factor = Math.pow(10, decimals);
    return raw / factor; // кг
  }

  // Расстановка десятичной точки для цены
  private formatPriceFromDigits(bytes6: Uint8Array, decimals: number = 2): number {
    const raw = this.digits6ToNumber(bytes6);
    return raw / Math.pow(10, decimals); // валюта за кг
  }

  // Расстановка десятичной точки для суммы
  private formatTotalFromDigits(bytes6: Uint8Array, decimals: number = 2): number {
    const raw = this.digits6ToNumber(bytes6);
    return raw / Math.pow(10, decimals);
  }

  // Чтение одного ответа (18 байт) протокола ВТА-60
  private async readOneFrame(timeoutMs: number = 1000): Promise<Uint8Array | null> {
    if (!this.port || !this.isConnected) return null;

    const reader = this.port.readable?.getReader();
    if (!reader) return null;

    try {
      const start = performance.now();
      const buf: number[] = [];

      while (performance.now() - start < timeoutMs) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          for (const b of value) buf.push(b);
          // Ищем минимум 18 байт подряд — в этом протоколе нет заголовка, просто 18 «цифробайтів»
          while (buf.length >= 18) {
            const frame = buf.splice(0, 18); // возьмём первые 18
            return new Uint8Array(frame);
          }
        }
      }
      return null; // тайм-аут
    } finally {
      reader.releaseLock();
    }
  }

  // Отправка запроса «00 00 03» протокола ВТА-60
  private async sendPoll(): Promise<void> {
    if (!this.port || !this.isConnected) {
      throw new Error('Scale is not connected');
    }

    try {
      const writer = this.port.writable?.getWriter();
      if (!writer) throw new Error('Failed to get writer');

      await writer.write(new Uint8Array([0x00, 0x00, 0x03]));
      writer.releaseLock();
    } catch (error) {
      console.error('Error sending poll to scale:', error);
      throw error;
    }
  }

  // Полный цикл: опрос или ожидание автопередачи, парсинг кадра
  public async readScaleOnce(usePolling: boolean = true): Promise<VTAScaleData | null> {
    if (!this.isConnected) return null;

    try {
      if (usePolling) {
        await this.sendPoll(); // запрос «масса/цена/сумма»
      }

      const frame = await this.readOneFrame(1500);
      if (!frame) throw new Error('Нет ответа (тайм-аут или нестабильная масса)');

      // m1..m6 c1..c6 v1..v6 (младшие сначала)
      const m = frame.slice(0, 6);
      const c = frame.slice(6, 12);
      const v = frame.slice(12, 18);

      // Преобразование (скорректируйте decimals под настройки весов)
      const massKg = this.formatMassFromDigits(m, 3);    // кг, три знака после точки
      const price = this.formatPriceFromDigits(c, 2);    // валюта/кг
      const total = this.formatTotalFromDigits(v, 2);    // валюта

      const scaleData: VTAScaleData = {
        weight: massKg,
        unit: 'kg',
        isStable: true, // Предполагаем стабильность для протокола 0
        timestamp: new Date(),
        price: price,
        total: total,
        rawData: frame
      };

      return scaleData;
    } catch (error) {
      console.error('❌ Error reading scale data:', error);
      return null;
    }
  }

  // Відключення від ваг
  public async disconnect(): Promise<void> {
    try {
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


  // Встановлення callback для зміни ваги
  public onWeightData(callback: (data: VTAScaleData) => void): void {
    this.onWeightChange = callback;
  }

  // Встановлення callback для сирих даних
  public onRawDataReceived(callback: (data: Uint8Array) => void): void {
    this.onRawData = callback;
  }

  // Отримання поточної ваги
  public async getCurrentWeight(): Promise<VTAScaleData | null> {
    if (!this.isConnected) {
      console.log('⚠️ ScaleService: Ваги не підключені');
      return null;
    }

    console.log('🔧 ScaleService: Отправка запроса на получение данных от весов...');

    // Отправляем запрос и ждем ответа
    return await this.readScaleOnce(true);
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

  // Тестування з'єднання з ВТА-60
  public async testConnection(): Promise<boolean> {
    try {
      const result = await this.connect();
      if (result) {
        // Пытаемся получить данные от весов
        const testData = await this.readScaleOnce(true);
        await this.disconnect();
        return testData !== null;
      }
      return false;
    } catch (error) {
      console.error('Scale connection test failed:', error);
      return false;
    }
  }

  // Тест различных конфигураций подключения для ВТА-60
  public async testConnectionConfigs(): Promise<{config: ScaleConnectionConfig, success: boolean, data?: VTAScaleData}[]> {
    const configs: ScaleConnectionConfig[] = [
      { baudRate: 4800, dataBits: 8, stopBits: 1, parity: 'even' },  // ВТА-60 по умолчанию
      { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'even' },
      { baudRate: 19200, dataBits: 8, stopBits: 1, parity: 'even' },
      { baudRate: 4800, dataBits: 8, stopBits: 1, parity: 'none' },
      { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
      { baudRate: 19200, dataBits: 8, stopBits: 1, parity: 'none' }
    ];

    const results: {config: ScaleConnectionConfig, success: boolean, data?: VTAScaleData}[] = [];

    console.log('🧪 Тестирование различных конфигураций подключения к ВТА-60...\n');

    for (const config of configs) {
      console.log(`Тестируем: ${config.baudRate} baud, ${config.parity} parity`);

      try {
        // Обновляем конфигурацию
        this.updateConfig(config);

        // Пытаемся подключиться
        const success = await this.connect();

        if (success) {
          console.log('✅ Подключение успешно');

          // Пытаемся получить данные
          const scaleData = await this.readScaleOnce(true);

          if (scaleData) {
            console.log(`✅ Получены данные: ${scaleData.weight} кг, цена: ${scaleData.price}, сумма: ${scaleData.total}`);
            console.log(`   Raw: ${Array.from(scaleData.rawData!).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
          } else {
            console.log('⚠️ Данные не получены');
          }

          // Отключаемся
          await this.disconnect();

          results.push({ config, success: scaleData !== null, data: scaleData || undefined });
          console.log(`Результат: ${scaleData ? 'УСПЕХ' : 'ПОДКЛЮЧЕНИЕ БЕЗ ДАННЫХ'}\n`);
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
