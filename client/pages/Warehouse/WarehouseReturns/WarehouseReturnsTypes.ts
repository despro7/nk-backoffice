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
  quantity: number;
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
