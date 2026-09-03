/**
 * Dilovod tpGoods rowID: resolve з локальної БД, fallback getObject, генерація для нових рядків.
 */

import { randomBytes } from 'crypto';
import type { DilovodTpGoodsRow } from './ProductsTypes.js';
import { productsDilovodGateway } from './ProductsDilovodGateway.js';

export type CatalogComponentSaveInput = {
  componentGoodId: string;
  qty: number;
  rowNum?: number;
  unitId?: string | null;
  note?: string | null;
};

export type CatalogComponentRowRef = {
  rowNum: number;
  componentGoodId: string;
  dilovodRowId: string | null;
};

export type RemoteTpGoodsRow = {
  rowNum: number;
  good: string;
  rowID: string;
};

export function componentRowKey(rowNum: number, componentGoodId: string): string {
  return `${rowNum}:${componentGoodId}`;
}

/** Dilovod tpGoods.rowID — короткий alphanumeric (~8 символів). */
export function generateDilovodRowId(): string {
  return randomBytes(6).toString('base64url').slice(0, 8);
}

function readRowId(row: Record<string, unknown>): string | null {
  const raw = row.rowID ?? row.rowId;
  if (raw == null) return null;
  const value = String(raw).trim();
  return value || null;
}

function readGoodId(row: Record<string, unknown>): string {
  const good = row.good;
  if (good != null && typeof good === 'object') {
    return String((good as { id?: unknown }).id || '');
  }
  return String(good || '');
}

/** Витяг tpGoods.rowID з getObject (key = rowNum:goodId). */
export function extractTpGoodsRowIds(obj: unknown): Map<string, string> {
  const tp = (obj as { tableParts?: { tpGoods?: unknown } })?.tableParts?.tpGoods;
  const tpList: unknown[] = Array.isArray(tp)
    ? tp
    : tp && typeof tp === 'object'
      ? Object.values(tp as Record<string, unknown>)
      : [];

  const result = new Map<string, string>();
  for (const [idx, row] of tpList.entries()) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const good = readGoodId(rec);
    const rowID = readRowId(rec);
    if (!good || !rowID) continue;
    const rowNumRaw = rec.rowNum;
    const rowNum =
      typeof rowNumRaw === 'number'
        ? rowNumRaw
        : typeof rowNumRaw === 'string' && rowNumRaw.trim()
          ? Number.parseInt(rowNumRaw, 10)
          : idx + 1;
    if (!Number.isFinite(rowNum)) continue;
    result.set(componentRowKey(rowNum, good), rowID);
  }
  return result;
}

export function remoteTpGoodsRows(obj: unknown): RemoteTpGoodsRow[] {
  const tp = (obj as { tableParts?: { tpGoods?: unknown } })?.tableParts?.tpGoods;
  const tpList: unknown[] = Array.isArray(tp)
    ? tp
    : tp && typeof tp === 'object'
      ? Object.values(tp as Record<string, unknown>)
      : [];

  return tpList
    .map((row, idx) => {
      if (!row || typeof row !== 'object') return null;
      const rec = row as Record<string, unknown>;
      const good = readGoodId(rec);
      const rowID = readRowId(rec);
      if (!good || !rowID) return null;
      const rowNumRaw = rec.rowNum;
      const rowNum =
        typeof rowNumRaw === 'number'
          ? rowNumRaw
          : typeof rowNumRaw === 'string' && rowNumRaw.trim()
            ? Number.parseInt(rowNumRaw, 10)
            : idx + 1;
      if (!Number.isFinite(rowNum)) return null;
      return { rowNum, good, rowID };
    })
    .filter((row): row is RemoteTpGoodsRow => row != null)
    .sort((a, b) => a.rowNum - b.rowNum || a.good.localeCompare(b.good));
}

/**
 * Призначає rowID для кожного рядка save-payload.
 * 1) локальна БД (rowNum+good), 2) remote Dilovod, 3) generate.
 */
export function assignComponentRowIds(
  components: CatalogComponentSaveInput[],
  localRows: CatalogComponentRowRef[],
  remoteRows: RemoteTpGoodsRow[] = []
): Map<string, string> {
  const assigned = new Map<string, string>();
  const usedRowIds = new Set<string>();

  const localByKey = new Map(
    localRows
      .filter((r) => r.dilovodRowId)
      .map((r) => [componentRowKey(r.rowNum, r.componentGoodId), r.dilovodRowId as string])
  );

  for (const [idx, component] of components.entries()) {
    const rowNum = component.rowNum ?? idx + 1;
    const key = componentRowKey(rowNum, component.componentGoodId);

    const localRowId = localByKey.get(key);
    if (localRowId && !usedRowIds.has(localRowId)) {
      assigned.set(key, localRowId);
      usedRowIds.add(localRowId);
      continue;
    }

    const remoteExact = remoteRows.find(
      (r) =>
        r.rowNum === rowNum &&
        r.good === component.componentGoodId &&
        !usedRowIds.has(r.rowID)
    );
    if (remoteExact) {
      assigned.set(key, remoteExact.rowID);
      usedRowIds.add(remoteExact.rowID);
      continue;
    }

    const remoteByGood = remoteRows.filter(
      (r) => r.good === component.componentGoodId && !usedRowIds.has(r.rowID)
    );
    if (remoteByGood.length === 1) {
      assigned.set(key, remoteByGood[0]!.rowID);
      usedRowIds.add(remoteByGood[0]!.rowID);
      continue;
    }

    let next = generateDilovodRowId();
    while (usedRowIds.has(next)) {
      next = generateDilovodRowId();
    }
    assigned.set(key, next);
    usedRowIds.add(next);
  }

  return assigned;
}

export async function resolveTpGoodsForSave(params: {
  goodId: string | null;
  components: CatalogComponentSaveInput[];
  mainUnitId: string;
  localRows: CatalogComponentRowRef[];
}): Promise<{
  tpGoods: DilovodTpGoodsRow[];
  componentsWithRowIds: Array<CatalogComponentSaveInput & { rowNum: number; dilovodRowId: string }>;
}> {
  const { goodId, components, mainUnitId, localRows } = params;
  let remoteRows: RemoteTpGoodsRow[] = [];

  const needsRemote =
    goodId != null &&
    components.some((c, idx) => {
      const rowNum = c.rowNum ?? idx + 1;
      const key = componentRowKey(rowNum, c.componentGoodId);
      const local = localRows.find(
        (r) => r.rowNum === rowNum && r.componentGoodId === c.componentGoodId && r.dilovodRowId
      );
      return !local?.dilovodRowId;
    });

  if (needsRemote && goodId) {
    try {
      const obj = await productsDilovodGateway.getObject(goodId);
      remoteRows = remoteTpGoodsRows(obj);
    } catch {
      remoteRows = [];
    }
  }

  const rowIdsByKey = assignComponentRowIds(components, localRows, remoteRows);

  const tpGoods: DilovodTpGoodsRow[] = [];
  const componentsWithRowIds: Array<CatalogComponentSaveInput & { rowNum: number; dilovodRowId: string }> =
    [];

  for (const [idx, component] of components.entries()) {
    const rowNum = component.rowNum ?? idx + 1;
    const key = componentRowKey(rowNum, component.componentGoodId);
    const dilovodRowId = rowIdsByKey.get(key) || generateDilovodRowId();

    tpGoods.push({
      rowNum,
      rowID: dilovodRowId,
      good: component.componentGoodId,
      qty: component.qty,
      unit: component.unitId || mainUnitId,
      remark: (component.note?.trim() || '').slice(0, 150) || undefined,
    });

    componentsWithRowIds.push({
      ...component,
      rowNum,
      dilovodRowId,
    });
  }

  return { tpGoods, componentsWithRowIds };
}
