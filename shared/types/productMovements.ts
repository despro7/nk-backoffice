/**
 * Контракт звіту «Рухи по товару» (Dilovod balanceRegisters.goods).
 */

import type { WarehouseStatementDirectoryItem, WarehouseStatementRegisterShape } from './warehouseStatement.js';

export interface ProductMovementsResolvedShape {
  goodsDimensionName?: string;
  goodPartDimensionName?: string;
  storageDimensionName?: string;
  firmDimensionName?: string;
  businessDimensionName?: string;
  qtyResourceName?: string;
  periodAttributeName?: string;
  recorderAttributeName?: string;
  lineNumberAttributeName?: string;
  recordTypeAttributeName?: string;
}

export interface ProductMovementsMetaResponse {
  shape: WarehouseStatementRegisterShape;
  resolved: ProductMovementsResolvedShape;
  storages: WarehouseStatementDirectoryItem[];
  firms: WarehouseStatementDirectoryItem[];
  filters: {
    good: boolean;
    goodPart: boolean;
    storage: boolean;
    firm: boolean;
  };
}

export interface ProductMovementsQueryRequest {
  goodId?: string;
  sku?: string;
  startDate?: string;
  endDate?: string;
  goodPartId?: string;
  storageId?: string;
  firmId?: string;
}

export interface ProductMovementsProductInfo {
  sku: string;
  name: string;
  dilovodGoodId: string;
}

export interface ProductMovementsLine {
  rowNum: number;
  date: string;
  documentId: string | null;
  documentLabel: string;
  receiptQty: number | null;
  expenseQty: number | null;
  balanceQty: number;
}

export interface ProductMovementsGroup {
  groupKey: string;
  label: string;
  openingBalance: number;
  lines: ProductMovementsLine[];
  totals: {
    receiptQty: number;
    expenseQty: number;
    balanceQty: number;
  };
}

export interface ProductMovementsQueryResponse {
  product: ProductMovementsProductInfo;
  period: { startDate: string; endDate: string };
  groups: ProductMovementsGroup[];
  truncated?: boolean;
  warning?: string;
}
