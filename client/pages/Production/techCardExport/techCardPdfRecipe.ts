import type { CatalogLossFormula, TechCardDetailDto, TechCardPayload } from '@shared/types/production';
import { stageHtmlToBlocks, type StageTextBlock } from '@shared/utils/stageHtmlBlocks';
import {
  formatGrams,
  formatMinutes,
  fractionKg,
  stageOutputsKg,
  type SpecRowOption,
} from '../components/techCardRecipe';

const LOSS_FORMULA_LABELS: Record<CatalogLossFormula, string> = {
  additive: 'адитивна',
  sequential: 'послідовна',
};

const PACKAGING_BASIS: Record<string, string> = { portion: 'на порцію', box: 'на коробку' };

export interface TechCardPdfStage {
  title: string;
  /** «старт +30 хв · 1 год · котел 100 л · 95 °C» */
  facts: string;
  output: string;
  blocks: StageTextBlock[];
}

/** Рецепт техкарти для PDF: усе, крім складу (склад – `TechCardResult`). */
export interface TechCardPdfRecipe {
  sku: string | null;
  /** «Техкарта v3 · Специфікація v2» або «Чернетка, не затверджено» */
  versionLabel: string;
  isDraft: boolean;
  lossFormulaLabel: string;
  batchPortions: number;
  stages: TechCardPdfStage[];
  packaging: Array<{ name: string; qty: string; basis: string; note: string }>;
  portionsPerBox: number | null;
  dosing: Array<{ name: string; composition: string; mass: string }>;
  dosingTotal: string | null;
  notes: string | null;
  /** Секції складу: рядки за етапами, далі прямо в дозування, далі нерозподілені; порожньо – без секцій */
  compositionSections: Array<{ title: string; rowKeys: string[] }>;
}

/** Рядок специфікації цілком в одному етапі; решта – у дозуванні напряму або не розподілена. */
function buildCompositionSections(
  payload: TechCardPayload,
  rows: SpecRowOption[],
): TechCardPdfRecipe['compositionSections'] {
  if (payload.stages.length === 0) return [];
  const used = new Set<string>();
  const sections = payload.stages.map((stage, idx) => {
    const keys = stage.inputRowKeys.filter((k) => !used.has(k));
    keys.forEach((k) => used.add(k));
    return { title: `${idx + 1}. ${stage.name || 'Без назви'}`, rowKeys: keys };
  });
  const dosingKeys = payload.dosing.flatMap((d) => d.rowKeys).filter((k) => !used.has(k));
  const dosingUnique = [...new Set(dosingKeys)];
  dosingUnique.forEach((k) => used.add(k));
  const rest = rows.map((r) => r.rowKey).filter((k) => !used.has(k));
  return [
    ...sections,
    { title: 'Дозування', rowKeys: dosingUnique },
    { title: 'Не розподілено по етапах', rowKeys: rest },
  ].filter((s) => s.rowKeys.length > 0);
}

export function buildTechCardPdfRecipe(input: {
  data: TechCardDetailDto;
  payload: TechCardPayload;
  rows: SpecRowOption[];
  isDraft: boolean;
  lossFormula: CatalogLossFormula;
  goodNames?: TechCardDetailDto['goodNames'];
}): TechCardPdfRecipe {
  const { data, payload, rows, isDraft, lossFormula } = input;
  const goodNames = input.goodNames ?? data.goodNames;
  const nameByKey = new Map(rows.map((r) => [r.rowKey, r.name]));
  const stageOut = stageOutputsKg(payload, rows);
  const stageName = new Map(payload.stages.map((st, idx) => [st.key, `${idx + 1}. ${st.name}`]));

  const versionParts = [
    data.current ? `Техкарта v${data.current.version}` : null,
    data.spec.currentVersion != null ? `Специфікація v${data.spec.currentVersion}` : null,
  ].filter(Boolean);
  const versionLabel = isDraft
    ? ['Чернетка, не затверджено', ...versionParts.map((p) => `основа: ${p}`)].join(' · ')
    : versionParts.join(' · ') || 'Версії ще немає';

  const stages = payload.stages.map((stage, idx) => {
    const facts = [
      stage.offsetMin != null && stage.offsetMin > 0 ? `старт +${formatMinutes(stage.offsetMin)}` : null,
      stage.durationMin != null && stage.durationMin > 0 ? formatMinutes(stage.durationMin) : null,
      stage.equipment,
      stage.mode,
    ].filter(Boolean);
    const outKg = stageOut.get(stage.key);
    const output = [
      stage.outputName,
      stage.yieldPercent != null ? `${stage.yieldPercent}%` : null,
      outKg != null ? `${formatGrams(outKg)} на порцію` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      title: `${idx + 1}. ${stage.name || 'Без назви'}`,
      facts: facts.join(' · '),
      output,
      blocks: stageHtmlToBlocks(stage.description),
    };
  });

  const masses = payload.dosing.map((d) => fractionKg(d, rows, stageOut));
  const dosingTotal =
    masses.length > 0 && masses.every((m) => m != null)
      ? formatGrams(masses.reduce<number>((sum, m) => sum + (m ?? 0), 0))
      : null;

  return {
    sku: data.good.sku ?? null,
    versionLabel,
    isDraft,
    lossFormulaLabel: LOSS_FORMULA_LABELS[lossFormula],
    batchPortions: payload.batchPortions,
    stages,
    packaging: payload.packaging.map((row) => ({
      name: goodNames[row.goodId]?.name ?? row.goodId,
      qty: row.qty.toLocaleString('uk-UA'),
      basis: PACKAGING_BASIS[row.basis] ?? row.basis,
      note: row.note || '',
    })),
    portionsPerBox: payload.portionsPerBox,
    dosing: payload.dosing.map((d, idx) => ({
      name: d.name || '–',
      composition:
        [
          ...d.stageKeys.map((k) => stageName.get(k) ?? k),
          ...d.rowKeys.map((k) => nameByKey.get(k) ?? 'рядок відсутній'),
        ].join(', ') || '–',
      mass: formatGrams(masses[idx]),
    })),
    dosingTotal,
    notes: payload.notes?.trim() || null,
    compositionSections: buildCompositionSections(payload, rows),
  };
}
