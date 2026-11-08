import type { CatalogLossEntry } from './production.js';
import type { CatalogGoodComponentDto } from './catalog.js';

/** Звідки взялась версія специфікації. */
export const CATALOG_SPEC_VERSION_SOURCES = ['initial', 'ui', 'dilovod', 'rollback'] as const;
export type CatalogSpecVersionSource = (typeof CATALOG_SPEC_VERSION_SOURCES)[number];

export const CATALOG_SPEC_VERSION_SOURCE_LABELS: Record<CatalogSpecVersionSource, string> = {
  initial: 'Початкова',
  ui: 'Backoffice',
  dilovod: 'Dilovod',
  rollback: 'Відкат',
};

export type CatalogSpecDraftStatus = 'pending' | 'rejected';

/** Рядок специфікації, що зберігається в чернетці / версії (з назвою на момент запису). */
export interface CatalogSpecComponent {
  componentGoodId: string;
  name: string;
  sku: string | null;
  qty: number;
  rowNum: number;
  unitId: string | null;
  note: string | null;
  cookingLossPercent: number;
  /** Розбивка втрат за типами (з фази 1 техкарт); відсутня в старих версіях */
  losses?: CatalogLossEntry[] | null;
}

export interface CatalogSpecContent {
  specQty: number | null;
  components: CatalogSpecComponent[];
}

/** Вміст специфікації у форматі картки товару (для завантаження в редактор BOM). */
export interface CatalogSpecContentDetail {
  specQty: number | null;
  components: CatalogGoodComponentDto[];
}

export interface CatalogSpecDraftDto extends CatalogSpecContentDetail {
  goodId: string;
  baseVersion: number;
  status: CatalogSpecDraftStatus;
  comment: string;
  restoredFromVersion: number | null;
  authorId: number | null;
  authorName: string | null;
  lastEditedById: number | null;
  lastEditedByName: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
  /** Затверджену специфікацію змінено після створення чернетки. */
  stale: boolean;
}

export interface CatalogSpecVersionDto extends CatalogSpecContentDetail {
  id: number;
  goodId: string;
  version: number;
  source: CatalogSpecVersionSource;
  comment: string | null;
  authorName: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface CatalogSpecStateDto {
  goodId: string;
  currentVersion: number | null;
  /** Чинна версія: джерело, коли і ким затверджено. */
  current: {
    version: number;
    source: CatalogSpecVersionSource;
    at: string;
    byName: string | null;
  } | null;
  draft: CatalogSpecDraftDto | null;
  /** Після нової версії склад / КБЖВ в описі можуть не відповідати специфікації. */
  contentReviewPending: boolean;
}

export interface CatalogSpecDraftListItem {
  goodId: string;
  goodName: string;
  goodSku: string | null;
  status: CatalogSpecDraftStatus;
  comment: string;
  authorName: string | null;
  updatedAt: string;
}

export interface CatalogSpecDraftInput {
  specQty?: number | null;
  components: Array<{
    componentGoodId: string;
    qty: number;
    rowNum?: number;
    unitId?: string | null;
    note?: string | null;
    cookingLossPercent?: number | null;
    losses?: CatalogLossEntry[] | null;
  }>;
  comment: string;
}

/** Коди помилок API модерації (поле `code` у відповіді). */
export const CATALOG_SPEC_ERROR_CODES = {
  COMMENT_REQUIRED: 'SPEC_COMMENT_REQUIRED',
  DRAFT_EXISTS: 'SPEC_DRAFT_EXISTS',
  DRAFT_STALE: 'SPEC_DRAFT_STALE',
  NO_CHANGES: 'SPEC_NO_CHANGES',
} as const;
