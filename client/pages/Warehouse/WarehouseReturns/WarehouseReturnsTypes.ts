export interface ReturnBatch {
  id: string;       // унікальний id для UI-рендерингу
  batchId: string;  // ID партії в Dilovod (goodPart)
  batchNumber: string;
  quantity: number; // доступний залишок партії
  storage?: string;
  storageDisplayName?: string;
}

export interface ReturnItem {
  id: string;                   // temp id
  sku: string;
  name: string;
  dilovodId: string | null;
  quantity: number; // поточна (редагована) кількість для повернення
  orderedQuantity: number; // кількість, яка була замовлена (незмінна при редагуванні)
  portionsPerBox: number;
  firmId: string | null;
  availableBatches: ReturnBatch[] | null;
  selectedBatchId: string | null; // actual Dilovod batchId
  selectedBatchKey: string | null; // unique key for UI option
  price: number;
}

export interface ReturnDraft {
  orderId: string;
  orderDisplayId: string;
  dilovodDocId: string;
  firmId: string | null;
  items: ReturnItem[];
  returnReason: string;
  customReason?: string;
  comment: string;
  status: 'draft' | 'completed';
}

// ---------------------------------------------------------------------------
// Types for Return History
// ---------------------------------------------------------------------------

export interface ReturnHistoryItem {
  sku: string;
  name: string;
  quantity: number;
  batchId: string | null;
  batchNumber?: string;
  price: number;
}

export interface ReturnHistoryRecord {
  id: string;
  orderId: number;
  orderNumber: string;
  ttn?: string | null;
  firmId: string | null;
  firmName?: string;
  returnDate?: string | null;
  items: ReturnHistoryItem[];
  returnReason: string;
  customReason?: string;
  comment: string;
  payload: Record<string, any>;
  createdAt: string;
  createdBy: string;
  createdByName?: string | null;
}
