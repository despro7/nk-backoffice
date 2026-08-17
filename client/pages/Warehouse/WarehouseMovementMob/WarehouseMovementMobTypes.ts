// ---------------------------------------------------------------------------
// Types for WarehouseMovementMob
// ---------------------------------------------------------------------------

export type MovementMobDbStatus = 'draft' | 'active' | 'finalized';

export type MovementMobScreenMode = 'formation' | 'view';

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
  batchNumber: string;
  boxQuantity: number;
  portionQuantity: number;
  totalPortions: number;
  weight: number | null;
  portionsPerBox: number | null;
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
