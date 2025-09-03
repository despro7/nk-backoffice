export interface WarehouseMovementItem {
  sku: string;
  boxQuantity: number;
  portionQuantity: number;
  batchNumber: string;
}

export interface WarehouseMovementDeviation {
  sku: string;
  batchNumber: string;
  deviation: number;
}

export interface WarehouseMovement {
  id: number;
  draftCreatedAt: Date;
  draftLastEditedAt: Date;
  sentToDilovodAt?: Date;
  internalDocNumber: string; // Порядковый номер с ведущими нулями (00001, 00002, etc.)
  items: WarehouseMovementItem[];
  deviations?: WarehouseMovementDeviation[];
  status: 'draft' | 'sent' | 'confirmed' | 'cancelled';
  sourceWarehouse: string;
  destinationWarehouse: string;
  notes?: string;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockMovementHistory {
  id: number;
  productSku: string;
  warehouse: string;
  movementType: 'in' | 'out' | 'transfer_in' | 'transfer_out' | 'adjustment';
  quantity: number;
  quantityType: 'box' | 'portion';
  batchNumber?: string;
  referenceId?: string;
  referenceType?: 'order' | 'warehouse_movement' | 'adjustment';
  previousBalance: number;
  newBalance: number;
  movementDate: Date;
  notes?: string;
  createdBy?: number;
}

export interface CreateWarehouseMovementRequest {
  items: WarehouseMovementItem[];
  deviations?: WarehouseMovementDeviation[];
  sourceWarehouse: string;
  destinationWarehouse: string;
  notes?: string;
}

export interface UpdateWarehouseMovementRequest {
  items?: WarehouseMovementItem[];
  deviations?: WarehouseMovementDeviation[];
  status?: WarehouseMovement['status'];
  notes?: string;
}
