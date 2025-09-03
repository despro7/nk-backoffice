import { ScaleData } from './EquipmentService';

// Типы для Web Serial API (если не поддерживаются браузером)
declare global {
  interface Navigator {
    serial?: {
      requestPort(options?: { filters?: Array<{ usbVendorId?: number; usbProductId?: number }> }): Promise<SerialPort>;
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

  constructor() {
    this.config = {
      comPort: 'COM4',
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none'
    };

    // Протокол для ваг ВТА-60 (може потребувати налаштування)
    this.protocol = {
      startByte: '\x02', // STX
      endByte: '\x03',   // ETX
      dataLength: 8,
      checksum: false
    };
  }

  // Підключення до ваг через Web Serial API
  public async connect(): Promise<boolean> {
    try {
      // Перевіряємо підтримку Web Serial API
      if (!('serial' in navigator)) {
        throw new Error('Web Serial API не підтримується в цьому браузері');
      }

      // Запитуємо доступ до порту
      this.port = await navigator.serial.requestPort({
        filters: [
          { usbVendorId: 0x1a86, usbProductId: 0x7523 }, // CH340
          { usbVendorId: 0x067b, usbProductId: 0x2303 }, // Prolific
          { usbVendorId: 0x0403, usbProductId: 0x6001 }  // FTDI
        ]
      });

      // Відкриваємо порт з налаштуваннями
      await this.port.open({
        baudRate: this.config.baudRate,
        dataBits: this.config.dataBits,
        stopBits: this.config.stopBits,
        parity: this.config.parity,
        bufferSize: 1024
      });

      this.isConnected = true;
      console.log('Scale connected successfully');

      // Запускаємо читання даних
      this.startReading();

      return true;
    } catch (error) {
      console.error('Failed to connect to scale:', error);
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

    // Шукаємо повні повідомлення
    let startIndex = this.weightBuffer.indexOf(this.protocol.startByte);
    let endIndex = this.weightBuffer.indexOf(this.protocol.endByte);

    while (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      const message = this.weightBuffer.substring(startIndex + 1, endIndex);
      this.parseWeightMessage(message);

      // Видаляємо оброблене повідомлення
      this.weightBuffer = this.weightBuffer.substring(endIndex + 1);
      
      // Шукаємо наступне повідомлення
      startIndex = this.weightBuffer.indexOf(this.protocol.startByte);
      endIndex = this.weightBuffer.indexOf(this.protocol.endByte);
    }

    // Очищаємо буфер якщо він занадто великий
    if (this.weightBuffer.length > 1000) {
      this.weightBuffer = this.weightBuffer.substring(this.weightBuffer.length - 500);
    }
  }

  // Парсинг повідомлення з ваг
  private parseWeightMessage(message: string): void {
    try {
      // Прибираємо зайві символи
      const cleanMessage = message.replace(/[^\d.-]/g, '');
      
      if (cleanMessage) {
        const weight = parseFloat(cleanMessage);
        
        if (!isNaN(weight) && weight >= 0) {
          const scaleData: ScaleData = {
            weight: weight,
            unit: 'kg',
            isStable: true, // ВТА-60 зазвичай передає стабільну вагу
            timestamp: new Date()
          };

          // Викликаємо callback якщо він встановлений
          if (this.onWeightChange) {
            this.onWeightChange(scaleData);
          }

          console.log('Weight received:', scaleData);
        }
      }
    } catch (error) {
      console.error('Error parsing weight message:', error);
    }
  }

  // Встановлення callback для зміни ваги
  public onWeightData(callback: (data: ScaleData) => void): void {
    this.onWeightChange = callback;
  }

  // Отримання поточної ваги
  public async getCurrentWeight(): Promise<ScaleData | null> {
    if (!this.isConnected) {
      throw new Error('Scale is not connected');
    }

    // Для ВТА-60 можемо надіслати команду запиту ваги
    try {
      await this.sendCommand('W'); // Припустимо, що 'W' - команда запиту ваги
      
      // Чекаємо відповідь (можна реалізувати через Promise)
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve(null);
        }, 2000);

        const originalCallback = this.onWeightChange;
        this.onWeightChange = (data: ScaleData) => {
          clearTimeout(timeout);
          this.onWeightChange = originalCallback;
          resolve(data);
        };
      });
    } catch (error) {
      console.error('Error getting current weight:', error);
      return null;
    }
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
}

export default ScaleService;
