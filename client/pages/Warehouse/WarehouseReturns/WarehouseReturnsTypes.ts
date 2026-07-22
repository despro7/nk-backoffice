import { HistoryItemNormalized } from "../shared/historyNormalize";

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
  dynamicMonolithic?: boolean; // Поточні залишки зібраного комплекту на складі
  /** Був відвантажений як моноліт (з payloadData.shipment.bySku) — джерело істини для повернення */
  shippedAsMonolithic?: boolean;
  composition?: Array<string | { name?: string; quantity?: number; unitRatio?: number; sku?: string }>; // Склад монолітного комплекту (для Popover)
}

/** Моноліт для повернення — лише якщо був у payloadData.shipment.bySku при відвантаженні */
export function isMonolithicForReturn(item: Pick<ReturnItem, 'shippedAsMonolithic'>): boolean {
  return Boolean(item.shippedAsMonolithic);
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
  firmDisplayName?: string | null; // Назва фірми, збагачена сервером
  // Optional fields added to track both shipping and receiving firms
  shipFirmId?: string | null;
  shipFirmName?: string | null;
  receiveFirmId?: string | null;
  receiveFirmName?: string | null;
  returnDate?: string | null;
  items: ReturnHistoryItem[];
  itemsNormalized?: HistoryItemNormalized[];
  returnReason: string;
  customReason?: string;
  comment: string;
  payload: Record<string, any>;
  createdAt: string;
  createdBy: string;
  
}
