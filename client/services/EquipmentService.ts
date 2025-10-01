import { EQUIPMENT_DEFAULTS } from '../../shared/constants/equipmentDefaults.js';

export interface EquipmentStatus {
  isConnected: boolean;
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
    connectionStrategy?: 'legacy' | 'reconnectOnError' | 'persistentStream';
  } | null;
  scanner: {
    autoConnect: boolean;
    timeout: number;
    scanTimeout?: number;
  };
  printer?: {
    enabled: boolean;
    name: string;
  };
}

export class EquipmentService {
  private static instance: EquipmentService;
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


  // Підключення до ваг
  public async connectScale(): Promise<boolean> {

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

    try {
      // TODO: Implement real scale reading
      return {
        weight: 0,
        unit: 'kg',
        isStable: false,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Failed to read weight:', error);
      throw error;
    }
  }

  // Отримання даних зі сканера
  public async getBarcode(): Promise<BarcodeData> {

    try {
      // TODO: Implement real scanner reading
      return {
        code: '',
        type: 'Unknown',
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Failed to read barcode:', error);
      throw error;
    }
  }


  // Статус обладнання
  public getStatus(): EquipmentStatus {
    return {
      isConnected: this.scaleConnection || this.scannerConnection,
      lastActivity: new Date(),
      error: null
    };
  }

  // Тестування з'єднання
  public async testConnection(): Promise<{ scale: boolean; scanner: boolean }> {


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
