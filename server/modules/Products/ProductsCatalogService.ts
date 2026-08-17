/**
 * ProductsCatalogService — orchestration for /api/catalog.
 * Dilovod is SoT; local catalog_* is a mirror read via UI.
 */

import { prisma, logServer } from '../../lib/utils.js';
import {
  CATALOG_ACC_POLICY_GOOD,
  CATALOG_ACC_POLICY_KIT,
  CATALOG_DEFAULT_MAIN_UNIT_ID,
  CATALOG_TRASH_ID,
  CatalogCreateGoodInput,
  CatalogDictionariesDto,
  CatalogGoodDetailDto,
  CatalogGoodDto,
  CatalogGoodImageDto,
  CatalogReorderInput,
  CatalogTreeNodeDto,
  CatalogUnitDto,
  CatalogUpdateGoodInput,
} from '../../../shared/types/catalog.js';
import {
  computeIntervalSortOrder,
  rebalanceSortOrders,
} from '../../../shared/utils/catalogSortOrder.js';
import { productsDilovodGateway } from './ProductsDilovodGateway.js';
import { productsLocalSync } from './ProductsLocalSync.js';
import { catalogMediaService } from './CatalogMediaService.js';
import { pickLatestSku } from './skuUtils.js';
import {
  DilovodCatalogGoodRow,
  DilovodDictItem,
  DilovodSaveGoodParams,
  LocalSyncGoodPayload,
  isArchiveFolderName,
  isKitAccPolicy,
} from './ProductsTypes.js';

const BRANCH_REFRESH_MAX_NODES = 2000;
const BRANCH_REFRESH_MAX_DEPTH = 20;

/** Dilovod multilang string для description / printName. */
function toMultilang(value: string | null | undefined): { uk: string; ru: string } | undefined {
  const s = String(value || '').trim();
  if (!s) return undefined;
  return { uk: s, ru: s };
}

function normalizeParentId(parent: string | null | undefined): string | null {
  if (!parent || parent === '0' || parent === '') return null;
  return parent;
}

/** Вага в catalog — кг (float); у products — грами (Int). */
function weightKgToGrams(weightKg: number | null | undefined): number | null {
  if (weightKg == null || Number.isNaN(Number(weightKg))) return null;
  return Math.round(Number(weightKg) * 1000);
}

function parseStockJson(
  raw: string | null | undefined
): { mainStock: number; smallStock: number; stockBalanceByStock: Record<string, number> | null } {
  if (!raw) {
    return { mainStock: 0, smallStock: 0, stockBalanceByStock: null };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return {
      mainStock: Number(parsed['1'] || 0),
      smallStock: Number(parsed['2'] || 0),
      stockBalanceByStock: parsed,
    };
  } catch {
    return { mainStock: 0, smallStock: 0, stockBalanceByStock: null };
  }
}

function toStructurePayload(g: DilovodCatalogGoodRow): LocalSyncGoodPayload {
  return {
    id: g.id,
    parentId: normalizeParentId(g.parent),
    isGroup: g.isGroup,
    delMark: g.delMark,
    name: g.name || g.sku || g.id,
    sku: g.sku,
    mainUnitId: g.mainUnitId,
    packageRatio: g.packageRatio,
    weight: g.weight,
    accPolicyId: g.accPolicyId,
    printName: g.printName,
    description: g.description,
  };
}

function mapGoodDto(
  row: {
    id: string;
    parentId: string | null;
    isGroup: boolean;
    delMark: boolean;
    name: string;
    sku: string | null;
    mainUnitId: string | null;
    packageRatio: number | null;
    weight: number | null;
    accPolicyId: string | null;
    printName: string | null;
    description: string | null;
    fullDescription?: string | null;
    sortOrder?: number;
    unitRatio?: number | null;
    stockBalanceByStock?: string | null;
    syncedAt: Date;
    updatedAt: Date;
    _count?: { components?: number };
  },
  parentName: string | null = null
): CatalogGoodDto {
  const isKit = isKitAccPolicy(row.accPolicyId);
  const stock = parseStockJson(row.stockBalanceByStock);
  return {
    id: row.id,
    parentId: row.parentId,
    parentName,
    isGroup: row.isGroup,
    delMark: row.delMark,
    name: row.name,
    sku: row.sku,
    mainUnitId: row.mainUnitId,
    packageRatio: row.packageRatio,
    weight: row.weight,
    accPolicyId: row.accPolicyId,
    printName: row.printName,
    description: row.description,
    fullDescription: row.fullDescription ?? null,
    sortOrder: row.sortOrder ?? 0,
    unitRatio: row.unitRatio ?? 1,
    mainStock: stock.mainStock,
    smallStock: stock.smallStock,
    stockBalanceByStock: stock.stockBalanceByStock,
    syncedAt: row.syncedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isKit,
  };
}

export class ProductsCatalogService {
  /**
   * Dual-write ops-полів catalog → products (за dilovodId або sku).
   * Не чіпає set / dilovodDataHash.
   */
  async syncCatalogOpsFieldsToProducts(goodId: string): Promise<void> {
    const good = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      select: {
        id: true,
        sku: true,
        isGroup: true,
        unitRatio: true,
        weight: true,
        packageRatio: true,
        sortOrder: true,
        stockBalanceByStock: true,
      },
    });
    if (!good || good.isGroup) return;

    const data: {
      unitRatio?: number;
      weight?: number | null;
      portionsPerBox?: number;
      manualOrder?: number;
      stockBalanceByStock?: string | null;
    } = {};

    if (good.unitRatio != null) data.unitRatio = good.unitRatio;
    const grams = weightKgToGrams(good.weight);
    if (grams != null) data.weight = grams;
    if (good.packageRatio != null && !Number.isNaN(Number(good.packageRatio))) {
      data.portionsPerBox = Math.max(1, Math.round(Number(good.packageRatio)));
    }
    if (good.sortOrder != null) data.manualOrder = good.sortOrder;
    if (good.stockBalanceByStock != null) {
      data.stockBalanceByStock = good.stockBalanceByStock;
    }

    if (Object.keys(data).length === 0) return;

    const where =
      good.sku != null && good.sku.trim()
        ? { OR: [{ dilovodId: good.id }, { sku: good.sku }] }
        : { dilovodId: good.id };

    try {
      await prisma.product.updateMany({ where, data });
    } catch (err) {
      logServer('[ProductsCatalogService] syncCatalogOpsFieldsToProducts failed', {
        goodId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async getTree(options?: { includeTrash?: boolean }): Promise<CatalogTreeNodeDto[]> {
    const includeTrash = options?.includeTrash === true;
    const groups = await prisma.catalogGood.findMany({
      where: {
        isGroup: true,
        // Prisma `parentId: { not: X }` також відсікає NULL → корінь каталогу зникає з дерева.
        // Тому явно дозволяємо null/"0"/"" і лише виключаємо дітей смітника.
        ...(includeTrash
          ? {}
          : {
              id: { not: CATALOG_TRASH_ID },
              OR: [
                { parentId: null },
                { parentId: '0' },
                { parentId: '' },
                { parentId: { not: CATALOG_TRASH_ID } },
              ],
            }),
      },
      select: {
        id: true,
        parentId: true,
        name: true,
        isGroup: true,
        delMark: true,
        sku: true,
        accPolicyId: true,
        sortOrder: true,
        _count: { select: { components: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const childCounts = await prisma.catalogGood.groupBy({
      by: ['parentId'],
      where: {
        parentId: { not: null },
        ...(includeTrash ? {} : { parentId: { not: CATALOG_TRASH_ID } }),
      },
      _count: { _all: true },
    });
    const countMap = new Map(
      childCounts.map((c) => [c.parentId as string, c._count._all])
    );

    return groups
      .filter((g) => includeTrash || g.id !== CATALOG_TRASH_ID)
      .map((g) => ({
        id: g.id,
        parentId: g.parentId,
        name: g.name,
        isGroup: g.isGroup,
        delMark: g.delMark,
        sku: g.sku,
        isKit: isKitAccPolicy(g.accPolicyId),
        childrenCount: countMap.get(g.id) ?? 0,
        sortOrder: g.sortOrder,
      }));
  }

  async getFolderChildren(folderId: string | null): Promise<CatalogGoodDto[]> {
    const isRoot = !folderId || folderId === 'root';
    // Dilovod корінь каталогу = parent "0" (іноді null після нормалізації)
    const rows = await prisma.catalogGood.findMany({
      where: {
        id: { not: CATALOG_TRASH_ID },
        ...(isRoot
          ? { OR: [{ parentId: null }, { parentId: '0' }, { parentId: '' }] }
          : { parentId: folderId }),
      },
      include: { _count: { select: { components: true } } },
      orderBy: [{ isGroup: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => mapGoodDto(row));
  }

  /**
   * Ids папки та всіх вкладених груп (рекурсивно) для фільтра пошуку.
   * Якщо папку не знайдено — порожній масив.
   */
  private async resolveFolderSubtreeIds(options: {
    underFolderId?: string | null;
    underFolderName?: string | null;
  }): Promise<string[]> {
    const byId = String(options.underFolderId || '').trim();
    const byName = String(options.underFolderName || '').trim();

    let rootId: string | null = null;
    if (byId) {
      const folder = await prisma.catalogGood.findFirst({
        where: { id: byId, isGroup: true },
        select: { id: true },
      });
      rootId = folder?.id ?? null;
    } else if (byName) {
      const folder = await prisma.catalogGood.findFirst({
        where: {
          isGroup: true,
          id: { not: CATALOG_TRASH_ID },
          name: byName,
        },
        select: { id: true },
      });
      rootId = folder?.id ?? null;
    }

    if (!rootId) return [];

    const folderIds = new Set<string>([rootId]);
    let frontier = [rootId];
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
    return [...folderIds];
  }

  /**
   * TEMP: SKU товарів у піддереві папки для dual-write в legacy `products`.
   * Архівні — окремо, щоб лише позначити isOutdated без Dilovod sync-manual.
   */
  async listSkusInFolderSubtree(folderId: string | null): Promise<{
    activeSkus: string[];
    archivedSkus: string[];
  }> {
    const parentIds =
      folderId == null
        ? null
        : await this.resolveFolderSubtreeIds({ underFolderId: folderId });
    if (folderId != null && (!parentIds || parentIds.length === 0)) {
      return { activeSkus: [], archivedSkus: [] };
    }

    const rows = await prisma.catalogGood.findMany({
      where:
        folderId == null
          ? {
              isGroup: false,
              id: { not: CATALOG_TRASH_ID },
              parentId: { not: CATALOG_TRASH_ID },
            }
          : {
              isGroup: false,
              parentId: { in: parentIds },
            },
      select: { sku: true, parentId: true },
    });
    return await this.splitSkusByArchiveParent(rows);
  }

  /**
   * TEMP: архівні SKU лише isOutdated у `products`; решта йде в Dilovod sync-manual.
   */
  async partitionCatalogSkusByArchive(skus: string[]): Promise<{
    activeSkus: string[];
    archivedSkus: string[];
  }> {
    const unique = [...new Set(skus.map((s) => s.trim()).filter(Boolean))];
    if (unique.length === 0) return { activeSkus: [], archivedSkus: [] };

    const rows = await prisma.catalogGood.findMany({
      where: { isGroup: false, sku: { in: unique } },
      select: { sku: true, parentId: true },
    });
    const split = await this.splitSkusByArchiveParent(rows);
    const known = new Set([...split.activeSkus, ...split.archivedSkus]);
    const unknown = unique.filter((sku) => !known.has(sku));
    return {
      activeSkus: [...split.activeSkus, ...unknown],
      archivedSkus: split.archivedSkus,
    };
  }

  async markLegacyProductsOutdatedBySku(skus: string[]): Promise<number> {
    if (skus.length === 0) return 0;
    const result = await prisma.product.updateMany({
      where: { sku: { in: skus } },
      data: { isOutdated: true },
    });
    return result.count;
  }

  private async splitSkusByArchiveParent(
    rows: Array<{ sku: string | null; parentId: string | null }>
  ): Promise<{ activeSkus: string[]; archivedSkus: string[] }> {
    const parentIds = [
      ...new Set(rows.map((row) => row.parentId).filter((id): id is string => Boolean(id))),
    ];
    const parents =
      parentIds.length > 0
        ? await prisma.catalogGood.findMany({
            where: { id: { in: parentIds } },
            select: { id: true, name: true, isGroup: true },
          })
        : [];
    const archiveParentIds = new Set(
      parents
        .filter((parent) => parent.isGroup && isArchiveFolderName(parent.name))
        .map((parent) => parent.id)
    );

    const seenActive = new Set<string>();
    const seenArchived = new Set<string>();
    const activeSkus: string[] = [];
    const archivedSkus: string[] = [];

    for (const row of rows) {
      const sku = row.sku?.trim();
      if (!sku) continue;
      const isArchived = Boolean(row.parentId && archiveParentIds.has(row.parentId));
      if (isArchived) {
        if (seenArchived.has(sku) || seenActive.has(sku)) continue;
        seenArchived.add(sku);
        archivedSkus.push(sku);
      } else {
        if (seenActive.has(sku)) continue;
        seenActive.add(sku);
        if (seenArchived.has(sku)) {
          seenArchived.delete(sku);
          const idx = archivedSkus.indexOf(sku);
          if (idx >= 0) archivedSkus.splice(idx, 1);
        }
        activeSkus.push(sku);
      }
    }

    return { activeSkus, archivedSkus };
  }

  async search(
    q: string,
    limit = 50,
    options?: { underFolderId?: string | null; underFolderName?: string | null }
  ): Promise<CatalogGoodDto[]> {
    const query = String(q || '').trim();
    if (!query) return [];

    const underFolderId = options?.underFolderId;
    const underFolderName = options?.underFolderName;
    let parentIds: string[] | null = null;
    if (underFolderId || underFolderName) {
      parentIds = await this.resolveFolderSubtreeIds({ underFolderId, underFolderName });
      if (parentIds.length === 0) return [];
    }

    const rows = await prisma.catalogGood.findMany({
      where: {
        id: { not: CATALOG_TRASH_ID },
        ...(parentIds ? { parentId: { in: parentIds } } : {}),
        OR: [
          { name: { contains: query } },
          { sku: { contains: query } },
          { printName: { contains: query } },
        ],
      },
      include: { _count: { select: { components: true } } },
      take: Math.min(limit, 200),
      orderBy: { name: 'asc' },
    });
    const uniqueParentIds = [
      ...new Set(rows.map((row) => row.parentId).filter((id): id is string => Boolean(id))),
    ];
    const parents =
      uniqueParentIds.length > 0
        ? await prisma.catalogGood.findMany({
            where: { id: { in: uniqueParentIds } },
            select: { id: true, name: true },
          })
        : [];
    const parentNameById = new Map(parents.map((parent) => [parent.id, parent.name]));
    return rows.map((row) =>
      mapGoodDto(row, row.parentId ? parentNameById.get(row.parentId) ?? null : null)
    );
  }

  async getTrash(): Promise<CatalogGoodDto[]> {
    const rows = await prisma.catalogGood.findMany({
      where: { parentId: CATALOG_TRASH_ID },
      include: { _count: { select: { components: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => mapGoodDto(row));
  }

  async getUnits(): Promise<CatalogUnitDto[]> {
    try {
      const units = await productsDilovodGateway.fetchUnits();
      return units;
    } catch (error) {
      logServer('[ProductsCatalogService] getUnits failed', error);
      return [
        { id: CATALOG_DEFAULT_MAIN_UNIT_ID, name: 'шт.', code: 'pcs' },
      ];
    }
  }

  /** Кешовані довідники Dilovod для UI (units, priceTypes, currencies, accPolicies). */
  async getDictionaries(): Promise<CatalogDictionariesDto> {
    const [units, priceTypes, currencies, accPolicies] = await Promise.all([
      productsDilovodGateway.fetchCachedDict('units').catch((err) => {
        logServer('[ProductsCatalogService] units dict failed', err);
        return [{ id: CATALOG_DEFAULT_MAIN_UNIT_ID, name: 'шт.', code: 'pcs' }];
      }),
      productsDilovodGateway.fetchCachedDict('priceTypes').catch((err) => {
        logServer('[ProductsCatalogService] priceTypes dict failed', err);
        return [] as DilovodDictItem[];
      }),
      productsDilovodGateway.fetchCachedDict('currency').catch((err) => {
        logServer('[ProductsCatalogService] currency dict failed', err);
        return [] as DilovodDictItem[];
      }),
      productsDilovodGateway.fetchCachedDict('accPolicies').catch((err) => {
        logServer('[ProductsCatalogService] accPolicies dict failed', err);
        return [] as DilovodDictItem[];
      }),
    ]);

    return { units, priceTypes, currencies, accPolicies };
  }

  /**
   * Наступний SKU: останній у поточній папці (локальне дзеркало) +1,
   * з перевіркою унікальності по всьому каталогу Dilovod.
   */
  async suggestNextSku(parentId: string | null, excludeId?: string): Promise<string> {
    const isRoot = !parentId || parentId === 'root';
    const siblings = await prisma.catalogGood.findMany({
      where: {
        isGroup: false,
        sku: { not: null },
        ...(excludeId ? { id: { not: excludeId } } : {}),
        ...(isRoot
          ? { OR: [{ parentId: null }, { parentId: '0' }, { parentId: '' }] }
          : { parentId }),
      },
      select: { sku: true },
    });

    const latest = pickLatestSku(siblings.map((r) => r.sku || ''));
    const base = latest || '01000';
    return productsDilovodGateway.allocateNextSku(base);
  }

  /**
   * Наступний EAN-13: max серед активних ШК у Dilovod +1 з перерахунком check digit.
   */
  async suggestNextBarcode(): Promise<string> {
    return productsDilovodGateway.allocateNextBarcode();
  }

  async getGoodDetail(
    id: string,
    options?: { livePull?: boolean }
  ): Promise<CatalogGoodDetailDto | null> {
    const exists = await prisma.catalogGood.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) return null;

    // Live-pull лише при відкритті картки (GET); внутрішні виклики читають локально
    if (options?.livePull) {
      try {
        await this.syncGoodFromDilovodLive(id);
      } catch (err) {
        logServer(`[ProductsCatalogService] live pull for ${id} failed, using local snapshot`, err);
      }
    }

    return this.readGoodDetailFromLocal(id);
  }

  private async syncGoodFromDilovodLive(id: string): Promise<void> {
    const obj = await productsDilovodGateway.getObject(id);
    const mapped = productsDilovodGateway.mapObjectToLocal(obj);

    const prices = mapped.isGroup
      ? []
      : await productsDilovodGateway.fetchPricesForGoods([id]);
    const barcodes = mapped.isGroup
      ? []
      : await productsDilovodGateway.fetchBarcodesForGoods([id]);

    const payload: LocalSyncGoodPayload = {
      id: mapped.id,
      parentId: mapped.parentId,
      isGroup: mapped.isGroup,
      delMark: mapped.delMark,
      name: mapped.name || mapped.sku || mapped.id,
      sku: mapped.sku,
      mainUnitId: mapped.mainUnitId,
      packageRatio: mapped.packageRatio,
      weight: mapped.weight,
      accPolicyId: mapped.accPolicyId,
      printName: mapped.printName,
      description: mapped.description,
      components: mapped.components,
      prices: prices.map((p) => ({
        priceType: p.priceType,
        price: p.price,
        currency: p.currency,
      })),
      barcodes: barcodes.map((b) => ({
        code: b.code,
        activity: b.activity,
        dilovodRegisterId: b.dilovodRegisterId,
        goodPart: b.goodPart,
        goodPartName: b.goodPartName,
      })),
    };

    await productsLocalSync.syncGood(payload);
  }

  private async readGoodDetailFromLocal(id: string): Promise<CatalogGoodDetailDto | null> {
    const row = await prisma.catalogGood.findUnique({
      where: { id },
      include: {
        components: { orderBy: { rowNum: 'asc' } },
        prices: true,
        barcodes: true,
        images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
        _count: { select: { components: true } },
      },
    });
    if (!row) return null;

    const componentIds = row.components.map((c) => c.componentGoodId);
    const componentGoods =
      componentIds.length > 0
        ? await prisma.catalogGood.findMany({
            where: { id: { in: componentIds } },
            select: { id: true, name: true, sku: true },
          })
        : [];
    const componentMap = new Map(componentGoods.map((g) => [g.id, g]));

    let parentName: string | null = null;
    const parentId = row.parentId?.trim();
    if (parentId && parentId !== '0') {
      const parent = await prisma.catalogGood.findUnique({
        where: { id: parentId },
        select: { name: true },
      });
      parentName = parent?.name ?? null;
    }

    let stock: CatalogGoodDetailDto['stock'] = null;
    if (!row.isGroup) {
      // Спочатку дзеркало на catalog_goods; fallback на products
      if (row.stockBalanceByStock) {
        const parsed = parseStockJson(row.stockBalanceByStock);
        stock = {
          mainStock: parsed.mainStock,
          smallStock: parsed.smallStock,
          stockBalanceByStock: parsed.stockBalanceByStock,
        };
      } else if (row.sku) {
        const product = await prisma.product.findFirst({
          where: { OR: [{ dilovodId: row.id }, { sku: row.sku }] },
          select: { stockBalanceByStock: true },
        });
        if (product?.stockBalanceByStock) {
          const parsed = parseStockJson(product.stockBalanceByStock);
          stock = {
            mainStock: parsed.mainStock,
            smallStock: parsed.smallStock,
            stockBalanceByStock: parsed.stockBalanceByStock,
          };
        } else {
          stock = { mainStock: 0, smallStock: 0, stockBalanceByStock: null };
        }
      } else {
        stock = { mainStock: 0, smallStock: 0, stockBalanceByStock: null };
      }
    }

    const images: CatalogGoodImageDto[] = row.images.map((img) => ({
      id: img.id,
      goodId: img.goodId,
      fileName: img.fileName,
      originalName: img.originalName,
      mimeType: img.mimeType,
      size: img.size,
      sortOrder: img.sortOrder,
      isPrimary: img.isPrimary,
      url: `/uploads/catalog/${encodeURIComponent(img.goodId)}/${encodeURIComponent(img.fileName)}`,
      createdAt: img.createdAt.toISOString(),
      updatedAt: img.updatedAt.toISOString(),
    }));

    return {
      ...mapGoodDto(row, parentName),
      components: row.components.map((c) => ({
        id: c.id,
        parentGoodId: c.parentGoodId,
        componentGoodId: c.componentGoodId,
        componentName: componentMap.get(c.componentGoodId)?.name,
        componentSku: componentMap.get(c.componentGoodId)?.sku ?? null,
        qty: c.qty,
        rowNum: c.rowNum,
        unitId: c.unitId ?? null,
        note: c.note ?? null,
      })),
      prices: row.prices.map((p) => ({
        id: p.id,
        goodId: p.goodId,
        priceType: p.priceType,
        price: p.price,
        currency: p.currency,
      })),
      barcodes: row.barcodes.map((b) => ({
        id: b.id,
        goodId: b.goodId,
        dilovodRegisterId: b.dilovodRegisterId,
        code: b.code,
        goodPart: b.goodPart || null,
        goodPartName: b.goodPartName,
        activity: b.activity,
      })),
      images,
      stock,
    };
  }

  async createGood(input: CatalogCreateGoodInput): Promise<CatalogGoodDetailDto> {
    const isGroup = Boolean(input.isGroup);
    const name = String(input.name || '').trim();
    if (!name) throw new Error('Назва обовʼязкова');

    const hasComponents = (input.components?.length ?? 0) > 0;
    const accPolicyId =
      input.accPolicyId ||
      (hasComponents ? CATALOG_ACC_POLICY_KIT : CATALOG_ACC_POLICY_GOOD);
    const mainUnitId = input.mainUnitId || CATALOG_DEFAULT_MAIN_UNIT_ID;
    const parentId = input.parentId ?? null;

    let sku: string | null = isGroup
      ? null
      : input.sku?.trim() || null;

    if (!isGroup && sku) {
      const taken = await productsDilovodGateway.isSkuTaken(sku);
      if (taken) {
        throw new Error(`SKU ${sku} вже зайнятий`);
      }
    }

    const buildParams = (skuValue: string | null): DilovodSaveGoodParams => {
      const header: DilovodSaveGoodParams['header'] = {
        id: 'catalogs.goods',
        name: { uk: name, ru: name },
        parent: parentId,
        isGroup: isGroup ? 1 : 0,
        mainUnit: mainUnitId,
        accPolicy: accPolicyId,
      };
      if (skuValue) header.productNum = skuValue;
      if (input.packageRatio != null) header.packageRatio = input.packageRatio;
      if (input.weight != null) header.weight = input.weight;
      if (input.printName) header.printName = { uk: input.printName, ru: input.printName };
      const descriptionMl = toMultilang(input.description);
      if (descriptionMl) header.description = descriptionMl;

      const params: DilovodSaveGoodParams = { header };
      if (!isGroup && hasComponents) {
        params.tableParts = {
          tpGoods: (input.components || []).map((c, idx) => ({
            rowNum: c.rowNum ?? idx + 1,
            good: c.componentGoodId,
            qty: c.qty,
            unit: c.unitId || mainUnitId,
            remark: (c.note?.trim() || '').slice(0, 150) || undefined,
          })),
        };
      }
      return params;
    };

    let dilovodId: string;
    let finalSku = sku;

    if (!isGroup && sku) {
      const { result, sku: usedSku } = await productsDilovodGateway.saveGoodWithSkuRetry(
        (s) => buildParams(s),
        sku
      );
      dilovodId = result.id;
      finalSku = usedSku;
    } else {
      const result = await productsDilovodGateway.saveObject(buildParams(null));
      dilovodId = result.id;
    }

    // Sync related registers
    const prices = input.prices || [];
    const barcodes = input.barcodes || [];
    for (const p of prices) {
      await productsDilovodGateway.savePrice({
        goodId: dilovodId,
        priceType: p.priceType,
        price: p.price,
        currency: p.currency,
      });
    }
    const savedBarcodes: Array<{
      code: string;
      activity: boolean;
      dilovodRegisterId?: string | null;
      goodPart?: string | null;
      goodPartName?: string | null;
    }> = [];
    for (const b of barcodes) {
      if (!b.code?.trim()) continue;
      const goodPart = b.goodPart?.trim() || null;
      const taken = await productsDilovodGateway.isBarcodeTaken(b.code.trim(), dilovodId);
      if (taken) {
        logServer(`[ProductsCatalogService] barcode ${b.code} already taken, skip`);
        continue;
      }
      const regId = await productsDilovodGateway.saveBarcode({
        goodId: dilovodId,
        code: b.code.trim(),
        activity: b.activity !== false,
        goodPart,
      });
      savedBarcodes.push({
        code: b.code.trim(),
        activity: b.activity !== false,
        dilovodRegisterId: regId,
        goodPart,
        goodPartName: b.goodPartName?.trim() || null,
      });
    }

    const localPayload: LocalSyncGoodPayload = {
      id: dilovodId,
      parentId,
      isGroup,
      delMark: false,
      name,
      sku: finalSku,
      mainUnitId,
      packageRatio: input.packageRatio ?? null,
      weight: input.weight ?? null,
      accPolicyId,
      printName: input.printName ?? null,
      description: input.description ?? null,
      fullDescription: input.fullDescription ?? null,
      unitRatio: input.unitRatio ?? 1,
      components: (input.components || []).map((c, idx) => ({
        componentGoodId: c.componentGoodId,
        qty: c.qty,
        rowNum: c.rowNum ?? idx + 1,
        unitId: c.unitId || mainUnitId,
        note: c.note?.trim() || null,
      })),
      prices: prices.map((p) => ({
        priceType: p.priceType,
        price: p.price,
        currency: p.currency ?? null,
      })),
      barcodes: savedBarcodes,
    };

    try {
      await productsLocalSync.syncGood(localPayload);
    } catch (syncErr) {
      logServer('[ProductsCatalogService] local sync after create failed, trying refresh', syncErr);
      await this.refreshFromDilovod([dilovodId]);
      // Після Dilovod refresh відновлюємо локальні поля
      const localPatch: {
        fullDescription?: string | null;
        unitRatio?: number | null;
      } = {};
      if (input.fullDescription !== undefined) {
        localPatch.fullDescription = input.fullDescription;
      }
      if (input.unitRatio !== undefined) {
        localPatch.unitRatio = input.unitRatio;
      }
      if (Object.keys(localPatch).length > 0) {
        await prisma.catalogGood.update({
          where: { id: dilovodId },
          data: localPatch,
        });
      }
      // Відновлюємо notes компонентів (по rowNum — дублікати інгредієнтів дозволені)
      if (input.components?.length) {
        for (const [idx, c] of input.components.entries()) {
          if (c.note == null || !String(c.note).trim()) continue;
          await prisma.catalogGoodComponent.updateMany({
            where: {
              parentGoodId: dilovodId,
              componentGoodId: c.componentGoodId,
              rowNum: c.rowNum ?? idx + 1,
            },
            data: { note: String(c.note).trim() },
          });
        }
      }
    }

    await this.syncCatalogOpsFieldsToProducts(dilovodId);

    const stagingSessionId = input.stagingSessionId?.trim();
    if (stagingSessionId && !isGroup) {
      try {
        await catalogMediaService.commitStaging(stagingSessionId, dilovodId);
      } catch (mediaErr) {
        logServer('[ProductsCatalogService] staging commit after create failed', mediaErr);
      }
    }

    const detail = await this.getGoodDetail(dilovodId);
    if (!detail) throw new Error('Товар створено в Dilovod, але локальна картка недоступна');
    return detail;
  }

  async updateGood(id: string, input: CatalogUpdateGoodInput): Promise<CatalogGoodDetailDto> {
    const existing = await this.getGoodDetail(id);
    if (!existing) throw new Error('Товар не знайдено');

    const isGroup = input.isGroup !== undefined ? Boolean(input.isGroup) : existing.isGroup;
    const name = input.name?.trim() ?? existing.name;
    const parentId = input.parentId !== undefined ? input.parentId : existing.parentId;
    const mainUnitId = input.mainUnitId ?? existing.mainUnitId ?? CATALOG_DEFAULT_MAIN_UNIT_ID;
    const components = input.components ?? existing.components.map((c) => ({
      componentGoodId: c.componentGoodId,
      qty: c.qty,
      rowNum: c.rowNum,
      unitId: c.unitId ?? null,
      note: c.note ?? null,
    }));
    const hasComponents = !isGroup && components.length > 0;
    const accPolicyId = isGroup
      ? existing.accPolicyId || CATALOG_ACC_POLICY_GOOD
      : input.accPolicyId ??
        (existing.accPolicyId ||
          (hasComponents ? CATALOG_ACC_POLICY_KIT : CATALOG_ACC_POLICY_GOOD));

    let sku: string | null = null;
    if (!isGroup) {
      sku =
        input.sku !== undefined
          ? input.sku?.trim() || null
          : existing.isGroup
            ? null
            : existing.sku;

      if (sku && sku !== existing.sku) {
        const taken = await productsDilovodGateway.isSkuTaken(sku, id);
        if (taken) {
          throw new Error(`SKU ${sku} вже зайнятий`);
        }
      }
    }

    const header: DilovodSaveGoodParams['header'] = {
      id,
      name: { uk: name, ru: name },
      parent: parentId,
      isGroup: isGroup ? 1 : 0,
      mainUnit: mainUnitId,
      accPolicy: accPolicyId,
    };
    if (sku) header.productNum = sku;
    const packageRatio = input.packageRatio !== undefined ? input.packageRatio : existing.packageRatio;
    const weight = input.weight !== undefined ? input.weight : existing.weight;
    const printName = input.printName !== undefined ? input.printName : existing.printName;
    const description = input.description !== undefined ? input.description : existing.description;
    const fullDescription =
      input.fullDescription !== undefined ? input.fullDescription : existing.fullDescription;
    const unitRatio =
      input.unitRatio !== undefined ? input.unitRatio : existing.unitRatio ?? 1;
    if (packageRatio != null) header.packageRatio = packageRatio;
    if (weight != null) header.weight = weight;
    if (printName) header.printName = { uk: printName, ru: printName };
    const descriptionMl = toMultilang(description);
    if (descriptionMl) header.description = descriptionMl;
    else if (description === '' || description === null) header.description = { uk: '', ru: '' };

    const params: DilovodSaveGoodParams = { header };
    if (!isGroup) {
      params.tableParts = {
        tpGoods: components.map((c, idx) => ({
          rowNum: c.rowNum ?? idx + 1,
          good: c.componentGoodId,
          qty: c.qty,
          unit: c.unitId || mainUnitId,
          remark: (String(('note' in c ? c.note : null) || '').trim()).slice(0, 150) || undefined,
        })),
      };
    }

    await productsDilovodGateway.saveObject(params);

    const prices =
      input.prices ??
      existing.prices.map((p) => ({
        priceType: p.priceType,
        price: p.price,
        currency: p.currency,
      }));
    const barcodes =
      input.barcodes ??
      existing.barcodes.map((b) => ({
        code: b.code,
        activity: b.activity,
        goodPart: b.goodPart,
        goodPartName: b.goodPartName,
      }));

    if (!isGroup && input.prices) {
      for (const p of prices) {
        if (!p.priceType) continue;
        const prev = existing.prices.find((x) => x.priceType === p.priceType);
        const samePrice =
          prev != null &&
          Number(prev.price) === Number(p.price) &&
          (prev.currency || null) === (p.currency || null);
        // Не чіпаємо Dilovod, якщо ціна не змінилась (інакше «вже встановлена» на той самий день)
        if (samePrice) continue;
        await productsDilovodGateway.savePrice({
          goodId: id,
          priceType: p.priceType,
          price: p.price,
          currency: p.currency,
        });
      }
    }

    const savedBarcodes: Array<{
      code: string;
      activity: boolean;
      dilovodRegisterId?: string | null;
      goodPart?: string | null;
      goodPartName?: string | null;
    }> = [];
    if (!isGroup && input.barcodes) {
      for (const b of barcodes) {
        if (!b.code?.trim()) continue;
        const code = b.code.trim();
        const goodPart = b.goodPart?.trim() || null;
        const activity = b.activity !== false;
        const existingBarcode = existing.barcodes.find(
          (x) => x.code === code && (x.goodPart || null) === goodPart
        );

        // Не чіпаємо Dilovod, якщо ШК не змінився
        if (
          existingBarcode &&
          existingBarcode.activity === activity &&
          (existingBarcode.goodPart || null) === goodPart
        ) {
          savedBarcodes.push({
            code,
            activity,
            dilovodRegisterId: existingBarcode.dilovodRegisterId,
            goodPart,
            goodPartName: b.goodPartName?.trim() || existingBarcode.goodPartName || null,
          });
          continue;
        }

        const taken = await productsDilovodGateway.isBarcodeTaken(code, id);
        if (taken && !existingBarcode) {
          logServer(`[ProductsCatalogService] barcode ${code} already taken, skip`);
          continue;
        }
        const regId = await productsDilovodGateway.saveBarcode({
          goodId: id,
          code,
          activity,
          registerId: existingBarcode?.dilovodRegisterId,
          goodPart,
        });
        savedBarcodes.push({
          code,
          activity,
          dilovodRegisterId: regId,
          goodPart,
          goodPartName: b.goodPartName?.trim() || existingBarcode?.goodPartName || null,
        });
      }
    } else if (!isGroup) {
      savedBarcodes.push(
        ...existing.barcodes.map((b) => ({
          code: b.code,
          activity: b.activity,
          dilovodRegisterId: b.dilovodRegisterId,
          goodPart: b.goodPart,
          goodPartName: b.goodPartName,
        }))
      );
    }

    const localPayload: LocalSyncGoodPayload = {
      id,
      parentId,
      isGroup,
      delMark: existing.delMark,
      name,
      sku,
      mainUnitId,
      packageRatio: packageRatio ?? null,
      weight: weight ?? null,
      accPolicyId,
      printName: printName ?? null,
      description: description ?? null,
      fullDescription: fullDescription ?? null,
      unitRatio: unitRatio ?? 1,
      components: isGroup
        ? []
        : components.map((c, idx) => ({
            componentGoodId: c.componentGoodId,
            qty: c.qty,
            rowNum: c.rowNum ?? idx + 1,
            unitId: c.unitId || mainUnitId,
            note: 'note' in c ? (c.note?.trim() || null) : undefined,
          })),
      prices: isGroup
        ? []
        : prices.map((p) => ({
            priceType: p.priceType,
            price: p.price,
            currency: p.currency ?? null,
          })),
      barcodes: savedBarcodes,
    };

    try {
      await productsLocalSync.syncGood(localPayload);
    } catch (syncErr) {
      logServer('[ProductsCatalogService] local sync after update failed', syncErr);
      await this.refreshFromDilovod([id]);
      const localPatch: {
        fullDescription?: string | null;
        unitRatio?: number | null;
      } = {};
      if (input.fullDescription !== undefined) {
        localPatch.fullDescription = input.fullDescription;
      }
      if (input.unitRatio !== undefined) {
        localPatch.unitRatio = input.unitRatio;
      }
      if (Object.keys(localPatch).length > 0) {
        await prisma.catalogGood.update({
          where: { id },
          data: localPatch,
        });
      }
      if (input.components?.length) {
        for (const [idx, c] of input.components.entries()) {
          if (c.note === undefined) continue;
          await prisma.catalogGoodComponent.updateMany({
            where: {
              parentGoodId: id,
              componentGoodId: c.componentGoodId,
              rowNum: c.rowNum ?? idx + 1,
            },
            data: { note: c.note?.trim() || null },
          });
        }
      }
    }

    await this.syncCatalogOpsFieldsToProducts(id);

    const detail = await this.getGoodDetail(id);
    if (!detail) throw new Error('Товар оновлено, але локальна картка недоступна');
    return detail;
  }

  /**
   * Reorder sibling у межах parentId (інтервальний sortOrder, крок 10).
   * Папки й товари сортуються окремо за isGroup (у дереві — папки; у таблиці — товари).
   */
  async reorderSibling(input: CatalogReorderInput): Promise<{ id: string; sortOrder: number }> {
    const id = String(input.id || '').trim();
    if (!id) throw new Error('id обовʼязковий');

    const item = await prisma.catalogGood.findUnique({
      where: { id },
      select: { id: true, parentId: true, isGroup: true, sortOrder: true },
    });
    if (!item) throw new Error('Елемент не знайдено');

    const parentId = normalizeParentId(input.parentId !== undefined ? input.parentId : item.parentId);
    const itemParent = normalizeParentId(item.parentId);
    if (parentId !== itemParent) {
      throw new Error('Елемент не належить до вказаної папки');
    }

    const parentWhere = parentId
      ? { parentId }
      : { OR: [{ parentId: null }, { parentId: '0' }, { parentId: '' }] };

    // Reorder лише серед siblings того ж типу (папка↔папка / товар↔товар)
    const siblings = await prisma.catalogGood.findMany({
      where: {
        ...parentWhere,
        isGroup: item.isGroup,
        id: { not: CATALOG_TRASH_ID },
      },
      select: { id: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const withoutMoved = siblings.filter((s) => s.id !== id);
    const afterId = input.afterId != null && input.afterId !== '' ? String(input.afterId) : null;
    const beforeId = input.beforeId != null && input.beforeId !== '' ? String(input.beforeId) : null;

    let insertIndex = withoutMoved.length; // кінець за замовчуванням
    if (afterId) {
      const idx = withoutMoved.findIndex((s) => s.id === afterId);
      if (idx < 0) throw new Error('afterId не знайдено серед siblings');
      insertIndex = idx + 1;
    } else if (beforeId) {
      const idx = withoutMoved.findIndex((s) => s.id === beforeId);
      if (idx < 0) throw new Error('beforeId не знайдено серед siblings');
      insertIndex = idx;
    }

    const prev = insertIndex > 0 ? withoutMoved[insertIndex - 1] : null;
    const next = insertIndex < withoutMoved.length ? withoutMoved[insertIndex] : null;

    const computed = computeIntervalSortOrder(
      prev?.sortOrder ?? null,
      next?.sortOrder ?? null
    );

    let newSortOrder: number;

    if (computed.kind === 'single') {
      newSortOrder = computed.sortOrder;
      await prisma.catalogGood.update({
        where: { id },
        data: { sortOrder: newSortOrder },
      });
    } else {
      const newOrderIds = [
        ...withoutMoved.slice(0, insertIndex).map((s) => s.id),
        id,
        ...withoutMoved.slice(insertIndex).map((s) => s.id),
      ];
      const rebalanced = rebalanceSortOrders(newOrderIds);
      await prisma.$transaction(
        rebalanced.map((row) =>
          prisma.catalogGood.update({
            where: { id: row.id },
            data: { sortOrder: row.sortOrder },
          })
        )
      );
      newSortOrder = rebalanced.find((r) => r.id === id)!.sortOrder;
    }

    if (!item.isGroup) {
      await this.syncCatalogOpsFieldsToProducts(id);
    }

    return { id, sortOrder: newSortOrder };
  }

  async duplicateGood(id: string): Promise<CatalogGoodDetailDto> {
    const obj = await productsDilovodGateway.getObject(id);
    const mapped = productsDilovodGateway.mapObjectToLocal(obj);
    if (!mapped.id) throw new Error('Не вдалося отримати обʼєкт з Dilovod');
    if (mapped.isGroup) throw new Error('Дублювання папок не підтримується в MVP');

    const baseSku = mapped.sku || '01000';
    const nextSku = await productsDilovodGateway.allocateNextSku(baseSku);
    const copyName = `Копія ${mapped.name}`.trim();

    const prices = await productsDilovodGateway.fetchPricesForGoods([id]);
    const barcodes = await productsDilovodGateway.fetchBarcodesForGoods([id]);

    const uniqueBarcodes: Array<{
      code: string;
      activity: boolean;
      goodPart?: string | null;
      goodPartName?: string | null;
    }> = [];
    for (const b of barcodes.filter((x) => x.activity)) {
      const taken = await productsDilovodGateway.isBarcodeTaken(b.code);
      if (!taken) {
        uniqueBarcodes.push({
          code: b.code,
          activity: true,
          goodPart: b.goodPart,
          goodPartName: b.goodPartName,
        });
      }
    }

    return this.createGood({
      name: copyName,
      parentId: mapped.parentId,
      isGroup: false,
      sku: nextSku,
      mainUnitId: mapped.mainUnitId,
      packageRatio: mapped.packageRatio,
      weight: mapped.weight,
      accPolicyId: mapped.accPolicyId || (mapped.components.length ? CATALOG_ACC_POLICY_KIT : CATALOG_ACC_POLICY_GOOD),
      printName: mapped.printName,
      description: mapped.description,
      components: mapped.components.map((c) => ({
        componentGoodId: c.componentGoodId,
        qty: c.qty,
        rowNum: c.rowNum,
        unitId: c.unitId ?? null,
      })),
      prices: prices.map((p) => ({
        priceType: p.priceType,
        price: p.price,
        currency: p.currency,
      })),
      barcodes: uniqueBarcodes,
    });
  }

  async moveGoods(ids: string[], targetParentId: string): Promise<{ moved: number; deactivated: number }> {
    if (!ids.length) return { moved: 0, deactivated: 0 };
    if (targetParentId == null || targetParentId === '') {
      throw new Error('targetParentId обовʼязковий');
    }

    const parentId =
      targetParentId === 'root' || targetParentId === 'null' ? null : targetParentId;

    // Тимчасово без setDelMark / clearDelMark — лише зміна parent
    // (Dilovod ігнорує delMark:0 у saveObject; unsetDeletionMark недоступний для API-ролі).
    const targetIsArchive = await this.isArchiveFolderId(parentId);

    let moved = 0;
    let deactivated = 0;
    const movedIds: string[] = [];

    for (const id of ids) {
      const detail = await this.getGoodDetail(id);
      if (!detail) continue;

      const header: DilovodSaveGoodParams['header'] = {
        id,
        name: { uk: detail.name, ru: detail.name },
        parent: parentId,
        isGroup: detail.isGroup ? 1 : 0,
        ...(detail.sku ? { productNum: detail.sku } : {}),
        ...(detail.mainUnitId ? { mainUnit: detail.mainUnitId } : {}),
        ...(detail.accPolicyId ? { accPolicy: detail.accPolicyId } : {}),
      };

      await productsDilovodGateway.saveObject({ header });

      if (targetIsArchive) {
        deactivated++;
      }

      movedIds.push(id);
      moved++;
    }

    try {
      await productsLocalSync.updateParents(movedIds, parentId);
    } catch (err) {
      logServer('[ProductsCatalogService] move local sync failed', err);
      await this.refreshFromDilovod(movedIds);
    }

    return { moved, deactivated };
  }

  /**
   * Відновити з архіву: parent = батько папки «Архів – …».
   * Без зняття delMark (див. коментар у moveGoods).
   */
  async restoreGoods(ids: string[]): Promise<{ restored: number }> {
    if (!ids.length) return { restored: 0 };

    let restored = 0;
    const restoredIds: string[] = [];
    const parentById = new Map<string, string | null>();

    for (const id of ids) {
      const detail = await this.getGoodDetail(id);
      if (!detail?.parentId) {
        throw new Error(`«${detail?.name || id}» не в архівній папці`);
      }

      const archiveFolder = await prisma.catalogGood.findUnique({
        where: { id: detail.parentId },
        select: { id: true, name: true, parentId: true, isGroup: true },
      });
      if (!archiveFolder?.isGroup || !isArchiveFolderName(archiveFolder.name)) {
        throw new Error(`«${detail.name}» не в архівній папці`);
      }

      const restoreParentId = archiveFolder.parentId;

      await productsDilovodGateway.saveObject({
        header: {
          id,
          name: { uk: detail.name, ru: detail.name },
          parent: restoreParentId,
          isGroup: detail.isGroup ? 1 : 0,
          ...(detail.sku ? { productNum: detail.sku } : {}),
          ...(detail.mainUnitId ? { mainUnit: detail.mainUnitId } : {}),
          ...(detail.accPolicyId ? { accPolicy: detail.accPolicyId } : {}),
        },
      });

      parentById.set(id, restoreParentId);
      restoredIds.push(id);
      restored++;
    }

    try {
      const byParent = new Map<string | null, string[]>();
      for (const id of restoredIds) {
        const p = parentById.get(id) ?? null;
        const list = byParent.get(p) || [];
        list.push(id);
        byParent.set(p, list);
      }
      for (const [pId, groupIds] of byParent) {
        await productsLocalSync.updateParents(groupIds, pId);
      }
    } catch (err) {
      logServer('[ProductsCatalogService] restore local sync failed', err);
      await this.refreshFromDilovod(restoredIds);
    }

    return { restored };
  }

  private async isArchiveFolderId(folderId: string | null): Promise<boolean> {
    if (!folderId) return false;
    const folder = await prisma.catalogGood.findUnique({
      where: { id: folderId },
      select: { name: true, isGroup: true },
    });
    return Boolean(folder?.isGroup && isArchiveFolderName(folder.name));
  }

  async archiveGoods(ids: string[]): Promise<{ archived: number; archiveFolderId: string | null }> {
    if (!ids.length) return { archived: 0, archiveFolderId: null };

    // Group by parent of first item for archive folder naming
    const first = await prisma.catalogGood.findUnique({ where: { id: ids[0] } });
    if (!first) throw new Error('Товар не знайдено');

    const parentId = first.parentId;
    let parentName = 'Корінь';
    if (parentId) {
      const parent = await prisma.catalogGood.findUnique({ where: { id: parentId } });
      parentName = parent?.name || parentId;
    }

    const archiveName = `Архів – ${parentName}`;
    let archiveFolder = await prisma.catalogGood.findFirst({
      where: {
        isGroup: true,
        name: archiveName,
        parentId: parentId,
      },
    });

    if (!archiveFolder) {
      // Create at same level as items being archived
      const created = await this.createGood({
        name: archiveName,
        parentId,
        isGroup: true,
      });
      archiveFolder = await prisma.catalogGood.findUnique({ where: { id: created.id } });
    }

    if (!archiveFolder) throw new Error('Не вдалося створити папку архіву');

    const archiveId = archiveFolder.id;
    let archived = 0;

    for (const id of ids) {
      if (id === archiveId) continue;
      const detail = await this.getGoodDetail(id);
      if (!detail) continue;

      // Без setDelMark — лише переміщення в папку архіву
      await productsDilovodGateway.saveObject({
        header: {
          id,
          name: { uk: detail.name, ru: detail.name },
          parent: archiveId,
          isGroup: detail.isGroup ? 1 : 0,
          ...(detail.sku ? { productNum: detail.sku } : {}),
          ...(detail.mainUnitId ? { mainUnit: detail.mainUnitId } : {}),
          ...(detail.accPolicyId ? { accPolicy: detail.accPolicyId } : {}),
        },
      });
      archived++;
    }

    try {
      await productsLocalSync.updateParents(ids.filter((i) => i !== archiveId), archiveId);
    } catch (err) {
      logServer('[ProductsCatalogService] archive local sync failed', err);
      await this.refreshFromDilovod([...ids, archiveId]);
    }

    return { archived, archiveFolderId: archiveId };
  }

  async trashGoods(ids: string[]): Promise<{ trashed: number }> {
    if (!ids.length) return { trashed: 0 };

    let trashed = 0;
    for (const id of ids) {
      if (id === CATALOG_TRASH_ID) continue;
      const detail = await this.getGoodDetail(id);
      if (!detail) continue;

      // Без setDelMark — лише переміщення в смітник
      await productsDilovodGateway.saveObject({
        header: {
          id,
          name: { uk: detail.name, ru: detail.name },
          parent: CATALOG_TRASH_ID,
          isGroup: detail.isGroup ? 1 : 0,
          ...(detail.sku ? { productNum: detail.sku } : {}),
          ...(detail.mainUnitId ? { mainUnit: detail.mainUnitId } : {}),
          ...(detail.accPolicyId ? { accPolicy: detail.accPolicyId } : {}),
        },
      });
      trashed++;
    }

    try {
      await productsLocalSync.updateParents(ids, CATALOG_TRASH_ID);
    } catch (err) {
      logServer('[ProductsCatalogService] trash local sync failed', err);
      await this.refreshFromDilovod(ids);
    }

    return { trashed };
  }

  async refreshFromDilovod(ids?: string[]): Promise<{ upserted: number }> {
    logServer(`[ProductsCatalogService] refresh start ids=${ids?.length ?? 'ALL'}`);

    const goods =
      ids && ids.length > 0
        ? await productsDilovodGateway.fetchGoodsByIds(ids)
        : await productsDilovodGateway.fetchAllGoods();

    const leafIds = goods.filter((g) => !g.isGroup).map((g) => g.id);
    const prices = leafIds.length
      ? await productsDilovodGateway.fetchPricesForGoods(leafIds)
      : [];
    const barcodes = leafIds.length
      ? await productsDilovodGateway.fetchBarcodesForGoods(leafIds)
      : [];

    const pricesByGood = new Map<string, typeof prices>();
    for (const p of prices) {
      const list = pricesByGood.get(p.goodId) || [];
      list.push(p);
      pricesByGood.set(p.goodId, list);
    }
    const barcodesByGood = new Map<string, typeof barcodes>();
    for (const b of barcodes) {
      const list = barcodesByGood.get(b.goodId) || [];
      list.push(b);
      barcodesByGood.set(b.goodId, list);
    }

    // Header + prices + barcodes; BOM (components) навмисно не замінюємо
    const payloads: LocalSyncGoodPayload[] = goods
      .filter((g) => g.id)
      .map((g) => ({
        ...toStructurePayload(g),
        prices: (pricesByGood.get(g.id) || []).map((p) => ({
          priceType: p.priceType,
          price: p.price,
          currency: p.currency,
        })),
        barcodes: (barcodesByGood.get(g.id) || []).map((b) => ({
          code: b.code,
          activity: b.activity,
          dilovodRegisterId: b.dilovodRegisterId,
          goodPart: b.goodPart,
          goodPartName: b.goodPartName,
        })),
      }));

    const result = await productsLocalSync.syncGoodsBatch(payloads);
    logServer(`[ProductsCatalogService] refresh done upserted=${result.upserted}`);
    return result;
  }

  /**
   * Structure-only sync піддерева (або одного рівня, якщо recursive=false).
   * Без цін / ШК / BOM.
   */
  async refreshFolderFromDilovod(
    folderId: string | null,
    options?: { recursive?: boolean }
  ): Promise<{ upserted: number; orphansResolved: number; capped: boolean }> {
    const recursive = Boolean(options?.recursive);
    logServer(
      `[ProductsCatalogService] folder refresh start folderId=${folderId ?? 'root'} recursive=${recursive}`
    );

    let upserted = 0;
    let orphansResolved = 0;
    let capped = false;
    let nodesVisited = 0;

    const queue: Array<{ id: string | null; depth: number }> = [
      { id: folderId, depth: 0 },
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      const visitKey = current.id ?? 'root';
      if (visited.has(visitKey)) continue;
      visited.add(visitKey);

      if (current.depth > BRANCH_REFRESH_MAX_DEPTH || nodesVisited >= BRANCH_REFRESH_MAX_NODES) {
        capped = true;
        logServer(
          `[ProductsCatalogService] folder refresh capped depth=${current.depth} nodes=${nodesVisited}`
        );
        break;
      }

      const level = await this.refreshOneFolderLevel(current.id);
      upserted += level.upserted;
      orphansResolved += level.orphansResolved;
      nodesVisited += 1 + level.childGroupIds.length;

      if (recursive) {
        for (const childId of level.childGroupIds) {
          if (!visited.has(childId)) {
            queue.push({ id: childId, depth: current.depth + 1 });
          }
        }
      }
    }

    logServer(
      `[ProductsCatalogService] folder refresh done upserted=${upserted} orphans=${orphansResolved} capped=${capped}`
    );
    return { upserted, orphansResolved, capped };
  }

  private async refreshOneFolderLevel(folderId: string | null): Promise<{
    upserted: number;
    orphansResolved: number;
    childGroupIds: string[];
  }> {
    const goods = await productsDilovodGateway.fetchGoodsByParent(folderId);
    const dilovodIds = new Set(goods.map((g) => g.id));

    const structurePayloads = goods.map(toStructurePayload);
    let upserted = 0;
    if (structurePayloads.length > 0) {
      const result = await productsLocalSync.syncGoodsBatch(structurePayloads);
      upserted += result.upserted;
    }

    // Сироти: локальні діти, яких немає у відповіді Dilovod
    const isRoot = !folderId || folderId === 'root';
    const localChildren = await prisma.catalogGood.findMany({
      where: {
        id: { not: CATALOG_TRASH_ID },
        ...(isRoot
          ? { OR: [{ parentId: null }, { parentId: '0' }, { parentId: '' }] }
          : { parentId: folderId }),
      },
      select: { id: true },
    });

    const orphanIds = localChildren
      .map((c) => c.id)
      .filter((id) => !dilovodIds.has(id));

    let orphansResolved = 0;
    if (orphanIds.length > 0) {
      const orphanRows = await productsDilovodGateway.fetchGoodsByIds(orphanIds);
      if (orphanRows.length > 0) {
        const orphanResult = await productsLocalSync.syncGoodsBatch(
          orphanRows.filter((g) => g.id).map(toStructurePayload)
        );
        orphansResolved = orphanResult.upserted;
        upserted += orphanResult.upserted;
      }
    }

    const childGroupIds = goods.filter((g) => g.isGroup && g.id).map((g) => g.id);
    return { upserted, orphansResolved, childGroupIds };
  }
}

export const productsCatalogService = new ProductsCatalogService();
