import { WarehouseMovementItem, WarehouseMovementDeviation, WarehouseMovement, StockMovementHistory, CreateWarehouseMovementRequest, UpdateWarehouseMovementRequest } from '../../types/warehouse.js';
import type { GoodMovingDocument, GoodMovingFilter, MovementHistoryResponse } from '../../../shared/types/movement.js';

// Додаткові типи для Warehouse модуля

export interface StockUpdateResult {
  previousStock: Record<string, number>;
  newStock: Record<string, number>;
  sourceBalance: number;
  destBalance: number;
  movedPortions: number;
}

export interface WarehouseMapping {
  [key: string]: string; // Наприклад, "Основний склад": "1"
}

export interface CreateStockMovementHistoryParams {
  sku: string;
  sourceWarehouse: string;
  destinationWarehouse: string;
  movedPortions: number;
  boxQuantity: number;
  portionQuantity: number;
  batchNumber?: string;
  movementId: number;
  userId: number;
  stockUpdateResult: StockUpdateResult;
}

export interface RevertStockMovementParams {
  sku: string;
  sourceWarehouse: string;
  destinationWarehouse: string;
  portionsToReturn: number;
  movementId: number;
  userId: number;
}

/**
 * Параметри для отримання історії переміщень
 */
export interface GetMovementHistoryParams {
  storageId?: string; // ID складу-донора (з settings_base: dilovod_main_storage_id)
  storageToId?: string; // ID складу-реципієнта (з settings_base: dilovod_small_storage_id)
  fromDate?: string; // Дата від (ISO: "2026-01-01 00:00:00")
  toDate?: string; // Дата по (ISO: "2026-01-31 23:59:59"); якщо не передано — без обмеження
  remark?: string; // Пошук за примітками (опціонально)
}

// Реекспорт існуючих типів для зручності
export type {
  WarehouseMovementItem,
  WarehouseMovementDeviation,
  WarehouseMovement,
  StockMovementHistory,
  CreateWarehouseMovementRequest,
  UpdateWarehouseMovementRequest,
  GoodMovingDocument,
  GoodMovingFilter,
  MovementHistoryResponse
};