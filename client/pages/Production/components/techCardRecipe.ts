import { buildTechCardRows } from '@/pages/Products/ProductsUtils';
import type { CatalogDictItemDto, CatalogGoodComponentDto } from '@shared/types/catalog';
import type { TechCardDosingFraction, TechCardPayload } from '@shared/types/production';

/** Рядок специфікації для вибору у входи етапів і фракції дозування. */
export interface SpecRowOption {
  rowKey: string;
  name: string;
  /** Нетто на 1 порцію, кг; null – немасова одиниця */
  netPerPortionKg: number | null;
}

export function buildSpecRowOptions(
  components: Array<
    Pick<CatalogGoodComponentDto, 'componentGoodId' | 'componentName' | 'qty' | 'unitId' | 'componentWeight' | 'note' | 'rowKey'>
  >,
  units: CatalogDictItemDto[],
  specQty: number | null,
): SpecRowOption[] {
  const safeSpecQty = specQty != null && specQty > 0 ? specQty : 1;
  return components.flatMap((c) => {
    if (!c.rowKey) return [];
    const name = c.note?.trim() ? `${c.componentName || c.componentGoodId} (${c.note.trim()})` : c.componentName || c.componentGoodId;
    const [row] = buildTechCardRows(
      [{ componentName: name, qty: c.qty, unitId: c.unitId ?? '', componentWeight: c.componentWeight ?? null }],
      units,
      safeSpecQty,
      1,
    ).rows;
    return [{ rowKey: c.rowKey, name, netPerPortionKg: row?.massKgNetTotal ?? null }];
  });
}

/** Маса виходу кожного етапу на порцію: входи-рядки + виходи попередніх етапів, × вихід %. */
export function stageOutputsKg(payload: TechCardPayload, rows: SpecRowOption[]): Map<string, number | null> {
  const rowMass = new Map(rows.map((r) => [r.rowKey, r.netPerPortionKg]));
  const out = new Map<string, number | null>();
  for (const stage of payload.stages) {
    let total = 0;
    let known = true;
    for (const key of stage.inputRowKeys) {
      const kg = rowMass.get(key);
      if (kg == null) known = false;
      else total += kg;
    }
    for (const key of stage.inputStageKeys) {
      const kg = out.get(key);
      if (kg == null) known = false;
      else total += kg;
    }
    const hasInputs = stage.inputRowKeys.length + stage.inputStageKeys.length > 0;
    const yieldFactor = stage.yieldPercent != null && stage.yieldPercent > 0 ? stage.yieldPercent / 100 : 1;
    out.set(stage.key, hasInputs && known ? total * yieldFactor : null);
  }
  return out;
}

/** Маса фракції дозування на порцію; null – є немасові входи. */
export function fractionKg(
  fraction: TechCardDosingFraction,
  rows: SpecRowOption[],
  stageOut: Map<string, number | null>,
): number | null {
  const rowMass = new Map(rows.map((r) => [r.rowKey, r.netPerPortionKg]));
  let total = 0;
  for (const key of fraction.rowKeys) {
    const kg = rowMass.get(key);
    if (kg == null) return null;
    total += kg;
  }
  for (const key of fraction.stageKeys) {
    const kg = stageOut.get(key);
    if (kg == null) return null;
    total += kg;
  }
  return fraction.rowKeys.length + fraction.stageKeys.length > 0 ? total : null;
}

export function formatGrams(kg: number | null): string {
  if (kg == null || !Number.isFinite(kg)) return '–';
  const grams = Math.round(kg * 10000) / 10;
  return `${grams.toLocaleString('uk-UA', { maximumFractionDigits: 1 })} г`;
}

export function formatMinutes(min: number | null): string {
  if (min == null || min <= 0) return '–';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} хв`;
  return m === 0 ? `${h} год` : `${h} год ${m} хв`;
}
