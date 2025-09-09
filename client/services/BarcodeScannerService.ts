import { BarcodeData } from './EquipmentService';

export interface ScannerConfig {
  autoConnect: boolean;
  timeout: number;
  continuousMode: boolean;
  scanTimeout?: number;
}

export interface ScannerEvent {
  type: 'connected' | 'disconnected' | 'data' | 'error';
  data?: BarcodeData;
  error?: string;
}

export class BarcodeScannerService {
  private static instance: BarcodeScannerService | null = null;
  private isConnected: boolean = false;
  private config: ScannerConfig;
  private eventListeners: ((event: ScannerEvent) => void)[] = [];
  private keyboardListener: ((event: KeyboardEvent) => void) | null = null;
  private buffer: string = '';
  private lastScanTime: number = 0;
  private scanTimeout: number = 500;
  private endScanTimer: NodeJS.Timeout | null = null;
  private lastScanTimestamp: number = 0;

  // Singleton метод для получения инстанса
  public static getInstance(): BarcodeScannerService {
    if (!BarcodeScannerService.instance) {
      BarcodeScannerService.instance = new BarcodeScannerService();
    }
    return BarcodeScannerService.instance;
  }

  // Метод для сброса singleton (только для тестирования)
  public static resetInstance(): void {
    if (BarcodeScannerService.instance) {
      BarcodeScannerService.instance.disconnect();
      BarcodeScannerService.instance = null;
    }
  }

  private constructor() {
    this.config = {
      autoConnect: true,
      timeout: 5000,
      continuousMode: true,
      scanTimeout: 500
    };

    if (this.config.scanTimeout !== undefined) {
      this.scanTimeout = this.config.scanTimeout;
    }

    // Первый код всегда обрабатывается
    this.lastScanTimestamp = Date.now() - 3000;

    if (this.config.autoConnect) {
      this.connect();
    }
  }

  public async connect(): Promise<boolean> {
    try {
      // Если уже подключены, не подключаемся повторно
      if (this.isConnected) {
        return true;
      }

      this.setupKeyboardListener();
      this.isConnected = true;
      this.emitEvent({ type: 'connected' });

      return true;
    } catch (error) {
      this.emitEvent({
        type: 'error',
        error: `Failed to connect: ${error}`
      });
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      this.removeKeyboardListener();
      this.isConnected = false;
      this.buffer = '';

      if (this.endScanTimer) {
        clearTimeout(this.endScanTimer);
        this.endScanTimer = null;
      }

      this.emitEvent({ type: 'disconnected' });
    } catch (error) {
      console.error('Error disconnecting scanner:', error);
    }
  }

  private setupKeyboardListener(): void {
    // Сначала удаляем существующий listener если он есть
    if (this.keyboardListener) {
      document.removeEventListener('keydown', this.keyboardListener);
    }

    this.keyboardListener = (event: KeyboardEvent) => {
      // Дополнительная проверка: обрабатываем только keydown события
      if (event.type !== 'keydown') {
        return;
      }

      // Игнорируем модификаторы и специальные клавиши
      if (event.ctrlKey || event.altKey || event.metaKey ||
          event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt' ||
          event.key === 'Meta' || event.key === 'CapsLock' || event.key === 'NumLock' ||
          event.key === 'ScrollLock' || event.key === 'Pause' || event.key === 'Insert' ||
          event.key === 'Delete' || event.key === 'Home' || event.key === 'End' ||
          event.key === 'PageUp' || event.key === 'PageDown' || event.key.length > 1) {
        return;
      }

      // ПРОВЕРКА НА ДУБЛИРОВАНИЕ: если событие уже обработано, игнорируем
      if ((event as any)._barcodeProcessed) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`🚫 [BarcodeScanner] Event already processed, ignoring: '${event.key}'`);
        }
        return;
      }
      (event as any)._barcodeProcessed = true;


      const currentTime = Date.now();

      if (currentTime - this.lastScanTime < this.scanTimeout) {
        // Продолжаем сканирование
        if (event.key === 'Enter' || event.key === 'Tab' || event.key === 'Return') {
          this.processScannedCode();
        } else {
          this.buffer += event.key;

          if (this.buffer.length >= 3) {
            if (this.endScanTimer) {
              clearTimeout(this.endScanTimer);
            }
            this.endScanTimer = setTimeout(() => {
              if (this.buffer.length >= 3 && this.buffer.trim()) {
                this.processScannedCode();
              }
            }, this.scanTimeout * 1.5);
          }
        }
      } else {
        // Новый скан - полный сброс состояния
        if (this.endScanTimer) {
          clearTimeout(this.endScanTimer);
          this.endScanTimer = null;
        }

        // Полный сброс буфера и всех связанных переменных
        this.buffer = '';
        this.buffer += event.key;


        this.endScanTimer = setTimeout(() => {
          if (this.buffer.length >= 3 && this.buffer.trim()) {
            this.processScannedCode();
          }
        }, this.scanTimeout * 1.5);
      }

      this.lastScanTime = currentTime;
    };

    document.addEventListener('keydown', this.keyboardListener);
  }

  private removeKeyboardListener(): void {
    if (this.keyboardListener) {
      document.removeEventListener('keydown', this.keyboardListener);
      this.keyboardListener = null;
    }

    if (this.endScanTimer) {
      clearTimeout(this.endScanTimer);
      this.endScanTimer = null;
    }
  }

  private processScannedCode(): void {
    if (this.buffer.trim()) {
      let cleanCode = this.buffer.trim();
      if (cleanCode.endsWith('\n') || cleanCode.endsWith('\r')) {
        cleanCode = cleanCode.slice(0, -1).trim();
      }
      if (cleanCode.endsWith('\t')) {
        cleanCode = cleanCode.slice(0, -1).trim();
      }

      if (cleanCode.length >= 3 && cleanCode.length <= 50) {
        const currentTime = Date.now();

        // ПРОСТАЯ ЛОГИКА: если прошло меньше 2 секунд, игнорируем
        if (currentTime - this.lastScanTimestamp < 2000) {
          this.buffer = '';
          return;
        }

        // Фильтруем слишком длинные коды
        if (cleanCode.length > 20) {
          this.buffer = '';
          return;
        }

        const barcodeData: BarcodeData = {
          code: cleanCode,
          type: this.detectBarcodeType(cleanCode),
          timestamp: new Date()
        };


        this.lastScanTimestamp = currentTime;

        this.emitEvent({
          type: 'data',
          data: barcodeData
        });
      } else {
        this.buffer = '';
      }

      this.buffer = '';
    }
  }

  private detectBarcodeType(code: string): string {
    if (/^\d{13}$/.test(code)) return 'EAN-13';
    if (/^\d{8}$/.test(code)) return 'EAN-8';
    if (/^\d{12}$/.test(code)) return 'UPC-A';
    if (/^[A-Z0-9]+$/.test(code)) return 'Code-128';
    if (/^[A-Z0-9\-\.\/\+\s]+$/.test(code)) return 'Code-39';
    if (code.length > 20 && /[а-яА-Я]/.test(code)) return 'QR-Code';
    return 'Unknown';
  }

  public simulateScan(code?: string): BarcodeData {
    const testCodes = [
      '1234567890123', '12345678', '123456789012',
      'ABC123456789', 'ABC-123.45', 'PROD-2024-001', 'BOX-001'
    ];

    const selectedCode = code || testCodes[Math.floor(Math.random() * testCodes.length)];

    const barcodeData: BarcodeData = {
      code: selectedCode,
      type: this.detectBarcodeType(selectedCode),
      timestamp: new Date()
    };

    this.emitEvent({
      type: 'data',
      data: barcodeData
    });

    return barcodeData;
  }

  public addEventListener(callback: (event: ScannerEvent) => void): void {
    this.eventListeners.push(callback);
  }

  public removeEventListener(callback: (event: ScannerEvent) => void): void {
    const index = this.eventListeners.indexOf(callback);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  private emitEvent(event: ScannerEvent): void {
    this.eventListeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in scanner event listener:', error);
      }
    });
  }

  public isScannerConnected(): boolean {
    return this.isConnected;
  }

  public getCurrentBuffer(): string {
    return this.buffer;
  }

  public clearBuffer(): void {
    this.buffer = '';
  }

  public updateConfig(newConfig: Partial<ScannerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.scanTimeout !== undefined) {
      this.scanTimeout = newConfig.scanTimeout;
    }
  }

  public getConfig(): ScannerConfig {
    return { ...this.config };
  }

  public async testConnection(): Promise<boolean> {
    try {
      const result = await this.connect();
      if (result) {
        setTimeout(() => {
          this.simulateScan();
        }, 100);

        setTimeout(() => {
          this.disconnect();
        }, 2000);
      }
      return result;
    } catch (error) {
      console.error('Scanner connection test failed:', error);
      return false;
    }
  }

  public getStats(): { totalScans: number; lastScan: Date | null } {
    return {
      totalScans: this.eventListeners.length > 0 ? 1 : 0,
      lastScan: this.lastScanTime > 0 ? new Date(this.lastScanTime) : null
    };
  }

  // Принудительный сброс состояния сканера (для отладки)
  public resetScannerState(): void {
    this.buffer = '';
    this.lastScanTime = 0;
    this.lastScanTimestamp = Date.now() - 3000; // Чтобы следующий скан прошел

    if (this.endScanTimer) {
      clearTimeout(this.endScanTimer);
      this.endScanTimer = null;
    }
  }
}

export default BarcodeScannerService;