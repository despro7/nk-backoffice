// ---------------------------------------------------------------------------
// Types for WarehouseMovementMob
// ---------------------------------------------------------------------------

export type MovementMobDbStatus = 'draft' | 'active' | 'finalized';

export type MovementMobScreenMode = 'formation' | 'view';

export type MovementMobEditorMode = 'empty' | 'formation' | 'view';

export type MovementMobBarcodeKind = 'portion' | 'box';

export type MovementMobStepperStepKey = 'prepared' | 'sent' | 'received';

export type MovementMobStepperStepState = 'done' | 'pending';

export interface MovementMobRawItem {
  sku: string;
  productName: string;
  boxQuantity?: number;
  portionQuantity?: number;
  totalPortions?: number;
  batchNumber?: string;
  batchId?: string;
  batchStorage?: string;
  forecast?: number;
  barcode?: string;
  barcodeKind?: MovementMobBarcodeKind;
}

export interface MovementMobApiRecord {
  id: number;
  internalDocNumber: string;
  docNumber: string | null;
  dilovodDocId: string | null;
  status: MovementMobDbStatus | string;
  sourceWarehouse: string;
  destinationWarehouse: string;
  notes: string | null;
  items: string | MovementMobRawItem[];
  movementDate: string | null;
  draftCreatedAt: string;
  draftLastEditedAt: string;
  sentToDilovodAt: string | null;
  lastSentToDilovodAt: string | null;
  createdBy: number;
  createdByName?: string | null;
}

export interface MovementMobAggregates {
  totalBoxes: number;
  totalLoosePortions: number;
  totalPortions: number;
  lineCount: number;
}

export interface MovementMobStepperStep {
  key: MovementMobStepperStepKey;
  label: string;
  state: MovementMobStepperStepState;
}

export interface MovementMobListCardViewModel {
  id: number;
  displayNumber: string;
  displayDateTime: string;
  sourceStorageId: string;
  destStorageId: string;
  sourceBadge: string;
  destBadge: string;
  aggregates: MovementMobAggregates;
  stepperSteps: MovementMobStepperStep[];
  status: MovementMobDbStatus | string;
}

export interface MovementMobProductMeta {
  weight: number | null;
  portionsPerBox: number | null;
}

export interface MovementMobProductLineViewModel {
  key: string;
  sku: string;
  productName: string;
  batchId: string;
  batchNumber: string;
  boxQuantity: number;
  portionQuantity: number;
  totalPortions: number;
  weight: number | null;
  portionsPerBox: number | null;
  barcode?: string;
  barcodeKind?: MovementMobBarcodeKind;
}

/** Відповідь GET /api/warehouse/product-by-barcode — дзеркало WarehouseProductByBarcodeResponse. */
export interface MovementMobProductByBarcode {
  sku: string;
  name: string;
  weight: number | null;
  portionsPerBox: number;
  barcode: string;
  barcodeKind: MovementMobBarcodeKind;
  batchId: string | null;
  batchNumber: string | null;
}

export interface MovementMobStockBreakdown {
  portions: number;
  boxes: number;
  loosePortions: number;
}

export interface MovementMobScanDraft {
  sku: string;
  name: string;
  weight: number | null;
  portionsPerBox: number;
  barcode: string;
  barcodeKind: MovementMobBarcodeKind;
  batchId: string;
  batchNumber: string;
  boxes: number;
  portions: number;
  sourceStock: MovementMobStockBreakdown;
  destStock: MovementMobStockBreakdown;
}

export interface MovementMobChronologyEvent {
  key: string;
  occurredAt: string;
  title: string;
  userName: string | null;
  state: 'done' | 'pending';
}

export interface MovementMobDocumentViewModel {
  id: number;
  displayNumber: string;
  status: MovementMobDbStatus | string;
  mode: MovementMobScreenMode;
  sourceStorageId: string;
  destStorageId: string;
  lines: MovementMobProductLineViewModel[];
  aggregates: MovementMobAggregates;
  chronology: MovementMobChronologyEvent[];
  createdByName: string | null;
}
