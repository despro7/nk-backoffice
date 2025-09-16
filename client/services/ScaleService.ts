import { ScaleData } from './EquipmentService';
import { EQUIPMENT_DEFAULTS } from '../../shared/constants/equipmentDefaults.js';

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
  connectionStrategy?: 'legacy' | 'reconnectOnError' | 'persistentStream';
}

export interface VTAScaleData extends ScaleData {
  price?: number;
  total?: number;
  rawData?: Uint8Array;
}

export class ScaleService {
  private static instance: ScaleService;
  private port: SerialPort | null = null;
  private isConnected: boolean = false;
  private config: ScaleConnectionConfig;
  private onWeightChange: ((data: VTAScaleData) => void) | null = null;
  private onRawData: ((data: Uint8Array) => void) | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  private isReading: boolean = false; // Флаг для предотвращения одновременного чтения
  private readLoopPromise: Promise<void> | null = null; // Для persistentStream
  private stopReadLoop: (() => void) | null = null; // Для persistentStream

  private constructor() {
    // Используем единые настройки по умолчанию
    this.config = {
      baudRate: EQUIPMENT_DEFAULTS.scale.baudRate,
      dataBits: EQUIPMENT_DEFAULTS.scale.dataBits,
      stopBits: EQUIPMENT_DEFAULTS.scale.stopBits,
      parity: EQUIPMENT_DEFAULTS.scale.parity,
      connectionStrategy: EQUIPMENT_DEFAULTS.scale.connectionStrategy,
    };
  }

  public static getInstance(): ScaleService {
    if (!ScaleService.instance) {
      ScaleService.instance = new ScaleService();
    }
    return ScaleService.instance;
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
            // { usbVendorId: 0x1a86, usbProductId: 0x7523 }, // CH340
            // { usbVendorId: 0x067b, usbProductId: 0x2303 }, // Prolific
            // { usbVendorId: 0x0403, usbProductId: 0x6001 }  // FTDI
          // ]
        });
      }

      console.log(`🔧 ScaleService: Відкриваємо порт з налаштуваннями ВТА-60 (${this.config.baudRate}-${this.config.dataBits}${this.config.parity.charAt(0).toUpperCase()}${this.config.stopBits})`);

      // Відкриваємо порт з налаштуваннями для ВТА-60
      try {
        if (this.port.readable || this.port.writable) {
          console.log('⚠️ ScaleService: Порт уже открыт, но в другом состоянии. Попытка переоткрытия...');
          await this.disconnect(); // Попытка закрыть перед открытием
        }
        await this.port.open({
          baudRate: this.config.baudRate,
          dataBits: this.config.dataBits,
          stopBits: this.config.stopBits,
          parity: this.config.parity,
          bufferSize: 1024
        });
      } catch (openError) {
        if (openError.message.includes('port is already open')) {
          console.log('⚠️ ScaleService: Порт вже відкритий, використовуємо існуюче з\'єднання');
          // Порт уже открыт, считаем что подключение успешно
        } else {
          throw openError; // Перебрасываем другие ошибки
        }
      }

      this.isConnected = true;
      console.log('✅ ScaleService: Ваги ВТА-60 успішно підключені');

      // Запускаем постоянный цикл чтения, если выбран соответствующий режим
      if (this.config.connectionStrategy === 'persistentStream') {
        this.readLoopPromise = this.startReadLoop();
      }

      return true;
    } catch (error) {
      console.log('❌ ScaleService: Не вдалося підключити ваги:', error);
      this.port = null; // Очищаем порт при ошибке
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
    if (!this.port || !this.isConnected || !this.port.readable) return null;

    // Проверяем, не заблокирован ли поток
    if (this.port.readable.locked) {
      console.log('⚠️ ScaleService: ReadableStream is locked, skipping read');
      return null;
    }

    this.reader = this.port.readable.getReader();

    try {
      const start = performance.now();
      const buf: number[] = [];

      while (performance.now() - start < timeoutMs) {
        const { value, done } = await this.reader.read();
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
      if (this.reader) {
        this.reader.releaseLock();
        this.reader = undefined;
      }
    }
  }

  // Отправка запроса «00 00 03» протокола ВТА-60
  private async sendPoll(): Promise<void> {
    if (!this.port || !this.isConnected) {
      throw new Error('Scale is not connected');
    }

    // Проверяем, не заблокирован ли поток записи
    if (this.port.writable?.locked) {
      console.log('⚠️ ScaleService: WritableStream is locked, skipping write');
      return;
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
    if (!this.isConnected || this.isReading) return null;

    this.isReading = true;
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
      const now = new Date();
      const timeStr = now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const uptimeSec = Math.floor((now.getTime() - performance.timeOrigin) / 1000);
      
      // Детальная диагностика ошибки
      const errorInfo = {
        timestamp: now.toISOString(),
        timeStr,
        uptimeSec,
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'Unknown',
          stack: error instanceof Error ? error.stack : undefined
        },
        connectionState: {
          isConnected: this.isConnected,
          portExists: !!this.port,
          readableLocked: this.port?.readable?.locked || false,
          writableLocked: this.port?.writable?.locked || false,
          isReading: this.isReading
        },
        config: this.config
      };
      
      console.error(`❌ ScaleService: Детальная ошибка чтения [${timeStr}, +${uptimeSec}s]:`, errorInfo);

      // Анализ типа ошибки для диагностики
      if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('device has been lost')) {
          console.log('🔌 ScaleService: Устройство физически отключено');
        } else if (msg.includes('closed stream')) {
          console.log('🔌 ScaleService: Поток был закрыт');
        } else if (msg.includes('timeout') || msg.includes('тайм-аут')) {
          console.log('⏱️ ScaleService: Таймаут - весы не отвечают');
        } else if (msg.includes('locked')) {
          console.log('🔒 ScaleService: Поток заблокирован другим процессом');
        } else if (msg.includes('not connected')) {
          console.log('🔌 ScaleService: Нет активного соединения');
        } else if (msg.includes('permission denied')) {
          console.log('🚫 ScaleService: Нет прав доступа к порту');
        } else if (msg.includes('busy')) {
          console.log('🔄 ScaleService: Порт занят другим процессом');
        } else {
          console.log('❓ ScaleService: Неизвестная ошибка:', error.message);
        }
      }

      // Реализация стратегии "reconnectOnError"
      if (this.config.connectionStrategy === 'reconnectOnError') {
        const errorMessage = error instanceof Error ? error.message : '';
        if (errorMessage.includes('device has been lost') || errorMessage.includes('closed stream')) {
          console.log('🔄 reconnectOnError: Обнаружена потеря соединения, попытка переподключения...');
          this.handleConnectionLoss();
        }
      }

      return null;
    } finally {
      this.isReading = false;
    }
  }

  // Обработчик потери соединения для автоматического переподключения
  private async handleConnectionLoss(): Promise<void> {
    if (!this.isConnected) return;

    console.log('🔌 ScaleService: Соединение потеряно. Попытка автоматического переподключения...');
    await this.disconnect();

    // Пауза перед переподключением
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const reconnected = await this.connect(true); // autoConnect = true
      if (reconnected) {
        console.log('✅ ScaleService: Успешно переподключено к весам.');
      } else {
        console.log('❌ ScaleService: Не удалось автоматически переподключиться.');
      }
    } catch (error) {
      console.error('❌ ScaleService: Ошибка при попытке переподключения:', error);
    }
  }

  // --- Логика для режима "persistentStream" ---
  private async startReadLoop(): Promise<void> {
    console.log('🌀 persistentStream: Запуск постоянного цикла чтения...');

    let shouldStop = false;
    this.stopReadLoop = () => {
      shouldStop = true;
      if (this.reader) {
        this.reader.cancel().catch(() => {});
      }
    };

    while (!shouldStop && this.isConnected) {
      if (!this.port?.readable) {
        console.log('🌀 persistentStream: Port not readable, stopping loop.');
        await this.handleConnectionLoss();
        continue;
      }

      this.reader = this.port.readable.getReader();
      const buffer: number[] = [];

      try {
        while (!shouldStop) {
          const { value, done } = await this.reader.read();
          if (done || shouldStop) {
            break;
          }

          if (value) {
            for (const b of value) buffer.push(b);
            this.onRawData?.(value);

            while (buffer.length >= 18) {
              const frame = new Uint8Array(buffer.splice(0, 18));
              const scaleData = this.parseFrame(frame);
              if (scaleData) {
                this.onWeightChange?.(scaleData);
              }
            }
          }
        }
      } catch (error) {
        console.error('🌀 persistentStream: Ошибка в цикле чтения:', error);
        if (!shouldStop) {
          await this.handleConnectionLoss();
        }
      } finally {
        if (this.reader) {
          this.reader.releaseLock();
          this.reader = undefined;
        }
      }
    }
    console.log('🌀 persistentStream: Цикл чтения остановлен.');
  }

  private parseFrame(frame: Uint8Array): VTAScaleData | null {
    try {
      const m = frame.slice(0, 6);
      const c = frame.slice(6, 12);
      const v = frame.slice(12, 18);

      const massKg = this.formatMassFromDigits(m, 3);
      const price = this.formatPriceFromDigits(c, 2);
      const total = this.formatTotalFromDigits(v, 2);

      return {
        weight: massKg,
        unit: 'kg',
        isStable: true,
        timestamp: new Date(),
        price,
        total,
        rawData: frame,
      };
    } catch (error) {
      console.error('❌ Ошибка парсинга кадра:', error, frame);
      return null;
    }
  }

  // Принудительное освобождение всех reader'ов и writer'ов
  private forceUnlockStreams(): void {
    try {
      if (this.port?.readable?.locked) {
        console.log('🔓 ScaleService: Принудительно освобождаем ReadableStream');
        // Попытка получить reader и сразу освободить его
        const reader = this.port.readable.getReader();
        reader.releaseLock();
      }
      if (this.port?.writable?.locked) {
        console.log('🔓 ScaleService: Принудительно освобождаем WritableStream');
        // Попытка получить writer и сразу освободить его
        const writer = this.port.writable.getWriter();
        writer.releaseLock();
      }
    } catch (error) {
      console.log('⚠️ ScaleService: Ошибка при принудительном освобождении потоков:', error);
    }
  }

  // Відключення від ваг
  public async disconnect(): Promise<void> {
    try {
      // Останавливаем цикл чтения для persistentStream
      if (this.stopReadLoop) {
        this.stopReadLoop();
        if (this.readLoopPromise) {
          await this.readLoopPromise;
        }
        this.stopReadLoop = null;
        this.readLoopPromise = null;
      }

      if (this.reader) {
        try {
          // Отменяем чтение и ждем завершения промиса
          const cancelPromise = this.reader.cancel();
          // Добавляем таймаут на случай зависания cancel()
          await Promise.race([cancelPromise, new Promise(resolve => setTimeout(resolve, 500))]);
        } catch (error) {
          console.log('ScaleService: Error cancelling reader on disconnect.', error);
        } finally {
          this.reader = undefined;
        }
      }

      if (this.port) {
        // Принудительно освобождаем потоки, если они заблокированы
        this.forceUnlockStreams();

        if (this.port.readable || this.port.writable) {
          try {
            await this.port.close();
            console.log('🔧 ScaleService: Порт успешно закрыт');
          } catch (error) {
            console.log('ScaleService: Error closing port on disconnect.', error);
          }
        } else {
          console.log('🔧 ScaleService: Порт уже был закрыт');
        }
      }
    } catch (error) {
      console.error('Error during scale disconnect:', error);
    } finally {
      this.port = null;
      this.isConnected = false;
      console.log('Scale disconnected');
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

    // В режиме persistentStream мы не читаем данные напрямую, а только отправляем запрос
    if (this.config.connectionStrategy === 'persistentStream') {
      try {
        console.log('🌀 persistentStream: Отправка запроса на вес...');
        await this.sendPoll();
        // Данные придут через onWeightChange, поэтому здесь возвращаем null
        // или можно вернуть последнее известное значение, если оно хранится
        return null;
      } catch (error) {
        console.error('🌀 persistentStream: Ошибка отправки запроса:', error);
        await this.handleConnectionLoss();
        return null;
      }
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
    const oldStrategy = this.config.connectionStrategy;
    this.config = { ...this.config, ...newConfig };

    // Если стратегия изменилась, нужно переподключиться
    if (newConfig.connectionStrategy && newConfig.connectionStrategy !== oldStrategy) {
      console.log(`🔄 Стратегия подключения изменена на: ${newConfig.connectionStrategy}. Требуется переподключение.`);
      if (this.isConnected) {
        this.disconnect().then(() => this.connect(true));
      }
    }
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
        // НЕ отключаемся после теста - оставляем соединение активным
        // await this.disconnect(); // ← УБРАНО: не отключаемся после теста
        return testData !== null;
      }
      return false;
    } catch (error) {
      console.error('Scale connection test failed:', error);
      return false;
    }
  }

}

export default ScaleService;
