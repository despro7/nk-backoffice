// ---------------------------------------------------------------------------
// Types for WarehouseMovementMob
// ---------------------------------------------------------------------------

export type MovementMobDbStatus = 'draft' | 'active' | 'pending_receipt' | 'finalized' | 'deleted';

export type MovementMobScreenMode = 'formation' | 'receiving' | 'view';

export type MovementMobEditorMode = 'empty' | 'formation' | 'receiving' | 'view';

export type MovementMobActionBar = 'formation' | 'receiving' | 'awaitingReceipt' | 'adminEdit';

/** Який список кількостей редагує адмін у вже отриманому документі. */
export type MovementMobAdminQtySide = 'sent' | 'received';

export type MovementMobBarcodeKind = 'portion' | 'box';

export type MovementMobStepperStepKey = 'prepared' | 'sent' | 'accepted' | 'received';

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
  receivedBoxQuantity?: number;
  receivedPortionQuantity?: number;
  receivedTotalPortions?: number;
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
  deviations?: string | unknown[] | null;
  movementDate: string | null;
  draftCreatedAt: string;
  draftLastEditedAt: string;
  sentToDilovodAt: string | null;
  lastSentToDilovodAt: string | null;
  submittedAt?: string | null;
  receiptScanStartedAt?: string | null;
  receiptScanEndedAt?: string | null;
  receiptScannedBy?: number | null;
  receivedBy?: number | null;
  receivedAt?: string | null;
  createdBy: number;
  createdByName?: string | null;
  receivedByName?: string | null;
  receiptScannedByName?: string | null;
}

export interface MovementMobAggregates {
  totalBoxes: number;
  totalLoosePortions: number;
  totalPortions: number;
  lineCount: number;
}

/** Підсумок прийому для картки списку: отримано vs відправлено. */
export interface MovementMobReceiptSummary {
  receivedBoxes: number;
  receivedLoosePortions: number;
  receivedTotalPortions: number;
  deltaPortions: number;
  matchLines: number;
  shortageLines: number;
  surplusLines: number;
  pendingLines: number;
  shortagePortions: number;
  surplusPortions: number;
}

export interface MovementMobStepperStep {
  key: MovementMobStepperStepKey;
  label: string;
  /** Короткий підпис для вузьких екранів (список документів). */
  shortLabel?: string;
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
  receiptSummary: MovementMobReceiptSummary | null;
  stepperSteps: MovementMobStepperStep[];
  status: MovementMobDbStatus | string;
}

export interface MovementMobProductMeta {
  weight: number | null;
  portionsPerBox: number | null;
}

export interface MovementMobLineStockInfo {
  /** Залишок у поточній партії на складі ГП */
  batchGp: number | null;
  /** Залишок у поточній партії на складі МС */
  batchMs: number | null;
  /** Загальний залишок (усі партії) на ГП */
  totalGp: number;
  /** Загальний залишок (усі партії) на МС */
  totalMs: number;
}

export interface MovementMobLineEnrichmentMeta {
  batchLinked: boolean;
  catalogGoodId: string | null;
  catalogBatchId: string | null;
}

export interface MovementMobProductLineViewModel {
  key: string;
  sku: string;
  productName: string;
  batchId: string;
  batchNumber: string;
  /** Чи привʼязана партія до штрих-коду в каталозі */
  batchLinked?: boolean;
  /** ID товару в каталозі Dilovod (для drawer редагування) */
  catalogGoodId?: string | null;
  boxQuantity: number;
  portionQuantity: number;
  totalPortions: number;
  weight: number | null;
  portionsPerBox: number | null;
  barcode?: string;
  barcodeKind?: MovementMobBarcodeKind;
  receivedBoxQuantity: number;
  receivedPortionQuantity: number;
  receivedTotalPortions: number;
  stock?: MovementMobLineStockInfo;
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
  createdBy: number;
  createdByName: string | null;
  receivedByName: string | null;
}

export type MovementMobReceiptState = 'pending' | 'match' | 'shortage' | 'surplus';
