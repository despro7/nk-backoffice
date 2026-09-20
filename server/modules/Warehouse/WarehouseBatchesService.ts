import { prisma, logServer } from '../../lib/utils.js';
import { DilovodApiClient } from '../../services/dilovod/DilovodApiClient.js';
import { dilovodMetadataService } from '../../services/dilovod/DilovodMetadataService.js';
import type {
  DilovodObjectMetadata,
  DilovodRegisterField,
  DilovodRegisterShape,
} from '../../services/dilovod/DilovodTypes.js';
import {
  formatDateForDilovod,
  getDilovodConfigFromDB,
  isDilovodDeletionMark,
  unwrapDilovodId,
} from '../../services/dilovod/DilovodUtils.js';
import {
  CATALOG_FINISHED_PRODUCTS_FOLDER_ID,
  CATALOG_TRASH_ID,
} from '../../../shared/types/catalog.js';
import type { WarehouseBatchListItem } from '../../../shared/types/warehouse.js';
import {
  isMissingDilovodDate,
  isUsableDilovodBatchId,
  pickHumanBatchLabel,
} from '../../../shared/utils/dilovodBatchId.js';
import {
  warehouseStatementValueTypeIncludes,
  WAREHOUSE_STATEMENT_VALUE_TYPES,
} from '../../../shared/types/warehouseStatement.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 500;
const BALANCE_SKU_CHUNK = 50;

type GoodPartFieldNames = {
  id: string;
  code: string;
  date: string;
  owner: string;
  expiration: string;
  delMark: string;
};

type GoodPartRow = {
  id: string;
  code: string;
  date: string;
  owner: string;
  expiration: string;
};

type BalanceShapeResolved = {
  registerName: string;
  goodDim: string;
  goodPartDim: string;
  storageDim: string;
  firmDim: string;
  qtyResource: string;
};

type BatchStockTotals = {
  total: number;
  gp: number;
  ms: number;
};

type BatchBarcodeRow = {
  code: string;
  registeredAt: string | null;
};

interface CacheEntry {
  data: WarehouseBatchListItem[];
  timestamp: number;
}

const listCache = new Map<string, CacheEntry>();

const DEFAULT_GOOD_PART_FIELDS: GoodPartFieldNames = {
  id: 'id',
  code: 'code',
  date: 'date',
  owner: 'owner',
  expiration: 'expiration',
  delMark: 'delMark',
};

function reqsToNames(meta: DilovodObjectMetadata): Set<string> {
  const names = new Set<string>();
  const reqs = meta.reqs;
  if (!reqs) return names;
  if (Array.isArray(reqs)) {
    for (const item of reqs) {
      const name = typeof item?.name === 'string' ? item.name.trim() : '';
      if (name) names.add(name);
    }
    return names;
  }
  if (typeof reqs === 'object') {
    for (const name of Object.keys(reqs)) {
      if (name.trim()) names.add(name.trim());
    }
  }
  return names;
}

function pickFieldName(available: Set<string>, candidates: string[], fallback: string): string {
  for (const candidate of candidates) {
    if (available.has(candidate)) return candidate;
  }
  if (available.has(fallback)) return fallback;
  return fallback;
}

function resolveGoodPartFieldNames(meta: DilovodObjectMetadata): GoodPartFieldNames {
  const available = reqsToNames(meta);
  if (available.size === 0) {
    logServer('[WarehouseBatches] catalogs.goodParts metadata без reqs — fallback на відомі імена полів');
    return DEFAULT_GOOD_PART_FIELDS;
  }
  return {
    id: pickFieldName(available, ['id'], 'id'),
    code: pickFieldName(available, ['code'], 'code'),
    date: pickFieldName(available, ['date'], 'date'),
    owner: pickFieldName(available, ['owner'], 'owner'),
    expiration: pickFieldName(available, ['expiration'], 'expiration'),
    delMark: pickFieldName(available, ['delMark', 'deletionMark'], 'delMark'),
  };
}

function findDimensionByValueType(
  dimensions: DilovodRegisterField[],
  valueType: string,
  fallbackName: string,
): string {
  const match = dimensions.find((dim) => warehouseStatementValueTypeIncludes(dim.valueType, valueType));
  return match?.name ?? fallbackName;
}

function pickQtyResourceName(resources: DilovodRegisterField[]): string {
  const byName = resources.find((field) => field.name === 'qty');
  if (byName) return byName.name;
  const byVt = resources.find((field) => (field.valueType || '').toLowerCase().includes('qty'));
  if (byVt) return byVt.name;
  return resources[0]?.name ?? 'qty';
}

function resolveBalanceShape(shape: DilovodRegisterShape): BalanceShapeResolved {
  const goodPartDim = shape.dimensions.find(
    (dim) =>
      warehouseStatementValueTypeIncludes(dim.valueType, 'catalogs.goodparts')
      || dim.name.toLowerCase() === 'goodpart',
  )?.name ?? 'goodPart';

  return {
    registerName: shape.registerName,
    goodDim: findDimensionByValueType(
      shape.dimensions,
      WAREHOUSE_STATEMENT_VALUE_TYPES.goods,
      'good',
    ),
    goodPartDim,
    storageDim: findDimensionByValueType(
      shape.dimensions,
      WAREHOUSE_STATEMENT_VALUE_TYPES.storages,
      'storage',
    ),
    firmDim: findDimensionByValueType(
      shape.dimensions,
      WAREHOUSE_STATEMENT_VALUE_TYPES.firms,
      'firm',
    ),
    qtyResource: pickQtyResourceName(shape.resources),
  };
}

function normalizeDilovodDate(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (isMissingDilovodDate(raw)) return null;
  return raw.slice(0, 10);
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export class WarehouseBatchesService {
  private readonly api = new DilovodApiClient();

  async list(options?: {
    onlyWithStock?: boolean;
    limit?: number;
    forceRefresh?: boolean;
  }): Promise<{ items: WarehouseBatchListItem[]; onlyWithStock: boolean; limit: number }> {
    const onlyWithStock = options?.onlyWithStock !== false;
    const limit = Math.min(Math.max(Number(options?.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const cacheKey = onlyWithStock ? 'stock:1' : 'stock:0';

    if (!options?.forceRefresh) {
      const cached = listCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return {
          items: cached.data.slice(0, limit),
          onlyWithStock,
          limit,
        };
      }
    }

    const items = await this.loadItems(onlyWithStock, limit);
    listCache.set(cacheKey, { data: items, timestamp: Date.now() });
    return { items, onlyWithStock, limit };
  }

  private async loadItems(onlyWithStock: boolean, limit: number): Promise<WarehouseBatchListItem[]> {
    await this.api.ensureReady();

    const [goodPartsMeta, goodsShape] = await Promise.all([
      dilovodMetadataService.getObject('catalogs.goodParts'),
      dilovodMetadataService.getRegisterShape('goods'),
    ]);

    const fieldNames = resolveGoodPartFieldNames(goodPartsMeta);
    const balanceShape = resolveBalanceShape(goodsShape);
    const ownerIdsInFolder = await this.loadLeafGoodIdsInFolder(CATALOG_FINISHED_PRODUCTS_FOLDER_ID);
    const ownerSet = new Set(ownerIdsInFolder);

    const goodPartRows = await this.fetchGoodParts(fieldNames);
    const filteredParts = goodPartRows.filter((row) => ownerSet.has(row.owner));

    const ownerIds = [...new Set(filteredParts.map((row) => row.owner))];
    const goodsById = await this.loadGoodsById(ownerIds);
    const skus = [...new Set(
      ownerIds
        .map((ownerId) => goodsById.get(ownerId)?.sku)
        .filter((sku): sku is string => Boolean(sku)),
    )];

    const dilovodConfig = await getDilovodConfigFromDB();
    const stockByBatchId = await this.fetchStockByBatchId(
      balanceShape,
      skus,
      onlyWithStock,
      dilovodConfig.mainStorageId,
      dilovodConfig.smallStorageId,
    );
    const batchIds = filteredParts.map((row) => row.id);
    const barcodesByPart = await this.loadBarcodesByPart(batchIds);

    const rows: WarehouseBatchListItem[] = [];
    for (const part of filteredParts) {
      const stock = stockByBatchId.get(part.id) ?? { total: 0, gp: 0, ms: 0 };
      if (onlyWithStock && stock.total <= 0) continue;

      const good = goodsById.get(part.owner);
      const barcodes = barcodesByPart.get(part.id) ?? [];
      const lastBarcode = barcodes[0] ?? null;
      const batchNumber = pickHumanBatchLabel(part.id, part.code) || part.id;

      rows.push({
        batchId: part.id,
        batchNumber,
        createdAt: normalizeDilovodDate(part.date),
        expiration: normalizeDilovodDate(part.expiration),
        productId: part.owner,
        productName: good?.name || '—',
        sku: good?.sku ?? null,
        quantityGp: stock.gp,
        quantityMs: stock.ms,
        totalQuantity: stock.total,
        barcodeCount: barcodes.length,
        barcodes,
        lastBarcode: lastBarcode?.code ?? null,
        lastBarcodeRegisteredAt: lastBarcode?.registeredAt ?? null,
      });
    }

    rows.sort((a, b) => {
      const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
      return bTime - aTime;
    });

    return rows.slice(0, limit);
  }

  private async fetchGoodParts(fieldNames: GoodPartFieldNames): Promise<GoodPartRow[]> {
    const fields = Object.fromEntries(
      Object.entries(fieldNames).map(([alias, name]) => [alias, name]),
    );

    const resp = await this.api.makeRequest<unknown>({
      version: '0.25',
      key: this.api.getApiKey(),
      action: 'request',
      params: {
        from: 'catalogs.goodParts',
        fields,
      },
    });

    const rawRows = this.asRows(resp);
    const result: GoodPartRow[] = [];

    for (const row of rawRows) {
      if (isDilovodDeletionMark(row[fieldNames.delMark])) continue;
      const id = unwrapDilovodId(row[fieldNames.id]);
      if (!isUsableDilovodBatchId(id)) continue;
      const owner = unwrapDilovodId(row[fieldNames.owner]);
      if (!owner) continue;

      result.push({
        id,
        code: String(row[fieldNames.code] ?? '').trim(),
        date: String(row[fieldNames.date] ?? '').trim(),
        owner,
        expiration: String(row[fieldNames.expiration] ?? '').trim(),
      });
    }

    return result;
  }

  private async fetchStockByBatchId(
    shape: BalanceShapeResolved,
    skus: string[],
    onlyWithStock: boolean,
    mainStorageId?: string,
    smallStorageId?: string,
  ): Promise<Map<string, BatchStockTotals>> {
    const stockByBatchId = new Map<string, BatchStockTotals>();
    if (skus.length === 0) return stockByBatchId;

    const formattedDate = formatDateForDilovod('Kyiv');
    const dimensions = [shape.goodDim, shape.goodPartDim, shape.storageDim, shape.firmDim];
    const fields: Record<string, string> = {
      [shape.goodDim]: 'id',
      [`${shape.goodDim}.productNum`]: 'sku',
      [shape.goodPartDim]: shape.goodPartDim,
      [shape.storageDim]: shape.storageDim,
      [shape.firmDim]: shape.firmDim,
      [shape.qtyResource]: 'qty',
    };

    for (const skuChunk of chunkArray(skus, BALANCE_SKU_CHUNK)) {
      const resp = await this.api.makeRequest<unknown>({
        version: '0.25',
        key: this.api.getApiKey(),
        action: 'request',
        params: {
          from: {
            type: 'balance',
            register: shape.registerName,
            date: formattedDate,
            dimensions,
          },
          fields,
          filters: [
            { alias: 'sku', operator: 'IL', value: skuChunk },
            ...(onlyWithStock ? [{ alias: 'qty', operator: '>', value: 0 }] : []),
          ],
        },
      });

      for (const row of this.asRows(resp)) {
        if (row && typeof row === 'object' && 'error' in row) continue;
        const batchId = unwrapDilovodId(row[shape.goodPartDim]);
        if (!isUsableDilovodBatchId(batchId)) continue;
        const storageId = unwrapDilovodId(row[shape.storageDim]);
        const rawQty = Number.parseFloat(String(row.qty ?? row[shape.qtyResource] ?? ''));
        const qty = Number.isFinite(rawQty) ? rawQty : 0;

        const current = stockByBatchId.get(batchId) ?? { total: 0, gp: 0, ms: 0 };
        current.total += qty;
        if (mainStorageId && storageId === mainStorageId) {
          current.gp += qty;
        } else if (smallStorageId && storageId === smallStorageId) {
          current.ms += qty;
        }
        stockByBatchId.set(batchId, current);
      }
    }

    return stockByBatchId;
  }

  private async loadGoodsById(
    ownerIds: string[],
  ): Promise<Map<string, { id: string; name: string; sku: string | null }>> {
    const map = new Map<string, { id: string; name: string; sku: string | null }>();
    if (ownerIds.length === 0) return map;

    const goods = await prisma.catalogGood.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, name: true, sku: true },
    });

    for (const good of goods) {
      map.set(good.id, {
        id: good.id,
        name: good.name,
        sku: good.sku ? String(good.sku) : null,
      });
    }
    return map;
  }

  private async loadBarcodesByPart(batchIds: string[]): Promise<Map<string, BatchBarcodeRow[]>> {
    const map = new Map<string, BatchBarcodeRow[]>();
    if (batchIds.length === 0) return map;

    const rows = await prisma.catalogGoodBarcode.findMany({
      where: {
        goodPart: { in: batchIds },
        activity: true,
      },
      select: { goodPart: true, code: true, updatedAt: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });

    for (const row of rows) {
      const partId = String(row.goodPart ?? '').trim();
      const code = String(row.code ?? '').trim();
      if (!partId || !code) continue;
      const list = map.get(partId) ?? [];
      list.push({
        code,
        registeredAt: row.updatedAt?.toISOString() ?? null,
      });
      map.set(partId, list);
    }

    return map;
  }

  private async loadLeafGoodIdsInFolder(folderId: string): Promise<string[]> {
    const folderIds = new Set<string>([folderId]);
    let frontier = [folderId];

    while (frontier.length > 0) {
      const children = await prisma.catalogGood.findMany({
        where: {
          isGroup: true,
          parentId: { in: frontier },
          id: { not: CATALOG_TRASH_ID },
        },
        select: { id: true },
      });
      frontier = [];
      for (const child of children) {
        if (folderIds.has(child.id)) continue;
        folderIds.add(child.id);
        frontier.push(child.id);
      }
    }

    const leaves = await prisma.catalogGood.findMany({
      where: {
        isGroup: false,
        parentId: { in: [...folderIds] },
        id: { not: CATALOG_TRASH_ID },
      },
      select: { id: true },
    });

    return leaves.map((row) => row.id);
  }

  private asRows(resp: unknown): Record<string, unknown>[] {
    if (Array.isArray(resp)) return resp as Record<string, unknown>[];
    if (resp && typeof resp === 'object' && Array.isArray((resp as { data?: unknown }).data)) {
      return (resp as { data: Record<string, unknown>[] }).data;
    }
    return [];
  }
}

export const warehouseBatchesService = new WarehouseBatchesService();
