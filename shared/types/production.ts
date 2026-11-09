import type { CatalogDictItemDto, CatalogGoodDetailDto } from './catalog.js';
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
  /** Опис техпроцесу, TipTap JSON (рядок) */
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
}

export const EMPTY_TECH_CARD_PAYLOAD: TechCardPayload = {
  stages: [],
  packaging: [],
  dosing: [],
  notes: null,
  portionsPerBox: null,
  lossFormula: null,
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
}
