/**
 * Internal types for Products 2.0 Dilovod gateway / local sync.
 */

import type {
  CatalogCreateGoodInput,
  CatalogGoodBarcodeDto,
  CatalogGoodComponentDto,
  CatalogGoodPriceDto,
  CatalogUpdateGoodInput,
} from '../../../shared/types/catalog.js';

export {
  CATALOG_TRASH_ID,
  CATALOG_DEFAULT_MAIN_UNIT_ID,
  CATALOG_ACC_POLICY_GOOD,
  CATALOG_ACC_POLICY_KIT,
} from '../../../shared/types/catalog.js';

export interface DilovodCatalogGoodRow {
  id: string;
  name: string;
  sku: string | null;
  parent: string | null;
  isGroup: boolean;
  delMark: boolean;
  mainUnitId: string | null;
  packageRatio: number | null;
  weight: number | null;
  accPolicyId: string | null;
  printName: string | null;
  description: string | null;
}

export interface DilovodUnitRow {
  id: string;
  name: string;
  code: string | null;
}

export interface DilovodGoodHeaderPayload {
  id: string;
  name: { uk: string; ru: string };
  productNum?: string;
  parent?: string | null;
  isGroup?: number | boolean;
  mainUnit?: string;
  packageRatio?: number | string;
  weight?: number | string;
  accPolicy?: string;
  printName?: string | { uk: string; ru: string };
  description?: string;
  [key: string]: unknown;
}

export interface DilovodTpGoodsRow {
  rowNum?: number;
  good: string;
  qty: number | string;
  unit?: string;
}

export interface DilovodSaveGoodParams {
  header: DilovodGoodHeaderPayload;
  tableParts?: {
    tpGoods?: DilovodTpGoodsRow[];
  };
}

export interface DilovodSaveResult {
  id: string;
  code?: string;
  error?: string;
  [key: string]: unknown;
}

export interface LocalSyncGoodPayload {
  id: string;
  parentId: string | null;
  isGroup: boolean;
  delMark: boolean;
  name: string;
  sku: string | null;
  mainUnitId: string | null;
  packageRatio: number | null;
  weight: number | null;
  accPolicyId: string | null;
  printName: string | null;
  description: string | null;
  components?: Array<{ componentGoodId: string; qty: number; rowNum: number }>;
  prices?: Array<{ priceType: string; price: number; currency?: string | null }>;
  barcodes?: Array<{
    code: string;
    activity: boolean;
    dilovodRegisterId?: string | null;
    goodPart?: string | null;
    goodPartName?: string | null;
  }>;
}

export type CreateGoodInput = CatalogCreateGoodInput;
export type UpdateGoodInput = CatalogUpdateGoodInput;
export type ComponentInput = CatalogGoodComponentDto;
export type PriceInput = CatalogGoodPriceDto;
export type BarcodeInput = CatalogGoodBarcodeDto;

export function isKitAccPolicy(accPolicyId: string | null | undefined): boolean {
  return accPolicyId === '1201200000001031';
}

export function extractUkName(name: unknown): string {
  if (typeof name === 'string') return name;
  if (name && typeof name === 'object') {
    const n = name as { uk?: string; ru?: string; pr?: string };
    return n.uk || n.ru || n.pr || '';
  }
  return '';
}

export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

export function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    return value === '1' || value.toLowerCase() === 'true';
  }
  return false;
}
