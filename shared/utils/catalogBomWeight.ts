export type ExpectedBomWeight = {
  kg: number;
  missingCount: number;
};

export type BomWeightComponent = {
  qty: number;
  unitId: string;
  componentWeight: number | null;
  cookingLossPercent?: number | null;
};

export function massUnitToKgFactor(
  unit: { name: string; code?: string | null } | undefined,
): number | null {
  if (!unit) return null;
  const name = unit.name.trim().toLowerCase().replace(/\./g, '');
  const code = (unit.code || '').trim().toLowerCase().replace(/\./g, '');
  const token = `${name} ${code}`;
  if (/^(кг|kg|кілограм)/.test(name) || /^(кг|kg)$/.test(code)) return 1;
  if (/(^| )(л|l|літр|литр|lt|liter)/.test(token) && !/(мл|ml|мілілітр|миллилитр)/.test(token)) {
    return 1;
  }
  if (/^(г|гр|грам|g)/.test(name) && !/кілограм/.test(name)) return 0.001;
  if (/^(мл|ml|мілілітр|миллилитр)/.test(name) || /^(мл|ml)$/.test(code)) return 0.001;
  return null;
}

export function bomRowGrossKg(
  row: BomWeightComponent,
  unitById: Map<string, { id: string; name: string; code?: string | null }>,
): number | null {
  const qty = Number(row.qty);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const massFactor = massUnitToKgFactor(unitById.get(row.unitId));
  if (massFactor != null) return qty * massFactor;
  const w = row.componentWeight;
  if (w != null && Number.isFinite(w) && w > 0) return qty * w;
  return null;
}

export function expectedBomWeightKg(
  components: BomWeightComponent[],
  units: Array<{ id: string; name: string; code?: string | null }>,
  options?: { divideBy?: number; warnMissingPieceWeight?: boolean },
): ExpectedBomWeight | null {
  if (components.length === 0) return null;
  const unitById = new Map(units.map((u) => [u.id, u]));
  let sum = 0;
  let used = 0;
  let missingCount = 0;
  const warnMissing = Boolean(options?.warnMissingPieceWeight);
  for (let i = 0; i < components.length; i += 1) {
    const row = components[i];
    const qty = Number(row.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      if (warnMissing) missingCount += 1;
      continue;
    }
    const netKg = bomRowGrossKg(row, unitById);
    if (netKg != null && netKg > 0) {
      sum += netKg;
      used += 1;
      continue;
    }
    const massFactor = massUnitToKgFactor(unitById.get(row.unitId));
    if (massFactor == null && warnMissing) {
      missingCount += 1;
    }
  }
  if (used === 0 && missingCount === 0) return null;
  const divideBy = options?.divideBy != null && options.divideBy > 0 ? options.divideBy : 1;
  return { kg: Math.round((sum / divideBy) * 100) / 100, missingCount };
}

/** Ймовірно неправильний «Розрахунок на» — вага порції стає нереалістично малою. */
export function isSuspiciousSpecQty(
  components: BomWeightComponent[],
  units: Array<{ id: string; name: string; code?: string | null }>,
  specQty: number,
): boolean {
  if (!Number.isFinite(specQty) || specQty <= 1) return false;
  const undivided = expectedBomWeightKg(components, units, { divideBy: 1 });
  const divided = expectedBomWeightKg(components, units, { divideBy: specQty });
  if (!undivided || undivided.kg < 0.05) return false;
  return divided == null || divided.kg < 0.05;
}
