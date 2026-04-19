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
  internalDocNumber: string; // Порядковий номер з ведучими нулями (00001, 00002, etc.)
  docNumber?: string | null;     // Номер документа від Діловода (після відправки)
  dilovodDocId?: string | null;  // ID документа в Діловоді (для редагування)
  items: WarehouseMovementItem[];
  deviations?: WarehouseMovementDeviation[];
  status: 'draft' | 'sent' | 'confirmed' | 'cancelled';
  sourceWarehouse: string;
  destinationWarehouse: string;
  notes?: string;
  createdBy: number;
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
