import { EQUIPMENT_DEFAULTS } from '../../shared/constants/equipmentDefaults.js';

export interface EquipmentStatus {
  isConnected: boolean;
  isSimulationMode: boolean;
  lastActivity: Date | null;
  error: string | null;
}

export interface ScaleData {
  weight: number; // в кг
  unit: string;
  isStable: boolean;
  timestamp: Date;
}

export interface BarcodeData {
  code: string;
  type: string;
  timestamp: Date;
}

export interface EquipmentConfig {
  connectionType: 'local' | 'simulation';
  scale: {
    baudRate: number;
    dataBits: number;
    stopBits: number;
    parity: 'none' | 'even' | 'odd';
    autoConnect: boolean;
    activePollingInterval: number; // ms
    reservePollingInterval: number; // ms
    activePollingDuration: number; // ms
    maxPollingErrors: number;
    weightCacheDuration: number; // ms
    weightThresholdForActive?: number; // kg
  } | null;
  scanner: {
    autoConnect: boolean;
    timeout: number;
    scanTimeout?: number;
  };
  simulation: {
    enabled: boolean;
    weightRange: { min: number; max: number };
    scanDelay: number;
    weightDelay: number;
  };
}

export class EquipmentService {
  private static instance: EquipmentService;
  private isSimulationMode: boolean = false; // По умолчанию local режим
  private scaleConnection: any = null;
  private scannerConnection: any = null;
  private config: EquipmentConfig;

  private constructor() {
    // Используем единые настройки по умолчанию
    this.config = {
      ...EQUIPMENT_DEFAULTS
    };
  }

  public static getInstance(): EquipmentService {
    if (!EquipmentService.instance) {
      EquipmentService.instance = new EquipmentService();
    }
    return EquipmentService.instance;
  }

  // Конфігурація
  public getConfig(): EquipmentConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<EquipmentConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // Режим симуляції
  public setSimulationMode(enabled: boolean): void {
    this.isSimulationMode = enabled;
    if (enabled) {
      this.disconnectScale();
      this.disconnectScanner();
    }
  }

  public isSimulationModeEnabled(): boolean {
    return this.isSimulationMode;
  }

  // Встановлення типу підключення
  public setConnectionType(type: 'local' | 'simulation'): void {
    this.config.connectionType = type;
    this.isSimulationMode = type === 'simulation';

    if (type === 'simulation') {
      this.disconnectScale();
      this.disconnectScanner();
    }
  }

  public getConnectionType(): 'local' | 'simulation' {
    return this.config.connectionType;
  }

  // Підключення до ваг
  public async connectScale(): Promise<boolean> {
    if (this.isSimulationMode) {
      console.log('Scale connection skipped - simulation mode enabled');
      return true;
    }

    try {
      // Тут буде логіка підключення через Web Serial API
      console.log('Connecting to scale...');
      // TODO: Implement Web Serial API connection
      return true;
    } catch (error) {
      console.error('Failed to connect to scale:', error);
      return false;
    }
  }

  public async disconnectScale(): Promise<void> {
    if (this.scaleConnection) {
      // TODO: Close connection
      this.scaleConnection = null;
    }
  }

  // Підключення до сканера
  public async connectScanner(): Promise<boolean> {
    if (this.isSimulationMode) {
      console.log('Scanner connection skipped - simulation mode enabled');
      return true;
    }

    try {
      console.log('Connecting to scanner...');
      // TODO: Implement scanner connection
      return true;
    } catch (error) {
      console.error('Failed to connect to scanner:', error);
      return false;
    }
  }

  public async disconnectScanner(): Promise<void> {
    if (this.scannerConnection) {
      // TODO: Close connection
      this.scannerConnection = null;
    }
  }

  // Отримання даних з ваг
  public async getWeight(): Promise<ScaleData> {
    if (this.isSimulationMode) {
      return this.simulateWeight();
    }

    try {
      // TODO: Implement real scale reading
      return this.simulateWeight();
    } catch (error) {
      console.error('Failed to read weight:', error);
      throw error;
    }
  }

  // Отримання даних зі сканера
  public async getBarcode(): Promise<BarcodeData> {
    if (this.isSimulationMode) {
      return this.simulateBarcode();
    }

    try {
      // TODO: Implement real scanner reading
      return this.simulateBarcode();
    } catch (error) {
      console.error('Failed to read barcode:', error);
      throw error;
    }
  }

  // Симуляція ваг
  private simulateWeight(): ScaleData {
    const weight = this.config.simulation.weightRange.min + 
      Math.random() * (this.config.simulation.weightRange.max - this.config.simulation.weightRange.min);
    
    return {
      weight: Math.round(weight * 1000) / 1000, // Округлення до 3 знаків після коми
      unit: 'kg',
      isStable: Math.random() > 0.1, // 90% шанс стабільної ваги
      timestamp: new Date()
    };
  }

  // Симуляція сканера
  private simulateBarcode(): BarcodeData {
    const testCodes = [
      '1234567890123', // EAN-13
      'ABC123456789',  // Code-128
      'QR123456789',   // QR-like
      'TEST001',       // Custom
      'PROD2024'       // Product code
    ];

    const randomCode = testCodes[Math.floor(Math.random() * testCodes.length)];
    
    return {
      code: randomCode,
      type: this.detectBarcodeType(randomCode),
      timestamp: new Date()
    };
  }

  // Визначення типу штрих-коду
  private detectBarcodeType(code: string): string {
    if (code.length === 13 && /^\d+$/.test(code)) {
      return 'EAN-13';
    } else if (code.length === 12 && /^\d+$/.test(code)) {
      return 'EAN-12';
    } else if (/^[A-Z0-9]+$/.test(code)) {
      return 'Code-128';
    } else {
      return 'Custom';
    }
  }

  // Статус обладнання
  public getStatus(): EquipmentStatus {
    return {
      isConnected: !this.isSimulationMode && (this.scaleConnection || this.scannerConnection),
      isSimulationMode: this.isSimulationMode,
      lastActivity: new Date(),
      error: null
    };
  }

  // Тестування з'єднання
  public async testConnection(): Promise<{ scale: boolean; scanner: boolean }> {
    if (this.config.connectionType === 'simulation') {
      return { scale: true, scanner: true };
    }


    // Локальне підключення
    const scaleResult = await this.connectScale();
    const scannerResult = await this.connectScanner();

    return {
      scale: scaleResult,
      scanner: scannerResult
    };
  }
}

export default EquipmentService;
