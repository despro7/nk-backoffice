// Типи для даних комплектації

export interface OrderChecklistItem {
  id: string;
  name: string;
  quantity: number;
  expectedWeight: number;
  status: 'default' | 'pending' | 'success' | 'error' | 'done' | 'awaiting_confirmation';
  type: 'product' | 'box';
  boxSettings?: any;
  boxCount?: number;
  boxIndex?: number; // Індекс коробки (0, 1, 2...)
  portionsRange?: { start: number; end: number }; // Діапазон порцій для коробки
  portionsPerBox?: number; // Кількість порцій на коробку
  sku?: string; // SKU товару для пошуку по штрих-коду
  barcode?: string; // Штрих-код товару
  manualOrder?: number; // Ручне сортування
}

export interface OrderForAssembly {
  id: string | undefined;
  shipping: {
    carrier: string;
    trackingId: string;
    provider: string;
  };
  items: OrderChecklistItem[];
  totalPortions: number;
}

// Інтерфейс для налаштувань tolerance
export interface ToleranceSettings {
  type: 'percentage' | 'absolute' | 'combined';
  percentage: number;
  absolute: number;
  maxTolerance: number;
  minTolerance: number;
  maxPortions: number;
  minPortions: number;
}

// Типи для налаштувань звуків
export type OrderSoundEvent = 'pending' | 'success' | 'error';

