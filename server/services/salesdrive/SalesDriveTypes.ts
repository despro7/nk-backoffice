// Типи та інтерфейси для роботи з SalesDrive API довідників

/**
 * Канал продажів SalesDrive
 */
export interface SalesDriveChannel {
  id: string;
  name: string;
}

/**
 * Метод оплати SalesDrive
 */
export interface SalesDrivePaymentMethod {
  id: number;
  name: string;
}

/**
 * Метод доставки SalesDrive
 */
export interface SalesDriveShippingMethod {
  id: number;
  name: string;
}

/**
 * Статус заявки SalesDrive
 */
export interface SalesDriveStatus {
  id: number;
  name: string;
  type: number;
}

/**
 * Загальний тип відповіді від SalesDrive API для довідників
 */
export interface SalesDriveDirectoryResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
}

/**
 * Типи кешу для різних довідників
 */
export type SalesDriveCacheType = 'channels' | 'paymentMethods' | 'shippingMethods' | 'statuses';

/**
 * Метадані кешу довідника
 */
export interface SalesDriveCacheMetadata {
  lastUpdate: Date | null;
  recordsCount: number;
  dataSource: 'none' | 'api' | 'static' | 'expired';
  isValid: boolean;
}

/**
 * Статус всіх кешів довідників
 */
export interface SalesDriveCacheStatus {
  channels: SalesDriveCacheMetadata;
  paymentMethods: SalesDriveCacheMetadata;
  shippingMethods: SalesDriveCacheMetadata;
  statuses: SalesDriveCacheMetadata;
}