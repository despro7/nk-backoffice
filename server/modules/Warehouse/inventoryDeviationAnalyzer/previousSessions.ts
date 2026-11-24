import { prisma } from '../../../lib/utils.js';
import type { InventoryWarehouseScope } from '../../../../shared/types/inventoryWarehouse.js';
import { resolveInventorySessionWarehouseScope } from '../../../../shared/utils/inventorySessionWarehouse.js';
import { safeParseItems } from '../historyNormalize.js';

export interface PreviousSessionRow {
  id: number;
  inventoryDate: Date;
  items: unknown[];
}

/** Попередні завершені сесії того ж складу (новіші першими). */
export async function loadPreviousCompletedSessions(args: {
  sessionId: number;
  inventoryDate: Date;
  scope: InventoryWarehouseScope;
  limit: number;
  /** Нижня межа дати (необовʼязково). */
  earliest?: Date;
}): Promise<PreviousSessionRow[]> {
  const { sessionId, inventoryDate, scope, limit, earliest } = args;
  const rows = await prisma.warehouseInventory.findMany({
    where: {
      status: 'completed',
      id: { not: sessionId },
      inventoryDate: { lt: inventoryDate, ...(earliest ? { gte: earliest } : {}) },
    },
    orderBy: { inventoryDate: 'desc' },
    take: limit * 3,
    select: { id: true, inventoryDate: true, warehouse: true, items: true },
  });
  const result: PreviousSessionRow[] = [];
  for (const row of rows) {
    if (!row.inventoryDate) continue;
    const items = safeParseItems(row.items);
    if (resolveInventorySessionWarehouseScope(row.warehouse, items) !== scope) continue;
    result.push({ id: row.id, inventoryDate: row.inventoryDate, items });
    if (result.length >= limit) break;
  }
  return result;
}
