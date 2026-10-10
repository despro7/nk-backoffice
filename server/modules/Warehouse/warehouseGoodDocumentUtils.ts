import { prisma } from '../../lib/utils.js';
import { catalogOpsLookup } from '../Products/CatalogOpsLookup.js';
import {
  appendWarehouseReleaseDilovodRemark,
  buildWarehouseReleaseEditRemarkNote,
} from '../../../shared/utils/warehouseReleaseRemark.js';
import type { DilovodService } from '../../services/dilovod/DilovodService.js';
import {
  WAREHOUSE_SURPLUS_ACC_INCOMES,
  WAREHOUSE_SURPLUS_DOC_TYPE,
  WAREHOUSE_SURPLUS_INCOME_ITEM,
} from '../../../shared/types/warehouseGoodDocument.js';

export const parseLocalDate = (dt: unknown): Date | null => {
  if (!dt) return null;
  if (dt instanceof Date) return dt;
  if (typeof dt !== 'string') return null;

  const trimmed = dt.trim();
  const localMatch = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (localMatch) {
    const [, year, month, day, hours, minutes, seconds] = localMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds ?? '0'));
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatLocalDateTime = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const parseStockBalanceByStock = (value: unknown): Record<string, number> => {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, number>;
  if (typeof value !== 'string') return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const hasOwnStockInWarehouse = (stockBalanceByStock: unknown): boolean => {
  const stock = parseStockBalanceByStock(stockBalanceByStock);
  return Number(stock['2'] ?? 0) > 0;
};

export async function getEditorLabel(userId: number | null): Promise<string> {
  if (!userId) return 'користувач';
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (!user) return 'користувач';
    const name = String(user.name ?? '').trim();
    return name || String(user.email ?? '').trim() || 'користувач';
  } catch {
    return 'користувач';
  }
}

export function extractDilovodRemarkFromItems(itemsJson: string): string | null {
  try {
    const items = JSON.parse(itemsJson);
    if (!Array.isArray(items) || items.length === 0) return null;
    const first = items[0];
    if (!first || typeof first !== 'object') return null;
    const raw = (first as { dilovod_remark?: unknown }).dilovod_remark;
    const value = String(raw ?? '').trim();
    return value || null;
  } catch {
    return null;
  }
}

export function mergeDilovodRemarkIntoItems(itemsJson: string, remark: string): string {
  try {
    const items = JSON.parse(itemsJson);
    if (!Array.isArray(items) || items.length === 0) return itemsJson;
    const next = [...items];
    const first = next[0];
    if (first && typeof first === 'object') {
      next[0] = { ...first, dilovod_remark: remark };
    }
    return JSON.stringify(next);
  } catch {
    return itemsJson;
  }
}

export function buildGoodDocumentUpdateDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): Array<{ field: string; from: unknown; to: unknown }> {
  const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
  for (const field of fields) {
    const from = before[field];
    const to = after[field];
    if (String(from ?? '') !== String(to ?? '')) {
      changes.push({ field, from, to });
    }
  }
  return changes;
}

export function buildEditRemarkNote(
  editorLabel: string,
  changes: Array<{ field: string; from: unknown; to: unknown }>,
): string {
  const fieldLabels: Record<string, string> = {
    writeOffDate: 'дата',
    surplusDate: 'дата',
    comment: 'коментар',
    writeOffReason: 'причина',
    surplusReason: 'причина',
    storageId: 'склад',
    firmId: 'фірма',
    items: 'товари',
  };
  const mapped = changes.map((change) => ({
    field: fieldLabels[change.field] ?? change.field,
    from: change.from,
    to: change.to,
  }));
  return buildWarehouseReleaseEditRemarkNote(editorLabel, mapped);
}

export function appendDilovodRemark(previous: string | null | undefined, note: string): string {
  return appendWarehouseReleaseDilovodRemark(previous, note);
}

export async function enrichWriteOffItems(
  items: any[],
  firmId: string | null | undefined,
  asOfDate: Date | null,
  dilovodService?: DilovodService | null,
): Promise<any[]> {
  const skus = items.map((it) => it.sku).filter(Boolean);
  const found = skus.length ? await catalogOpsLookup.getBySkus(skus) : new Map();
  const skuToProduct = new Map(catalogOpsLookup.listUnique(found).map((p) => [p.sku, p]));

  const skusNeedingLookup = Array.from(
    new Set(items.filter((it) => !it.batchNumber && (it.batchId || it.batchName) && it.sku).map((it) => it.sku)),
  );
  const batchMap = new Map<string, any[]>();
  if (dilovodService && skusNeedingLookup.length > 0) {
    for (const s of skusNeedingLookup) {
      try {
        const batches = await dilovodService.getBatchNumbersBySku(s, firmId ?? undefined, asOfDate ?? undefined);
        batchMap.set(s, Array.isArray(batches) ? batches : []);
      } catch {
        batchMap.set(s, []);
      }
    }
  }

  return items.map((it) => {
    const prod = skuToProduct.get(it.sku) || null;
    let resolvedBatchName = it.batchNumber ?? it.batchName ?? null;
    if (!resolvedBatchName && it.batchId && it.sku && batchMap.has(it.sku)) {
      const candidates = batchMap.get(it.sku) || [];
      const foundBatch = candidates.find(
        (b) => String(b.batchId) === String(it.batchId) || String(b.id) === String(it.batchId),
      );
      if (foundBatch) resolvedBatchName = foundBatch.batchNumber ?? foundBatch.name ?? null;
    }
    return {
      ...it,
      productName: prod?.name ?? it.name ?? null,
      batchNumber: resolvedBatchName ?? it.batchId ?? null,
      sku: it.sku ?? null,
      productId: prod?.id ?? it.productId ?? null,
    };
  });
}

export async function buildTpGoodsForItems(
  items: any[],
  warehouseDefaults: { accountId: string; setAccountId: string; unitId: string },
): Promise<any[]> {
  const skus = items.map((it) => it.sku).filter(Boolean);
  const found = skus.length ? await catalogOpsLookup.getBySkus(skus) : new Map();
  const skuToProduct = new Map(catalogOpsLookup.listUnique(found).map((p) => [p.sku, p]));

  const tpGoods: any[] = [];
  let row = 1;
  for (const it of items) {
    const prod = skuToProduct.get(it.sku);
    if (!prod?.dilovodId) continue;
    const accGood = prod.set && hasOwnStockInWarehouse(prod.stockBalanceByStock)
      ? warehouseDefaults.setAccountId
      : warehouseDefaults.accountId;
    tpGoods.push({
      rowNum: row,
      good: prod.dilovodId,
      goodPart: it.batchId || null,
      unit: warehouseDefaults.unitId,
      qty: Number(it.quantity) || 0,
      accGood,
    });
    row += 1;
  }
  return tpGoods;
}

export function buildRemarkFromReason(
  reason: string,
  comment: string,
  productNames: string[],
): string {
  const reasonLabel = String(reason || '').replace(/[^\p{L}\p{N}\s\-]/gu, '').trim();
  const commentLabel = String(comment || '').trim();
  let remark = '';
  if (reasonLabel && productNames.length) {
    remark = `${reasonLabel}: ${productNames.join(', ')}`;
  } else if (reasonLabel) {
    remark = reasonLabel;
  } else if (productNames.length) {
    remark = productNames.join(', ');
  }
  if (commentLabel) {
    remark = remark ? `${remark} | ${commentLabel}` : commentLabel;
  }
  return remark;
}

export async function buildGoodDocumentPayload(input: {
  docType: string;
  /** Лише для documents.goodWriteOff (у goodWriteOn поля docMode немає). */
  docMode?: string;
  dilovodDocId?: string | null;
  saveType: 1 | 2;
  items: any[];
  reason: string;
  comment: string;
  firmId: string | null;
  storageId: string | null;
  date: Date;
  includeAccCosts?: boolean;
  accCosts?: string;
  authorDilovodId?: string | null;
}): Promise<{ payload: Record<string, unknown>; productNames: string[] }> {
  const { loadDilovodWarehouseDefaults } = await import('../../services/dilovod/DilovodWarehouseDefaults.js');
  const warehouseDefaults = await loadDilovodWarehouseDefaults();
  const formattedDate = formatLocalDateTime(input.date);

  const skus = input.items.map((it) => it.sku).filter(Boolean);
  const found = skus.length ? await catalogOpsLookup.getBySkus(skus) : new Map();
  const skuToProduct = new Map(catalogOpsLookup.listUnique(found).map((p) => [p.sku, p]));
  const productNames = input.items.map((it) => skuToProduct.get(it.sku)?.name ?? it.name ?? it.sku);
  const remark = buildRemarkFromReason(input.reason, input.comment, productNames);

  const isSurplus = input.docType === WAREHOUSE_SURPLUS_DOC_TYPE;

  const header: Record<string, unknown> = {
    id: input.saveType === 2 && input.dilovodDocId ? input.dilovodDocId : input.docType,
    date: formattedDate,
    storage: input.storageId,
    firm: input.firmId,
    posted: 1,
  };

  if (isSurplus) {
    header.incomeItem = WAREHOUSE_SURPLUS_INCOME_ITEM;
    header.accIncomes = WAREHOUSE_SURPLUS_ACC_INCOMES;
    header.business = warehouseDefaults.businessId;
    header.taxAccount = 1;
  } else if (input.docMode) {
    header.docMode = input.docMode;
  }

  if (input.includeAccCosts) {
    header.accCosts = input.accCosts ?? '1119000000001299';
  }
  if (input.authorDilovodId) {
    header.author = input.authorDilovodId;
  }
  if (remark) {
    header.remark = remark;
  }

  const tpGoods = await buildTpGoodsForItems(input.items, warehouseDefaults);

  const payload: Record<string, unknown> = {
    saveType: input.saveType,
    header,
    tableParts: { tpGoods },
  };

  return { payload, productNames };
}

export async function mapTpGoodsToHistoryItems(tpGoods: Record<string, any> | any[]): Promise<any[]> {
  const goods = Array.isArray(tpGoods) ? tpGoods : Object.values(tpGoods ?? {});
  const dilovodIds = goods.map((g) => g.good).filter(Boolean);
  const productRows = dilovodIds.length
    ? catalogOpsLookup.listUnique(await catalogOpsLookup.getByDilovodIds(dilovodIds))
    : [];
  const dilovodIdToProduct = new Map(productRows.map((p) => [p.dilovodId, p]));

  return goods.map((g) => {
    const product = dilovodIdToProduct.get(String(g.good));
    return {
      sku: product?.sku ?? '',
      name: product?.name ?? g.good__pr ?? '',
      productName: product?.name ?? g.good__pr ?? '',
      dilovodId: g.good ?? '',
      batchId: g.goodPart ?? null,
      batchNumber: g.goodPart__pr ?? g.batchNumber ?? null,
      quantity: Number(g.qty) || 0,
    };
  });
}
