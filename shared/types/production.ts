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
