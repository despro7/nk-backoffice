import { prisma } from '../../lib/utils.js';
import {
  DILOVOD_PRODUCTION_STORAGE_ID,
  DILOVOD_RAW_MATERIALS_STORAGE_ID,
  buildIngredientStockJson,
} from '../../../shared/utils/catalogStock.js';
import { getIngredientsFolderIds } from './catalogFinishedProductsFolder.js';

export interface IngredientStockTotals {
  rawStock: number;
  productionStock: number;
}

export interface IngredientStockGood {
  id: string;
  stockBalanceByStock: string | null;
}

/** Рядки `balance/goods` (good id, storage, qty) → суми по товару; фірми сумуються. */
export function aggregateIngredientStockRows(
  rows: Array<{ id?: unknown; storage?: unknown; qty?: unknown }>,
): Map<string, IngredientStockTotals> {
  const totals = new Map<string, IngredientStockTotals>();
  for (const row of rows) {
    const goodId = String(row.id ?? '').trim();
    const storage = String(row.storage ?? '').trim();
    if (!goodId) continue;
    const qty = row.qty == null ? 0 : Number.parseFloat(String(row.qty)) || 0;
    const entry = totals.get(goodId) ?? { rawStock: 0, productionStock: 0 };
    if (storage === DILOVOD_RAW_MATERIALS_STORAGE_ID) entry.rawStock += qty;
    else if (storage === DILOVOD_PRODUCTION_STORAGE_ID) entry.productionStock += qty;
    else continue;
    totals.set(goodId, entry);
  }
  return totals;
}

/** Для кожного інгредієнта новий JSON залишків; незмінені пропускаються. */
export function diffIngredientStock(
  goods: IngredientStockGood[],
  totals: Map<string, IngredientStockTotals>,
): Array<{ id: string; json: string }> {
  const changes: Array<{ id: string; json: string }> = [];
  for (const good of goods) {
    const t = totals.get(good.id) ?? { rawStock: 0, productionStock: 0 };
    const json = buildIngredientStockJson(t.rawStock, t.productionStock);
    if (good.stockBalanceByStock === json) continue;
    changes.push({ id: good.id, json });
  }
  return changes;
}

/** Товари (не групи) з гілки «Інгредієнти» з підгрупами. */
export async function listIngredientGoodsForStock(): Promise<IngredientStockGood[]> {
  const folderIds = await getIngredientsFolderIds();
  return prisma.catalogGood.findMany({
    where: { isGroup: false, parentId: { in: [...folderIds] } },
    select: { id: true, stockBalanceByStock: true },
  });
}

/** Запис змін chunk-транзакціями (як `applyStockBalances` для ГП/МС). */
export async function applyIngredientStockChanges(
  changes: Array<{ id: string; json: string }>,
): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;
  const CHUNK = 25;
  for (let i = 0; i < changes.length; i += CHUNK) {
    const chunk = changes.slice(i, i + CHUNK);
    try {
      await prisma.$transaction(
        chunk.map((item) =>
          prisma.catalogGood.update({
            where: { id: item.id },
            data: { stockBalanceByStock: item.json },
          }),
        ),
      );
      updated += chunk.length;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { updated, errors };
}
