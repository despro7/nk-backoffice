import { BarcodeData } from './EquipmentService';

export interface ScannerConfig {
  autoConnect: boolean;
  timeout: number;
  continuousMode: boolean;
}

export interface ScannerEvent {
  type: 'connected' | 'disconnected' | 'data' | 'error';
  data?: BarcodeData;
  error?: string;
}

export class BarcodeScannerService {
  private isConnected: boolean = false;
  private config: ScannerConfig;
  private eventListeners: ((event: ScannerEvent) => void)[] = [];
  private keyboardListener: ((event: KeyboardEvent) => void) | null = null;
  private buffer: string = '';
  private lastScanTime: number = 0;
  private scanTimeout: number = 100; // мс між символами для визначення кінця сканування

  constructor() {
    this.config = {
      autoConnect: true,
      timeout: 5000,
      continuousMode: true
    };

    // Автоматичне підключення при створенні
    if (this.config.autoConnect) {
      this.connect();
    }
  }

  // Підключення до сканера
  public async connect(): Promise<boolean> {
    try {
      // Для USB сканера MC-200PT використовуємо емуляцію клавіатури
      // Сканер діє як HID пристрій і надсилає символи як натискання клавіш
      
      this.setupKeyboardListener();
      this.isConnected = true;
      
      this.emitEvent({ type: 'connected' });
      // console.log('Barcode scanner connected (keyboard emulation mode)');
      
      return true;
    } catch (error) {
      // console.error('Failed to connect to barcode scanner:', error);
      this.emitEvent({ 
        type: 'error', 
        error: `Failed to connect: ${error}` 
      });
      return false;
    }
  }

  // Відключення від сканера
  public async disconnect(): Promise<void> {
    try {
      this.removeKeyboardListener();
      this.isConnected = false;
      this.buffer = '';
      
      this.emitEvent({ type: 'disconnected' });
      console.log('Barcode scanner disconnected');
    } catch (error) {
      console.error('Error disconnecting scanner:', error);
    }
  }

  // Налаштування слухача клавіатури для сканера
  private setupKeyboardListener(): void {
    this.keyboardListener = (event: KeyboardEvent) => {
      // Перевіряємо чи це сканер (швидкі символи)
      const currentTime = Date.now();
      
      if (currentTime - this.lastScanTime < this.scanTimeout) {
        // Це частина сканування
        if (event.key === 'Enter') {
          // Кінець сканування
          this.processScannedCode();
        } else if (event.key.length === 1) {
          // Додаємо символ до буфера
          this.buffer += event.key;
        }
      } else {
        // Новий початок сканування
        this.buffer = '';
        if (event.key.length === 1) {
          this.buffer += event.key;
        }
      }
      
      this.lastScanTime = currentTime;
    };

    document.addEventListener('keydown', this.keyboardListener);
  }

  // Видалення слухача клавіатури
  private removeKeyboardListener(): void {
    if (this.keyboardListener) {
      document.removeEventListener('keydown', this.keyboardListener);
      this.keyboardListener = null;
    }
  }

  // Обробка відсканованого коду
  private processScannedCode(): void {
    if (this.buffer.trim()) {
      const barcodeData: BarcodeData = {
        code: this.buffer.trim(),
        type: this.detectBarcodeType(this.buffer.trim()),
        timestamp: new Date()
      };

      console.log('Barcode scanned:', barcodeData);
      
      // Відправляємо подію
      this.emitEvent({ 
        type: 'data', 
        data: barcodeData 
      });

      // Очищаємо буфер
      this.buffer = '';
    }
  }

  // Визначення типу штрих-коду
  private detectBarcodeType(code: string): string {
    // EAN-13 (13 цифр)
    if (/^\d{13}$/.test(code)) {
      return 'EAN-13';
    }
    
    // EAN-8 (8 цифр)
    if (/^\d{8}$/.test(code)) {
      return 'EAN-8';
    }
    
    // UPC-A (12 цифр)
    if (/^\d{12}$/.test(code)) {
      return 'UPC-A';
    }
    
    // Code-128 (букви та цифри)
    if (/^[A-Z0-9]+$/.test(code)) {
      return 'Code-128';
    }
    
    // Code-39 (букви, цифри та спецсимволи)
    if (/^[A-Z0-9\-\.\/\+\s]+$/.test(code)) {
      return 'Code-39';
    }
    
    // QR Code (може містити будь-які символи)
    if (code.length > 20 && /[а-яА-Я]/.test(code)) {
      return 'QR-Code';
    }
    
    // Якщо не вдалося визначити
    return 'Unknown';
  }

  // Симуляція сканування (для тестування)
  public simulateScan(code?: string): BarcodeData {
    const testCodes = [
      '1234567890123', // EAN-13
      '12345678',      // EAN-8
      '123456789012',  // UPC-A
      'ABC123456789',  // Code-128
      'ABC-123.45',    // Code-39
      'https://example.com/product/123', // QR-like
      'PROD-2024-001', // Custom product
      'BOX-001'        // Box code
    ];

    const selectedCode = code || testCodes[Math.floor(Math.random() * testCodes.length)];
    
    const barcodeData: BarcodeData = {
      code: selectedCode,
      type: this.detectBarcodeType(selectedCode),
      timestamp: new Date()
    };

    // Відправляємо подію
    this.emitEvent({ 
      type: 'data', 
      data: barcodeData 
    });

    return barcodeData;
  }

  // Додавання слухача подій
  public addEventListener(callback: (event: ScannerEvent) => void): void {
    this.eventListeners.push(callback);
  }

  // Видалення слухача подій
  public removeEventListener(callback: (event: ScannerEvent) => void): void {
    const index = this.eventListeners.indexOf(callback);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  // Відправка події всім слухачам
  private emitEvent(event: ScannerEvent): void {
    this.eventListeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in scanner event listener:', error);
      }
    });
  }

  // Перевірка з'єднання
  public isScannerConnected(): boolean {
    return this.isConnected;
  }

  // Отримання поточного буфера
  public getCurrentBuffer(): string {
    return this.buffer;
  }

  // Очищення буфера
  public clearBuffer(): void {
    this.buffer = '';
  }

  // Оновлення конфігурації
  public updateConfig(newConfig: Partial<ScannerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // Отримання конфігурації
  public getConfig(): ScannerConfig {
    return { ...this.config };
  }

  // Тестування з'єднання
  public async testConnection(): Promise<boolean> {
    try {
      const result = await this.connect();
      if (result) {
        // Симулюємо сканування для тесту
        setTimeout(() => {
          this.simulateScan();
        }, 100);
        
        // Відключаємося через 2 секунди
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

  // Отримання статистики сканування
  public getStats(): { totalScans: number; lastScan: Date | null } {
    // Це проста реалізація, можна розширити
    return {
      totalScans: this.eventListeners.length > 0 ? 1 : 0, // Приблизна оцінка
      lastScan: this.lastScanTime > 0 ? new Date(this.lastScanTime) : null
    };
  }
}

export default BarcodeScannerService;
