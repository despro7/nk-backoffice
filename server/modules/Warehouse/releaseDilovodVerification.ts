export interface ExpectedTpGoodsRow {
  good?: unknown;
  goodPart?: unknown;
  qty?: unknown;
}

export interface ReleaseDilovodVerification {
  ok: boolean;
  /** Людиночитні розбіжності між тим, що відправили, і тим, що зберіг Dilovod. */
  issues: string[];
  /** Сума qty у відправленому `tpGoods`. */
  expectedQty: number;
  /** Сума qty у збереженому в Dilovod документі. */
  actualQty: number;
}

const QTY_EPSILON = 0.0001;

function toQty(value: unknown): number {
  const n = Number.parseFloat(String(value ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

function toId(value: unknown): string {
  const id = String(value ?? '').trim();
  return id === '0' ? '' : id;
}

/** Dilovod повертає `tpGoods` як обʼєкт `{ rowId: row }`, іноді як масив. */
function listRows(tpGoods: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(tpGoods)) return tpGoods as Array<Record<string, unknown>>;
  if (tpGoods && typeof tpGoods === 'object') return Object.values(tpGoods as Record<string, Record<string, unknown>>);
  return [];
}

/**
 * Порівнює `tpGoods`, які ми відправили, з тим, що реально зберіг Dilovod.
 * Рядки з партіями-документами (не `catalogs.goodParts`) Dilovod може мовчки відкинути.
 */
export function compareTpGoodsWithDilovod(
  expectedRows: ExpectedTpGoodsRow[],
  actualTpGoods: unknown,
  options?: { goodLabels?: Map<string, string> },
): ReleaseDilovodVerification {
  const actualRows = listRows(actualTpGoods);
  const label = (goodId: string) => options?.goodLabels?.get(goodId) ?? goodId;

  const expectedByKey = new Map<string, number>();
  let expectedQty = 0;
  for (const row of expectedRows) {
    const good = toId(row.good);
    const qty = toQty(row.qty);
    if (!good || qty <= 0) continue;
    const key = `${good}|${toId(row.goodPart)}`;
    expectedByKey.set(key, (expectedByKey.get(key) ?? 0) + qty);
    expectedQty += qty;
  }

  const actualByKey = new Map<string, number>();
  const actualByGood = new Map<string, number>();
  let actualQty = 0;
  for (const row of actualRows) {
    const good = toId(row.good);
    const qty = toQty(row.qty);
    if (!good || qty <= 0) continue;
    const key = `${good}|${toId(row.goodPart)}`;
    actualByKey.set(key, (actualByKey.get(key) ?? 0) + qty);
    actualByGood.set(good, (actualByGood.get(good) ?? 0) + qty);
    actualQty += qty;
  }

  const issues: string[] = [];
  const expectedByGood = new Map<string, number>();
  for (const [key, qty] of expectedByKey) {
    const good = key.split('|')[0];
    expectedByGood.set(good, (expectedByGood.get(good) ?? 0) + qty);
  }

  for (const [good, qty] of expectedByGood) {
    const actual = actualByGood.get(good) ?? 0;
    if (Math.abs(actual - qty) > QTY_EPSILON) {
      issues.push(
        `${label(good)}: відправлено ${qty} шт., у документі Dilovod ${actual} шт.`,
      );
    }
  }

  // Точні партії: рядок із явним goodPart має лишитись у документі з тією самою кількістю.
  for (const [key, qty] of expectedByKey) {
    const [good, goodPart] = key.split('|');
    if (!goodPart) continue;
    const actual = actualByKey.get(key) ?? 0;
    if (Math.abs(actual - qty) > QTY_EPSILON && !issues.some((line) => line.startsWith(`${label(good)}:`))) {
      issues.push(`${label(good)}: партію ${goodPart} відправлено ${qty} шт., у документі ${actual} шт.`);
    }
  }

  for (const good of actualByGood.keys()) {
    if (!expectedByGood.has(good)) {
      issues.push(`${label(good)}: у документі Dilovod є рядок, якого ми не відправляли`);
    }
  }

  return { ok: issues.length === 0, issues, expectedQty, actualQty };
}

/** Читає документ з Dilovod і звіряє компоненти. Помилка читання не ламає основний процес. */
export async function verifyReleaseDocumentInDilovod(
  dilovodDocId: string,
  expectedRows: ExpectedTpGoodsRow[],
  options?: { goodLabels?: Map<string, string> },
): Promise<ReleaseDilovodVerification | null> {
  const docId = String(dilovodDocId ?? '').trim();
  if (!docId || expectedRows.length === 0) return null;
  try {
    const { dilovodService } = await import('../../services/dilovod/DilovodService.js');
    const doc = await dilovodService.getMovementDocument(docId);
    const root = doc?.data ?? doc;
    return compareTpGoodsWithDilovod(expectedRows, root?.tableParts?.tpGoods, options);
  } catch (error) {
    console.warn('[SetRelease] Не вдалося звірити документ Dilovod:', error);
    return null;
  }
}
