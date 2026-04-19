import { WarehouseMovementItem, WarehouseMovementDeviation, WarehouseMovement, CreateWarehouseMovementRequest, UpdateWarehouseMovementRequest } from '../../types/warehouse.js';
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
  CreateWarehouseMovementRequest,
  UpdateWarehouseMovementRequest,
  GoodMovingDocument,
  GoodMovingFilter,
  MovementHistoryResponse
};