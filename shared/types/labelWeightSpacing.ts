/** Ширина пробілу в написі маси нетто на наліпці. */
export type LabelSpaceWidth = 'none' | 'hair' | 'thin' | 'normal' | 'wide';

/** Три місця, де налаштовується пробіл: «380 г» · «380 г ℮ / ± 8%» · «± 8%». */
export interface LabelWeightSpacing {
  /** Між числом маси та одиницею (г / кг). */
  unit: LabelSpaceWidth;
  /** Між масою та знаком ℮ або похибкою. */
  suffix: LabelSpaceWidth;
  /** Між «±» і значенням похибки. */
  tolerance: LabelSpaceWidth;
}

export type LabelWeightSpacingSlot = keyof LabelWeightSpacing;

/** Перевизначення для шаблону: лише змінені місця. */
export type LabelWeightSpacingOverride = Partial<LabelWeightSpacing>;

/** settings_base `label_weight_spacing`: спільні значення + перевизначення за id шаблону. */
export interface LabelWeightSpacingSettings {
  defaults: LabelWeightSpacing;
  overrides: Record<string, LabelWeightSpacingOverride>;
}
