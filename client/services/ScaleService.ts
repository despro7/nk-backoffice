import { ScaleData } from './EquipmentService';
import { EQUIPMENT_DEFAULTS } from '../../shared/constants/equipmentDefaults.js';
import { LoggingService } from './LoggingService';

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
  private lastWeightData: VTAScaleData | null = null; // Последние данные весов для persistentStream
  private cancelCurrentOperation: (() => void) | null = null; // Функция для отмены текущей операции

  private shouldLog(): boolean {
    try {
      return process.env.NODE_ENV === 'development' && localStorage.getItem('scaleDebug') === '1';
    } catch {
      return process.env.NODE_ENV === 'development';
    }
  }

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
        LoggingService.equipmentLog('⚠️ ScaleService: Web Serial API не підтримується в цьому браузері');
        return false;
      }

      // Проверяем, не подключены ли уже
      if (this.isConnected && this.port) {
        LoggingService.equipmentLog('🔧 ScaleService: Ваги вже підключені');
        return true;
      }

      LoggingService.equipmentLog('🔧 ScaleService: Запрашиваем доступ к COM порту...');

      // При автоматическом подключении пытаемся найти сохраненный порт
      if (autoConnect) {
        try {
          const ports = await navigator.serial.getPorts();
          LoggingService.equipmentLog('🔧 ScaleService: Найдено сохраненных портов:', ports.length);

          if (ports.length > 0) {
            // Используем первый доступный порт
            this.port = ports[0];
            LoggingService.equipmentLog('🔧 ScaleService: Используем сохраненный порт');
          } else {
            LoggingService.equipmentLog('⚠️ ScaleService: Сохраненных портов не найдено, требуется ручной выбор');
            return false;
          }
        } catch (error) {
          LoggingService.equipmentLog('⚠️ ScaleService: Не удалось получить сохраненные порты:', error);
          return false;
        }
      } else {
        // Ручной выбор порта
        this.port = await navigator.serial.requestPort({
          filters: [
            // { usbVendorId: 0x1a86, usbProductId: 0x7523 }, // CH340
            // { usbVendorId: 0x067b, usbProductId: 0x2303 }, // Prolific
            // { usbVendorId: 0x0403, usbProductId: 0x6001 }  // FTDI
          ]
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
      LoggingService.equipmentLog('✅ ScaleService: Ваги ВТА-60 успішно підключені');

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
    let validDigits = 0;
    
    for (let i = 5; i >= 0; i--) { // разворот разрядов: m6..m1
      const d = bytes6[i] & 0x0F;
      if (d > 9) {
        // Если встретили не-цифру, но уже есть валидные цифры, останавливаемся
        if (validDigits > 0) break;
        return NaN; // защита от мусора
      }
      str += d.toString();
      validDigits++;
    }
    
    // Если нет валидных цифр, возвращаем 0
    if (validDigits === 0) return 0;
    
    // Удалим лидирующие нули, но оставим хотя бы один
    str = str.replace(/^0+(?!$)/, '');
    return Number(str);
  }

  // Помощник: сборка числа из 5 «цифробайтів» 0x00..0x09, младшие разряды первыми
  private digits5ToNumber(bytes5: Uint8Array): number {
    // bytes5: [m1,m2,m3,m4,m5] где m1 — младший разряд
    let str = '';
    let validDigits = 0;
    
    for (let i = 4; i >= 0; i--) { // разворот разрядов: m5..m1
      const d = bytes5[i] & 0x0F;
      if (d > 9) {
        // Если встретили не-цифру, но уже есть валидные цифры, останавливаемся
        if (validDigits > 0) break;
        return NaN; // защита от мусора
      }
      str += d.toString();
      validDigits++;
    }
    
    // Если нет валидных цифр, возвращаем 0
    if (validDigits === 0) return 0;
    
    // Удалим лидирующие нули, но оставим хотя бы один
    str = str.replace(/^0+(?!$)/, '');
    return Number(str);
  }

  // Расстановка десятичной точки для массы (ВТА-60 обычно 3 знака после точки для кг)
  private formatMassFromDigits(bytes6: Uint8Array, decimals: number = 3): number {
    const raw = this.digits6ToNumber(bytes6); // например 1234
    const factor = Math.pow(10, decimals);
    const result = raw / factor; // кг
    
    // Проверка на нестабильность: если вес больше 1000 кг, возможно точка сдвинута
    if (result > 1000) {
      // Попробуем сдвинуть точку на один разряд влево
      const adjustedResult = raw / Math.pow(10, decimals + 1);
      if (adjustedResult < 1000 && adjustedResult > 0) {
        return adjustedResult;
      }
    }
    
    return result;
  }

  // Расстановка десятичной точки для цены
  private formatPriceFromDigits(bytes6: Uint8Array, decimals: number = 2): number {
    const raw = this.digits6ToNumber(bytes6);
    const result = raw / Math.pow(10, decimals);
    
    // Дополнительная проверка: если цена больше 999.99, считаем это ошибкой парсинга
    if (result > 999.99) {
      return 0;
    }
    
    return result;
  }

  // Расстановка десятичной точки для суммы
  private formatTotalFromDigits(bytes5: Uint8Array, decimals: number = 2): number {
    const raw = this.digits5ToNumber(bytes5);
    const result = raw / Math.pow(10, decimals);
    
    // Дополнительная проверка: если сумма больше 9999.99, считаем это ошибкой парсинга
    if (result > 9999.99) {
      return 0;
    }
    
    return result;
  }

  // Чтение одного ответа (18 байт) протокола ВТА-60 с таймаутом и отменой
  private async readOneFrame(timeoutMs: number = 1000): Promise<Uint8Array | null> {
    if (!this.port || !this.isConnected || !this.port.readable) {
      console.log('⚠️ ScaleService: Port not available for reading');
      return null;
    }

    // Проверяем, не заблокирован ли поток
    if (this.port.readable.locked) {
      console.log('⚠️ ScaleService: ReadableStream is locked, attempting to recover...');
      
      // Если у нас есть активный reader, пытаемся его освободить
      if (this.reader) {
        try {
          // Отменяем чтение и освобождаем поток
          await this.reader.cancel();
          this.reader.releaseLock();
        } catch (e) {
          console.log('⚠️ ScaleService: Error releasing locked reader:', e);
        } finally {
          this.reader = undefined;
        }
      }
      
      // Если поток все еще заблокирован, возвращаем null
      if (this.port.readable.locked) {
        console.log('⚠️ ScaleService: ReadableStream still locked after recovery attempt');
        return null;
      }
    }

    // Создаем новый reader
    try {
      this.reader = this.port.readable.getReader();
    } catch (e) {
      console.log('⚠️ ScaleService: Failed to get reader:', e);
      return null;
    }
    
    // Флаг для отмены операции
    let cancelled = false;
    
    // Функция для отмены операции
    const cancelOperation = () => {
      cancelled = true;
      if (this.reader) {
        this.reader.cancel().catch(() => {}); // Игнорируем ошибки отмены
      }
    };
    
    // Сохраняем функцию отмены для внешнего использования
    this.cancelCurrentOperation = cancelOperation;

    try {
      const start = performance.now();
      const buf: number[] = [];

      // Создаем промис, который разрешится при получении данных или по таймауту
      return new Promise<Uint8Array | null>((resolve, reject) => {
        // Таймер для таймаута
        const timeoutId = setTimeout(() => {
          console.log('⏱️ ScaleService: Read timeout reached');
          cancelOperation();
          resolve(null);
        }, timeoutMs);

        // Функция для чтения данных
        const readChunk = async () => {
          // Проверяем, не отменена ли операция
          if (cancelled) {
            clearTimeout(timeoutId);
            console.log('ℹ️ ScaleService: Read operation was cancelled');
            resolve(null);
            return;
          }

          // Проверяем, не истекло ли время
          if (performance.now() - start >= timeoutMs) {
            console.log('⏱️ ScaleService: Read operation timeout');
            cancelOperation();
            resolve(null);
            return;
          }

          try {
            // Проверяем, есть ли reader
            if (!this.reader) {
              clearTimeout(timeoutId);
              console.log('⚠️ ScaleService: Reader is not available');
              resolve(null);
              return;
            }
            
            const { value, done } = await this.reader.read();
            
            // Проверяем, не отменена ли операция после await
            if (cancelled) {
              clearTimeout(timeoutId);
              console.log('ℹ️ ScaleService: Read operation was cancelled after await');
              resolve(null);
              return;
            }
            
            if (done) {
              clearTimeout(timeoutId);
              console.log('ℹ️ ScaleService: Read operation completed (done=true)');
              resolve(null);
              return;
            }
            
            if (value) {
              for (const b of value) buf.push(b);
              // Ищем минимум 18 байт подряд — в этом протоколе нет заголовка, просто 18 «цифробайтів»
              while (buf.length >= 18) {
                clearTimeout(timeoutId);
                const frame = buf.splice(0, 18); // возьмём первые 18
                if (this.shouldLog()) {
                  console.log('✅ ScaleService: Successfully read 18-byte frame');
                }
                resolve(new Uint8Array(frame));
                return;
              }
            }
            
            // Продолжаем чтение с небольшой задержкой для предотвращения блокировки
            setTimeout(readChunk, 5);
          } catch (error) {
            clearTimeout(timeoutId);
            if (!cancelled) {
              // Логируем только критические ошибки
              if (!error.message?.includes('Releasing Default reader') && 
                  !error.message?.includes('reader') &&
                  error.name !== 'TypeError') {
                console.error('❌ ScaleService: Critical error reading frame:', error);
              }
            }
            resolve(null);
          }
        };

        // Начинаем чтение
        readChunk();
      });
    } finally {
      // Освобождаем reader
      if (this.reader) {
        try {
          // Проверяем, заблокирован ли reader перед освобождением
          this.reader.releaseLock();
          if (this.shouldLog()) {
            console.log('✅ ScaleService: Reader successfully released');
          }
        } catch (e) {
          console.log('⚠️ ScaleService: Error releasing reader in finally block:', e);
        }
        this.reader = undefined;
      }
      // Очищаем функцию отмены
      this.cancelCurrentOperation = null;
    }
  }

  // Отправка команды тарувания «00 00 01» протокола ВТА-60
  public async tare(): Promise<boolean> {
    if (!this.port || !this.isConnected) {
      console.log('⚠️ ScaleService: Весы не подключены для команды Tare');
      return false;
    }

    // Проверяем, не заблокирован ли поток записи
    if (this.port.writable?.locked) {
      console.log('⚠️ ScaleService: WritableStream заблокирован для команды Tare');
      return false;
    }

    try {
      const writer = this.port.writable?.getWriter();
      if (!writer) {
        console.log('⚠️ ScaleService: Не удалось получить writer для команды Tare');
        return false;
      }

      console.log('⚖️ ScaleService: Отправляем команду Tare (00 00 01)');
      
      // Добавляем таймаут для операции записи
      const writePromise = writer.write(new Uint8Array([0x00, 0x00, 0x01]));
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => {
          try {
            writer.releaseLock();
          } catch (e) {
            console.log('⚠️ ScaleService: Ошибка освобождения writer при таймауте Tare:', e);
          }
          reject(new Error('Таймаут при отправке команды Tare'));
        }, 2000)
      );
      
      // Ждем завершения записи или таймаута
      await Promise.race([writePromise, timeoutPromise]);
      
      // Освобождаем writer
      writer.releaseLock();
      
      console.log('✅ ScaleService: Команда Tare отправлена успешно');
      return true;
      
    } catch (error) {
      console.error('❌ ScaleService: Ошибка при отправке команды Tare:', error);
      return false;
    }
  }

  // Отправка запроса «00 00 03» протокола ВТА-60
  private async sendPoll(): Promise<void> {
    if (!this.port || !this.isConnected) {
      throw new Error('Scale is not connected');
    }

    // Проверяем, не заблокирован ли поток записи
    if (this.port.writable?.locked) {
      console.log('⚠️ ScaleService: WritableStream is locked, attempting to recover...');
      
      // Простое решение - ждем немного и пытаемся снова
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Если поток все еще заблокирован, выбрасываем ошибку
      if (this.port.writable?.locked) {
        // Пробуем принудительно освободить
        try {
          const writer = this.port.writable.getWriter();
          writer.releaseLock();
          console.log('✅ ScaleService: WritableStream unlocked successfully');
        } catch (e) {
          console.log('⚠️ ScaleService: Failed to unlock WritableStream:', e);
          throw new Error('WritableStream is locked, cannot send poll request');
        }
      }
    }

    try {
      const writer = this.port.writable?.getWriter();
      if (!writer) throw new Error('Failed to get writer');

      // Добавляем таймаут для операции записи
      const writePromise = writer.write(new Uint8Array([0x00, 0x00, 0x03]));
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => {
          try {
            writer.releaseLock();
          } catch (e) {
            console.log('⚠️ ScaleService: Error releasing writer on timeout:', e);
          }
          reject(new Error('Timeout while writing to scale'));
        }, 2000)
      );
      
      // Ждем завершения записи или таймаута
      await Promise.race([writePromise, timeoutPromise]);
      
      // Освобождаем writer только если операция завершена успешно
      writer.releaseLock();
      if (this.shouldLog()) {
        console.log('✅ ScaleService: Poll request sent successfully');
      }
    } catch (error) {
      console.error('Error sending poll to scale:', error);
      
      // Если ошибка связана с блокировкой, пытаемся освободить поток
      if (error.message.includes('locked')) {
        this.forceUnlockStreams();
      }
      
      throw error;
    }
  }

  // Полный цикл: опрос или ожидание автопередачи, парсинг кадра
  public async readScaleOnce(usePolling: boolean = true): Promise<VTAScaleData | null> {
    // Проверяем, не выполняется ли уже чтение
    if (this.isReading) {
      console.log('⚠️ ScaleService: Read operation already in progress');
      // Ждем немного и пробуем снова
      await new Promise(resolve => setTimeout(resolve, 100));
      // Если все еще читаем, возвращаем null
      if (this.isReading) {
        return null;
      }
    }

    if (!this.isConnected) {
      return null;
    }

    this.isReading = true;
    try {
      if (usePolling) {
        await this.sendPoll(); // запрос «масса/цена/сумма»
      }

      // Добавляем таймаут для операции чтения
      const readPromise = this.readOneFrame(3000); // Увеличиваем таймаут до 3 секунд
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => {
          if (this.shouldLog()) {
            console.log('⏱️ ScaleService: Global timeout for readScaleOnce reached');
          }
          // Отменяем текущую операцию чтения
          if (this.cancelCurrentOperation) {
            this.cancelCurrentOperation();
          }
          resolve(null);
        }, 5000); // Глобальный таймаут 5 секунд
      });

      const frame = await Promise.race([readPromise, timeoutPromise]);
      
      if (!frame) {
        // При таймауте возвращаем null для непрерывного режима
        return null;
      }

      // m1..m6 c1..c6 v1..v5 (младшие сначала, последний байт служебный)
      const m = frame.slice(0, 6);
      const c = frame.slice(6, 12);
      const v = frame.slice(12, 17); // Берем только 5 байт для суммы, исключая последний служебный байт

      // Преобразование (скорректируйте decimals под настройки весов)
      const massKg = this.formatMassFromDigits(m, 3);    // кг, три знака после точки
      const price = this.formatPriceFromDigits(c, 2);    // валюта/кг
      const total = this.formatTotalFromDigits(v, 2);    // валюта

      // Проверяем, являются ли данные валидными
      if (isNaN(massKg) || isNaN(price) || isNaN(total)) {
        console.log('⚠️ ScaleService: Invalid data received from scale');
        return null; // Не выбрасываем ошибку, а возвращаем null для непрерывного режима
      }

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

      // Для непрерывного режима не выбрасываем ошибки, а возвращаем null
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

    // Интервал для отправки запросов к весам
    const pollInterval = setInterval(async () => {
      if (shouldStop || !this.isConnected) return;
      
      try {
        await this.sendPoll();
      } catch (error) {
        console.error('🌀 persistentStream: Ошибка отправки запроса:', error);
      }
    }, 1000); // Запрос каждую секунду

    while (!shouldStop && this.isConnected) {
      if (!this.port?.readable) {
        console.log('🌀 persistentStream: Port not readable, stopping loop.');
        clearInterval(pollInterval);
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
          clearInterval(pollInterval);
          await this.handleConnectionLoss();
        }
      } finally {
        if (this.reader) {
          this.reader.releaseLock();
          this.reader = undefined;
        }
      }
    }
    
    clearInterval(pollInterval);
    console.log('🌀 persistentStream: Цикл чтения остановлен.');
  }

  private parseFrame(frame: Uint8Array): VTAScaleData | null {
    try {
      const m = frame.slice(0, 6);
      const c = frame.slice(6, 12);
      const v = frame.slice(12, 17); // Берем только 5 байт для суммы, исключая последний служебный байт

      const massKg = this.formatMassFromDigits(m, 3);
      const price = this.formatPriceFromDigits(c, 2);
      const total = this.formatTotalFromDigits(v, 2);

      // Логирование только при критических ошибках парсинга
      if (isNaN(massKg) || massKg < 0 || massKg > 1000) {
        console.warn('⚠️ ScaleService: Invalid weight detected:', massKg, 'from bytes:', Array.from(m));
      }

      const scaleData = {
        weight: massKg,
        unit: 'kg',
        isStable: true,
        timestamp: new Date(),
        price,
        total,
        rawData: frame,
      };

      // Сохраняем последние данные для persistentStream
      this.lastWeightData = scaleData;

      return scaleData;
    } catch (error) {
      console.error('❌ Ошибка парсинга кадра:', error, frame);
      return null;
    }
  }

  // Принудительное освобождение всех reader'ов и writer'ов
  private forceUnlockStreams(): void {
    try {
      if (this.port?.readable) {
        if (this.port.readable.locked) {
          console.log('🔓 ScaleService: Принудительно освобождаем ReadableStream');
          try {
            // Попытка получить reader и сразу освободить его
            const reader = this.port.readable.getReader();
            reader.releaseLock();
            console.log('✅ ScaleService: ReadableStream successfully unlocked via get/release');
          } catch (e) {
            // Если не удалось получить reader, пытаемся отменить поток
            try {
              const reader = this.port.readable.getReader();
              reader.cancel().then(() => {
                try {
                  reader.releaseLock();
                  console.log('✅ ScaleService: ReadableStream successfully unlocked via cancel/release');
                } catch (e3) {
                  console.log('⚠️ ScaleService: Error releasing reader after cancel:', e3);
                }
              }).catch((e2) => {
                console.log('⚠️ ScaleService: Error cancelling reader:', e2);
                // Просто пытаемся освободить
                try {
                  const reader = this.port.readable.getReader();
                  reader.releaseLock();
                  console.log('✅ ScaleService: ReadableStream unlocked via direct release');
                } catch (e4) {
                  console.log('⚠️ ScaleService: Error releasing reader directly:', e4);
                }
              });
            } catch (e5) {
              console.log('⚠️ ScaleService: Не удалось освободить ReadableStream:', e5);
            }
          }
        } else {
          console.log('ℹ️ ScaleService: ReadableStream is not locked');
        }
      } else {
        console.log('ℹ️ ScaleService: ReadableStream is not available');
      }
      
      if (this.port?.writable) {
        if (this.port.writable.locked) {
          console.log('🔓 ScaleService: Принудительно освобождаем WritableStream');
          try {
            // Попытка получить writer и сразу освободить его
            const writer = this.port.writable.getWriter();
            writer.releaseLock();
            console.log('✅ ScaleService: WritableStream successfully unlocked');
          } catch (e) {
            console.log('⚠️ ScaleService: Не удалось освободить WritableStream:', e);
          }
        } else {
          console.log('ℹ️ ScaleService: WritableStream is not locked');
        }
      } else {
        console.log('ℹ️ ScaleService: WritableStream is not available');
      }
    } catch (error) {
      console.log('⚠️ ScaleService: Ошибка при принудительном освобождении потоков:', error);
    }
  }

  // Відключення від ваг
  public async disconnect(): Promise<void> {
    try {
      
      // Отменяем текущую операцию чтения, если она есть
      if (this.cancelCurrentOperation) {
        this.cancelCurrentOperation();
        this.cancelCurrentOperation = null;
      }

      // Останавливаем цикл чтения для persistentStream
      if (this.stopReadLoop) {
        console.log('🔄 ScaleService: Stopping read loop');
        this.stopReadLoop();
        if (this.readLoopPromise) {
          // Добавляем таймаут для ожидания завершения цикла
          try {
            await Promise.race([
              this.readLoopPromise,
              new Promise(resolve => setTimeout(resolve, 1000))
            ]);
          } catch (e) {
            console.log('⚠️ ScaleService: Error waiting for read loop to stop:', e);
          }
        }
        this.stopReadLoop = null;
        this.readLoopPromise = null;
      }

      // Отменяем reader, если он есть
      if (this.reader) {
        console.log('🔄 ScaleService: Cancelling reader');
        try {
          // Отменяем чтение и ждем завершения промиса
          const cancelPromise = this.reader.cancel();
          // Добавляем таймаут на случай зависания cancel()
          await Promise.race([cancelPromise, new Promise(resolve => setTimeout(resolve, 500))]);
        } catch (error) {
          // Игнорируем ошибки при отключении
        } finally {
          // Принудительно освобождаем reader
          try {
            this.reader.releaseLock();
          } catch (e) {
          }
          this.reader = undefined;
        }
      }

      // Закрываем порт
      if (this.port) {
        console.log('🔄 ScaleService: Closing port');
        // Принудительно освобождаем потоки, если они заблокированы
        this.forceUnlockStreams();

        if (this.port.readable || this.port.writable) {
          try {
            await this.port.close();
          } catch (error) {
            // Игнорируем ошибки закрытия порта
          }
        }
      }
    } catch (error) {
      console.error('❌ ScaleService: Error during scale disconnect:', error);
    } finally {
      this.port = null;
      this.isConnected = false;
      this.isReading = false; // Убедимся, что флаг сброшен
      this.reader = undefined; // Убедимся, что reader очищен
      this.cancelCurrentOperation = null; // Очищаем функцию отмены
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

    // В режиме persistentStream возвращаем последние данные
    if (this.config.connectionStrategy === 'persistentStream') {
      console.log('🌀 persistentStream: Возвращаем последние данные весов');
      return this.lastWeightData;
    }

    if (this.shouldLog()) {
      console.log('🔧 ScaleService: Отправка запроса на получение данных от весов...');
    }

    // Отправляем запрос и ждем ответа
    return await this.readScaleOnce(true);
  }

  // Перевірка з'єднання
  public isScaleConnected(): boolean {
    return this.isConnected;
  }

  // Проверка состояния весов перед тестированием
  public async checkScaleStatus(): Promise<{ connected: boolean; readableLocked: boolean; writableLocked: boolean }> {
    return {
      connected: this.isConnected,
      readableLocked: this.port?.readable?.locked || false,
      writableLocked: this.port?.writable?.locked || false
    };
  }
  
  // Отмена текущей операции чтения
  public cancelCurrentReadOperation(): void {
    console.log('🔄 ScaleService: Attempting to cancel current read operation');
    if (this.cancelCurrentOperation) {
      console.log('🔄 ScaleService: Отмена текущей операции чтения');
      try {
        this.cancelCurrentOperation();
        console.log('✅ ScaleService: Current read operation cancelled successfully');
      } catch (e) {
        console.log('⚠️ ScaleService: Error during cancellation:', e);
      }
      this.cancelCurrentOperation = null;
    } else {
      console.log('ℹ️ ScaleService: Нет активной операции чтения для отмены');
    }
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
      
      // Детальное логирование для диагностики
      const errorInfo = {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : 'UnknownError',
        stack: error instanceof Error ? error.stack : 'No stack trace',
        timestamp: new Date().toISOString(),
        connectionState: {
          isConnected: this.isConnected,
          portExists: !!this.port,
          readableLocked: this.port?.readable?.locked || false,
          writableLocked: this.port?.writable?.locked || false
        }
      };
      
      console.error('🔧 Детальная информация об ошибке тестирования:', errorInfo);
      return false;
    }
  }

  // Принудительный сброс соединения с весами
  public async forceReset(): Promise<boolean> {
    try {
      console.log('🔄 ScaleService: Принудительный сброс соединения с весами');
      
      // Отменяем текущую операцию чтения, если она есть
      if (this.cancelCurrentOperation) {
        console.log('🔄 ScaleService: Отмена текущей операции перед сбросом');
        this.cancelCurrentOperation();
        this.cancelCurrentOperation = null;
      }
      
      // Отключаемся
      await this.disconnect();
      
      // Небольшая задержка
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Подключаемся заново
      const reconnected = await this.connect();
      
      if (reconnected) {
        console.log('✅ ScaleService: Соединение успешно восстановлено после сброса');
        return true;
      } else {
        console.log('❌ ScaleService: Не удалось восстановить соединение после сброса');
        return false;
      }
    } catch (error) {
      console.error('❌ ScaleService: Ошибка при принудительном сбросе соединения:', error);
      return false;
    }
  }
}

export default ScaleService;
