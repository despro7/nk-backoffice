import type { WarehouseDocumentKind } from '../utils/warehouseDocumentKind.js';

export interface WarehouseDilovodObjectSnapshot {
  header: Record<string, unknown>;
  tableParts: {
    tpGoods?: Record<string, Record<string, unknown>>;
  };
  misc?: Record<string, unknown>;
}

export interface WarehouseDocumentEditShipmentOrder {
  id: number;
  externalId: string;
  orderNumber: string;
  orderDate?: string | null;
  readyToShipAt?: string | null;
  quantity?: number | null;
  sajt?: string | null;
  customerName?: string | null;
  status?: string | null;
  totalPrice?: number | null;
  shippingMethod?: string | null;
  paymentMethod?: string | null;
  ttn?: string | null;
  dilovodDocId?: string | null;
  dilovodSaleExportDate?: string | null;
  payloadData?: unknown;
  rawData?: unknown;
  items?: unknown;
}

export interface WarehouseDocumentEditContextResponse {
  kind: WarehouseDocumentKind;
  dilovodDocumentId: string;
  documentLabel: string;
  dilovod: WarehouseDilovodObjectSnapshot | null;
  local: {
    movementDilovodDocId?: string | null;
    writeOffHistoryId?: number | null;
    surplusHistoryId?: number | null;
    releaseSetId?: number | null;
    returnHistoryId?: number | null;
  };
  /** Повний запис історії backoffice для beginEdit (якщо знайдено). */
  localRecord?: Record<string, unknown> | null;
  shipmentOrder?: WarehouseDocumentEditShipmentOrder | null;
}
