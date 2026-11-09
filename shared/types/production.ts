import type { CatalogDictItemDto, CatalogGoodDetailDto, CatalogQtyFormula } from './catalog.js';
import type { CatalogSpecStateDto } from './catalogSpec.js';

/** Частка втрат одного типу в рядку специфікації (напр. «Очистка» 32%). */
export interface CatalogLossEntry {
  /** id типу з довідника `production.lossTypes` */
  typeId: number;
  /** 0–100 */
  percent: number;
}

/**
 * Як складати кілька типів втрат у брутто:
 * - `additive`: брутто = нетто / (1 − Σ p)  (як у Excel техкарт)
 * - `sequential`: брутто = нетто / Π (1 − p)
 */
export type CatalogLossFormula = 'additive' | 'sequential';

export const CATALOG_LOSS_FORMULAS: readonly CatalogLossFormula[] = ['additive', 'sequential'];

export const DEFAULT_CATALOG_LOSS_FORMULA: CatalogLossFormula = 'additive';

/** Тип втрат у довіднику (settings_base `production.lossTypes`). */
export interface ProductionLossType {
  id: number;
  name: string;
  sortOrder: number;
  /** Неактивний тип не пропонується для нових рядків, але показується в старих. */
  isActive: boolean;
}

export interface ProductionSettingsDto {
  lossTypes: ProductionLossType[];
  lossFormula: CatalogLossFormula;
}

export interface ProductionSettingsInput {
  lossTypes: Array<{ id?: number | null; name: string; sortOrder?: number; isActive?: boolean }>;
  lossFormula: CatalogLossFormula;
}

/** Стартовий довідник, коли ключа в settings_base ще немає. */
export const DEFAULT_PRODUCTION_LOSS_TYPE_NAMES = ['Очистка', 'Розсип', 'Термообробка'] as const;

// ---------------------------------------------------------------------------
// Техкарти (фаза 2). Склад = рядки специфікації; тут лише рецепт поверх неї.
// ---------------------------------------------------------------------------

/** Етап техпроцесу (бульйон, бланшування, фінальне збирання…). Редагування – фаза 2b. */
export interface TechCardStage {
  /** Стабільний ключ етапу (uuid) */
  key: string;
  name: string;
  /** Опис техпроцесу, HTML (TipTap) */
  description: string | null;
  durationMin: number | null;
  /** Зміщення старту від початку варки, хв */
  offsetMin: number | null;
  equipment: string | null;
  /** Температура / режим, вільний текст */
  mode: string | null;
  /** Входи: рядки специфікації (rowKey) */
  inputRowKeys: string[];
  /** Входи: виходи попередніх етапів */
  inputStageKeys: string[];
  /** Назва напівфабрикату на виході */
  outputName: string | null;
  yieldPercent: number | null;
}

export type TechCardPackagingBasis = 'portion' | 'box';

/** Пакування: окремо від специфікації (окреме списання). */
export interface TechCardPackagingRow {
  goodId: string;
  qty: number;
  basis: TechCardPackagingBasis;
  note: string | null;
}

/** Фракція дозатора (М1 овочева, М2 мʼясна, Д1, Д2). */
export interface TechCardDosingFraction {
  key: string;
  name: string;
  rowKeys: string[];
  stageKeys: string[];
}

/** Вміст версії / чернетки техкарти (`payloadJson`). */
export interface TechCardPayload {
  stages: TechCardStage[];
  packaging: TechCardPackagingRow[];
  dosing: TechCardDosingFraction[];
  notes: string | null;
  portionsPerBox: number | null;
  /** Перевизначення глобальної формули брутто; null – глобальна */
  lossFormula: CatalogLossFormula | null;
  /** «Порцій на варку» (N): N для похідних рядків специфікації (кількість на порцію = на варку / N) */
  batchPortions: number;
}

export const EMPTY_TECH_CARD_PAYLOAD: TechCardPayload = {
  stages: [],
  packaging: [],
  dosing: [],
  notes: null,
  portionsPerBox: null,
  lossFormula: null,
  batchPortions: 1000,
};

/** none – техкарти ще немає; editing / pending / rejected – стан чернетки; approved – є версія без чернетки. */
export type TechCardStatus = 'none' | 'editing' | 'pending' | 'rejected' | 'approved';

export type TechCardVersionSource = 'ui' | 'auto' | 'rollback';

export interface TechCardListItemDto {
  goodId: string;
  name: string;
  sku: string | null;
  folderName: string | null;
  componentsCount: number;
  specQty: number | null;
  specVersion: number | null;
  /** Чернетка специфікації (у парі з техкартою): pending | rejected */
  specDraftStatus: string | null;
  techCardVersion: number | null;
  status: TechCardStatus;
  stagesCount: number;
  /** Остання зміна техкарти (версія або чернетка) */
  updatedAt: string | null;
  /** Остання нескасована варка товару */
  lastBatch: { number: string; plannedDate: string; status: ProductionBatchStatus } | null;
}

export interface TechCardVersionDto {
  version: number;
  specVersion: number | null;
  source: TechCardVersionSource;
  comment: string | null;
  authorName: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  createdAt: string;
  payload: TechCardPayload;
}

export interface TechCardDraftDto {
  baseVersion: number | null;
  status: Exclude<TechCardStatus, 'none' | 'approved'>;
  comment: string | null;
  authorName: string | null;
  lastEditedByName: string | null;
  rejectReason: string | null;
  updatedAt: string;
  payload: TechCardPayload;
}

export interface TechCardDetailDto {
  goodId: string;
  status: TechCardStatus;
  /** Товар з поточною (затвердженою) специфікацією */
  good: CatalogGoodDetailDto;
  /** Стан специфікації: чинна версія і чернетка (у парі з техкартою) */
  spec: CatalogSpecStateDto;
  units: CatalogDictItemDto[];
  current: TechCardVersionDto | null;
  draft: TechCardDraftDto | null;
  /** Формула брутто з урахуванням перевизначення в техкарті */
  lossFormula: CatalogLossFormula;
  /** Товари пакування: назва, артикул, вага з каталогу (кг) */
  goodNames: Record<string, { name: string; sku: string | null; weight?: number | null }>;
}

// ── Варки (фаза 3) ──────────────────────────────────────────────────────────

/** Стан варки: кроки 1–7 і скасування. */
export const PRODUCTION_BATCH_STATUSES = [
  'draft',
  'issued',
  'accepted',
  'cooking',
  'output',
  'finished',
  'closed',
  'cancelled',
] as const;
export type ProductionBatchStatus = (typeof PRODUCTION_BATCH_STATUSES)[number];

export const PRODUCTION_BATCH_STATUS_LABELS: Record<ProductionBatchStatus, string> = {
  draft: 'Чернетка',
  issued: 'Сировину видано',
  accepted: 'Прийнято на виробництво',
  cooking: 'Готування',
  output: 'Факт виходу',
  finished: 'Прийнято на склад ГП',
  closed: 'Закрито',
  cancelled: 'Скасовано',
};

/** Рядок специфікації у знімку варки (для розрахунку планових кількостей). */
export interface ProductionBatchSnapshotComponent {
  rowKey: string | null;
  componentGoodId: string;
  name: string;
  note: string | null;
  qty: number;
  unitId: string | null;
  componentWeight: number | null;
  cookingLossPercent: number;
  losses: CatalogLossEntry[] | null;
  qtyFormula: CatalogQtyFormula | null;
}

/** Знімок рецепту, зафіксований у варці на момент створення. */
export interface ProductionBatchSnapshot {
  payload: TechCardPayload;
  specQty: number;
  lossFormula: CatalogLossFormula;
  components: ProductionBatchSnapshotComponent[];
  /** Товари пакування: назва, одиниця, вага (кг) */
  packagingGoods: Record<string, { name: string; unitId: string | null; weight: number | null }>;
}

export type ProductionBatchLineKind = 'raw' | 'packaging';

export interface ProductionBatchLineDto {
  id: number;
  kind: ProductionBatchLineKind;
  goodId: string;
  rowKey: string | null;
  name: string;
  unitName: string | null;
  plannedQty: number;
  plannedNetKg: number | null;
  plannedGrossKg: number | null;
  losses: CatalogLossEntry[] | null;
  stockRawSnap: number | null;
  stockProdSnap: number | null;
  stockSnapAt: string | null;
  stockActual: number | null;
  issuedQty: number | null;
  issueNote: string | null;
  shortageComment: string | null;
  consumedQty: number | null;
  leftoverQty: number | null;
  leftoverAction: ProductionBatchLeftoverAction | null;
  note: string | null;
}

export interface ProductionBatchStageDto {
  id: number;
  stageKey: string;
  name: string;
  plannedOffsetMin: number | null;
  plannedDurationMin: number | null;
  startedAt: string | null;
  startedByName: string | null;
  finishedAt: string | null;
  finishedByName: string | null;
  actualTemp: string | null;
  comment: string | null;
}

/** Кроки з підписом: видача сировини, прийом на виробництво (далі – факт виходу, склад ГП). */
export type ProductionBatchSignatureStep = 'issued' | 'accepted' | 'output' | 'finished';

export interface ProductionBatchSignatureDto {
  id: number;
  step: string;
  userId: number;
  userName: string;
  roleLabel: string | null;
  signedAt: string;
  revokedAt: string | null;
  revokedByName: string | null;
  revokeComment: string | null;
}

export interface ProductionBatchEventDto {
  id: number;
  type: string;
  userName: string | null;
  at: string;
  payload: Record<string, unknown> | null;
}

export interface ProductionBatchListItemDto {
  id: number;
  number: string;
  goodId: string;
  goodName: string;
  goodSku: string | null;
  plannedPortions: number;
  /** YYYY-MM-DD */
  plannedDate: string;
  status: ProductionBatchStatus;
  techCardVersion: number;
  createdByName: string | null;
  createdAt: string;
}

/** Факт виходу варки (крок 5), порції і тара. */
export interface ProductionBatchFact {
  /** Порцій прийнято на ГП */
  portionsGood: number | null;
  portionsReject: number | null;
  portionsSample: number | null;
  /** Брак термоналіпок, шт */
  labelRejects: number | null;
  portionsPerBox: number | null;
  boxes: number | null;
  pallets: number | null;
  comment: string | null;
}

export type ProductionBatchLeftoverAction = 'keep_vp' | 'return_sp';

export interface ProductionBatchDetailDto extends ProductionBatchListItemDto {
  specVersion: number | null;
  fact: ProductionBatchFact | null;
  comment: string | null;
  cancelledAt: string | null;
  cancelledByName: string | null;
  cancelReason: string | null;
  closedAt: string | null;
  snapshot: ProductionBatchSnapshot;
  lines: ProductionBatchLineDto[];
  stages: ProductionBatchStageDto[];
  signatures: ProductionBatchSignatureDto[];
  events: ProductionBatchEventDto[];
}

export interface ProductionBatchCreateInput {
  goodId: string;
  plannedPortions: number;
  /** YYYY-MM-DD */
  plannedDate: string;
  comment?: string | null;
}

export interface ProductionBatchUpdatePlanInput {
  plannedPortions?: number;
  plannedDate?: string;
  comment?: string | null;
}

export interface ProductionBatchIssueLineInput {
  id: number;
  /** Фактичний залишок на СП, одиниця видачі */
  stockActual?: number | null;
  issuedQty?: number | null;
  issueNote?: string | null;
  shortageComment?: string | null;
}

export interface ProductionBatchIssueInput {
  lines: ProductionBatchIssueLineInput[];
}

export interface ProductionBatchStageInput {
  actualTemp?: string | null;
  comment?: string | null;
  /** Фактичний час (ISO); лише для PATCH етапу. null – прибрати */
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface ProductionBatchOutputLineInput {
  id: number;
  /** Залишок після варки, одиниця видачі; витрачено = видано − залишок */
  leftoverQty?: number | null;
  leftoverAction?: ProductionBatchLeftoverAction | null;
  note?: string | null;
}

export interface ProductionBatchOutputInput {
  fact?: Partial<ProductionBatchFact>;
  lines?: ProductionBatchOutputLineInput[];
}
