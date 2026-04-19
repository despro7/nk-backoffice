export interface WarehouseMovementItem {
  sku: string;
  boxQuantity: number;
  portionQuantity: number;
  batchNumber: string;
}

export interface WarehouseMovement {
  id: number;
  draftCreatedAt: Date;
  draftLastEditedAt: Date;
  sentToDilovodAt?: Date;
  internalDocNumber: string;
  items: WarehouseMovementItem[];
  status: 'draft' | 'sent' | 'confirmed' | 'cancelled';
  sourceWarehouse: string;
  destinationWarehouse: string;
  notes?: string;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWarehouseMovementRequest {
  items: WarehouseMovementItem[];
  sourceWarehouse: string;
  destinationWarehouse: string;
  notes?: string;
  movementDate?: string;
  docNumber?: string;
  dilovodDocId?: string;
}

export interface UpdateWarehouseMovementRequest {
  items?: WarehouseMovementItem[];
  status?: WarehouseMovement['status'];
  notes?: string;
}
