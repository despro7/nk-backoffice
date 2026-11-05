import type { AuditFieldChange, AuditLogDto } from './audit.js';

/** Скалярні поля товару, що відстежуються журналом. Ключ = поле в `CatalogGood` (або похідне *Name). */
export type CatalogAuditScalar = string | number | boolean | null;

export interface CatalogAuditComponentRow {
  componentGoodId: string;
  name: string;
  sku: string | null;
  qty: number;
  unitId: string | null;
  note: string | null;
  cookingLossPercent: number;
}

export interface CatalogAuditBarcodeRow {
  code: string;
  goodPart: string;
  goodPartName: string | null;
  kind: string;
  activity: boolean;
}

export interface CatalogAuditImageRow {
  id: number;
  name: string;
  isPrimary: boolean;
}

/** Знімок товару для порівняння «до / після». */
export interface CatalogGoodAuditSnapshot {
  id: string;
  fields: Record<string, CatalogAuditScalar>;
  components: CatalogAuditComponentRow[];
  /** priceType → price */
  prices: Record<string, number>;
  barcodes: CatalogAuditBarcodeRow[];
  images: CatalogAuditImageRow[];
}

export interface CatalogAuditComponentChange {
  componentGoodId: string;
  name: string;
  sku: string | null;
  from: Partial<CatalogAuditComponentRow>;
  to: Partial<CatalogAuditComponentRow>;
}

/** payload запису журналу для entityType = catalog_good. */
export interface CatalogGoodAuditPayload {
  /** Назва й артикул на момент запису (щоб показувати в загальному журналі без join). */
  goodName?: string;
  goodSku?: string | null;
  /** Скалярні поля + ціни (`price:<priceTypeId>`). */
  changes?: AuditFieldChange[];
  components?: {
    added: CatalogAuditComponentRow[];
    removed: CatalogAuditComponentRow[];
    changed: CatalogAuditComponentChange[];
  };
  barcodes?: {
    added: CatalogAuditBarcodeRow[];
    removed: CatalogAuditBarcodeRow[];
    changed: Array<{ code: string; from: Partial<CatalogAuditBarcodeRow>; to: Partial<CatalogAuditBarcodeRow> }>;
  };
  images?: {
    added: string[];
    removed: string[];
    reordered?: boolean;
    primary?: { from: string | null; to: string | null };
  };
  /** Довільний контекст дії (версія наліпки, кількість обʼєктів масової дії тощо). */
  meta?: Record<string, unknown>;
}

export type CatalogGoodAuditLogDto = AuditLogDto & { payload: CatalogGoodAuditPayload | null };

/** Дії журналу товару. */
export const CATALOG_AUDIT_ACTIONS = {
  CREATED: 'created',
  UPDATED: 'updated',
  DUPLICATED: 'duplicated',
  MOVED: 'moved',
  TYPE_CHANGED: 'type_changed',
  ARCHIVED: 'archived',
  RESTORED: 'restored',
  TRASHED: 'trashed',
  IMAGES_CHANGED: 'images_changed',
  LABEL_TEMPLATE_CHANGED: 'label_template_changed',
  LABEL_PUBLISHED: 'label_published',
  STOREFRONT_PULL: 'storefront_pull',
  DILOVOD_PULL: 'dilovod_pull',
  DILOVOD_SYNC: 'dilovod_sync',
  LEGACY_FIELD_CHANGED: 'legacy_field_changed',
} as const;

export type CatalogAuditAction = (typeof CATALOG_AUDIT_ACTIONS)[keyof typeof CATALOG_AUDIT_ACTIONS];
