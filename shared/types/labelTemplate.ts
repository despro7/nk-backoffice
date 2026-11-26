import type { ProductLabelKind } from './productLabel.js';
import type { LabelWeightSpacing, LabelWeightSpacingOverride } from './labelWeightSpacing.js';
import type { LABEL_INPUTS_SCHEMA_VERSION, LabelInputKey } from '../constants/labelInputKeys.js';

export type LabelTemplateAudience = 'good' | 'kit';

export type LabelPdfmeTemplate = {
  basePdf: unknown;
  schemas: Array<Array<Record<string, unknown>>>;
  columns?: string[];
  sampledata?: Array<Record<string, string>>;
  pdfmeVersion?: string;
};

export interface LabelTemplateDto {
  id: string;
  slug: string;
  name: string;
  iconKey: string | null;
  labelKind: ProductLabelKind;
  audience: LabelTemplateAudience;
  isArchived: boolean;
  isDeletionLocked: boolean;
  schemaVersion: number;
  updatedAt: string;
  updatedBy: number | null;
}

export interface LabelTemplateDetailDto extends LabelTemplateDto {
  template: LabelPdfmeTemplate;
  basePdfMeta: unknown;
  /** Власні пробіли маси нетто шаблону (null – успадковує спільні). */
  weightSpacingOverride: LabelWeightSpacingOverride | null;
  /** Фінальні пробіли: спільні + перевизначення. */
  weightSpacing: LabelWeightSpacing;
}

export type LabelTemplateDefaults = Record<
  LabelTemplateAudience,
  Record<ProductLabelKind, string | null>
>;

/** Що переносити з поля при застосуванні до інших шаблонів. */
export type LabelFieldApplyPart = 'geometry' | 'font' | 'content' | 'all';

export type LabelFieldApplyAction = 'replaced' | 'added';

export interface LabelFieldApplyInput {
  sourceTemplateId: string;
  field: Record<string, unknown>;
  parts: LabelFieldApplyPart[];
  targetTemplateIds: string[];
  removeEstimatedSign?: boolean;
}

export interface LabelFieldApplyResultDto {
  updated: Array<{ id: string; name: string; action: LabelFieldApplyAction }>;
}

/** Прямий override пресета наліпки на картці товару (один рядок = один слот). */
export interface LabelTemplateGoodOverrideLink {
  goodId: string;
  name: string;
  sku: string | null;
  audience: LabelTemplateAudience;
  labelKind: ProductLabelKind;
}

/** Базові inputs з картки товару + партії для попереднього перегляду в Designer. */
export interface LabelTemplatePreviewInputsDto {
  goodId: string;
  name: string;
  sku: string | null;
  inputs: Partial<Record<LabelInputKey, string>>;
}

/** Чернетка / опублікована версія наліпки (pdfme inputs). */
export interface ProductLabelPayloadV2 {
  version: typeof LABEL_INPUTS_SCHEMA_VERSION;
  templateId: string | null;
  /** Злиті значення для рендера. */
  inputs: Partial<Record<LabelInputKey, string>>;
  /** Лише ключі, що відрізняються від бази картки. */
  overrides: Partial<Record<LabelInputKey, string>>;
  nutritionEnergyManual?: boolean;
}

export interface ResolvedLabelTemplateDto {
  templateId: string | null;
  /** Фінальні пробіли маси нетто для обраного шаблону. */
  weightSpacing?: LabelWeightSpacing;
  templateName: string | null;
  source: 'override' | 'default' | 'none';
  audience: LabelTemplateAudience;
  labelKind: ProductLabelKind;
}
