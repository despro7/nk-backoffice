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
  CatalogGoodDetailDto,
  CatalogGoodDto,
  CatalogTreeNodeDto,
  CatalogUnitDto,
  CatalogUpdateGoodInput,
} from '../../../shared/types/catalog.js';
import { productsDilovodGateway } from './ProductsDilovodGateway.js';
import { productsLocalSync } from './ProductsLocalSync.js';
import {
  DilovodSaveGoodParams,
  LocalSyncGoodPayload,
  isKitAccPolicy,
} from './ProductsTypes.js';

function mapGoodDto(row: {
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
  syncedAt: Date;
  updatedAt: Date;
  _count?: { components?: number };
}): CatalogGoodDto {
  const isKit =
    isKitAccPolicy(row.accPolicyId) || (row._count?.components ?? 0) > 0;
  return {
    id: row.id,
    parentId: row.parentId,
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
    syncedAt: row.syncedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isKit,
  };
}

export class ProductsCatalogService {
  async getTree(options?: { includeTrash?: boolean }): Promise<CatalogTreeNodeDto[]> {
    const includeTrash = options?.includeTrash === true;
    const groups = await prisma.catalogGood.findMany({
      where: {
        isGroup: true,
        ...(includeTrash ? {} : { id: { not: CATALOG_TRASH_ID }, parentId: { not: CATALOG_TRASH_ID } }),
      },
      select: {
        id: true,
        parentId: true,
        name: true,
        isGroup: true,
        delMark: true,
        sku: true,
        accPolicyId: true,
        _count: { select: { components: true } },
      },
      orderBy: { name: 'asc' },
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
        isKit: isKitAccPolicy(g.accPolicyId) || g._count.components > 0,
        childrenCount: countMap.get(g.id) ?? 0,
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
      orderBy: [{ isGroup: 'desc' }, { name: 'asc' }],
    });
    return rows.map(mapGoodDto);
  }

  async search(q: string, limit = 50): Promise<CatalogGoodDto[]> {
    const query = String(q || '').trim();
    if (!query) return [];

    const rows = await prisma.catalogGood.findMany({
      where: {
        id: { not: CATALOG_TRASH_ID },
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
    return rows.map(mapGoodDto);
  }

  async getTrash(): Promise<CatalogGoodDto[]> {
    const rows = await prisma.catalogGood.findMany({
      where: { parentId: CATALOG_TRASH_ID },
      include: { _count: { select: { components: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map(mapGoodDto);
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

  async getGoodDetail(id: string): Promise<CatalogGoodDetailDto | null> {
    const row = await prisma.catalogGood.findUnique({
      where: { id },
      include: {
        components: { orderBy: { rowNum: 'asc' } },
        prices: true,
        barcodes: true,
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

    let stock: CatalogGoodDetailDto['stock'] = null;
    if (!row.isGroup && row.sku) {
      const product = await prisma.product.findFirst({
        where: { OR: [{ dilovodId: row.id }, { sku: row.sku }] },
        select: { stockBalanceByStock: true },
      });
      if (product?.stockBalanceByStock) {
        try {
          const parsed = JSON.parse(product.stockBalanceByStock) as Record<string, number>;
          stock = {
            mainStock: Number(parsed['1'] || 0),
            smallStock: Number(parsed['2'] || 0),
            stockBalanceByStock: parsed,
          };
        } catch {
          stock = { mainStock: 0, smallStock: 0, stockBalanceByStock: null };
        }
      } else {
        stock = { mainStock: 0, smallStock: 0, stockBalanceByStock: null };
      }
    }

    return {
      ...mapGoodDto(row),
      components: row.components.map((c) => ({
        id: c.id,
        parentGoodId: c.parentGoodId,
        componentGoodId: c.componentGoodId,
        componentName: componentMap.get(c.componentGoodId)?.name,
        componentSku: componentMap.get(c.componentGoodId)?.sku ?? null,
        qty: c.qty,
        rowNum: c.rowNum,
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

    if (!isGroup && !sku) {
      sku = await productsDilovodGateway.allocateNextSku('01000');
    }
    if (!isGroup && sku) {
      const taken = await productsDilovodGateway.isSkuTaken(sku);
      if (taken) {
        sku = await productsDilovodGateway.allocateNextSku(sku);
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
      if (input.description) header.description = input.description;

      const params: DilovodSaveGoodParams = { header };
      if (!isGroup && hasComponents) {
        params.tableParts = {
          tpGoods: (input.components || []).map((c, idx) => ({
            rowNum: c.rowNum ?? idx + 1,
            good: c.componentGoodId,
            qty: c.qty,
            unit: mainUnitId,
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
      components: (input.components || []).map((c, idx) => ({
        componentGoodId: c.componentGoodId,
        qty: c.qty,
        rowNum: c.rowNum ?? idx + 1,
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
    }

    const detail = await this.getGoodDetail(dilovodId);
    if (!detail) throw new Error('Товар створено в Dilovod, але локальна картка недоступна');
    return detail;
  }

  async updateGood(id: string, input: CatalogUpdateGoodInput): Promise<CatalogGoodDetailDto> {
    const existing = await this.getGoodDetail(id);
    if (!existing) throw new Error('Товар не знайдено');

    const name = input.name?.trim() ?? existing.name;
    const parentId = input.parentId !== undefined ? input.parentId : existing.parentId;
    const sku = existing.isGroup
      ? null
      : input.sku !== undefined
        ? input.sku?.trim() || null
        : existing.sku;
    const mainUnitId = input.mainUnitId ?? existing.mainUnitId ?? CATALOG_DEFAULT_MAIN_UNIT_ID;
    const components = input.components ?? existing.components.map((c) => ({
      componentGoodId: c.componentGoodId,
      qty: c.qty,
      rowNum: c.rowNum,
    }));
    const hasComponents = components.length > 0;
    const accPolicyId =
      input.accPolicyId ??
      (hasComponents ? CATALOG_ACC_POLICY_KIT : existing.accPolicyId || CATALOG_ACC_POLICY_GOOD);

    if (sku && sku !== existing.sku) {
      const taken = await productsDilovodGateway.isSkuTaken(sku, id);
      if (taken) throw new Error(`SKU ${sku} вже зайнятий`);
    }

    const header: DilovodSaveGoodParams['header'] = {
      id,
      name: { uk: name, ru: name },
      parent: parentId,
      isGroup: existing.isGroup ? 1 : 0,
      mainUnit: mainUnitId,
      accPolicy: accPolicyId,
    };
    if (sku) header.productNum = sku;
    const packageRatio = input.packageRatio !== undefined ? input.packageRatio : existing.packageRatio;
    const weight = input.weight !== undefined ? input.weight : existing.weight;
    const printName = input.printName !== undefined ? input.printName : existing.printName;
    const description = input.description !== undefined ? input.description : existing.description;
    if (packageRatio != null) header.packageRatio = packageRatio;
    if (weight != null) header.weight = weight;
    if (printName) header.printName = { uk: printName, ru: printName };
    if (description != null) header.description = description;

    const params: DilovodSaveGoodParams = { header };
    if (!existing.isGroup) {
      params.tableParts = {
        tpGoods: components.map((c, idx) => ({
          rowNum: c.rowNum ?? idx + 1,
          good: c.componentGoodId,
          qty: c.qty,
          unit: mainUnitId,
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

    if (input.prices) {
      for (const p of prices) {
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
    if (input.barcodes) {
      for (const b of barcodes) {
        if (!b.code?.trim()) continue;
        const goodPart = b.goodPart?.trim() || null;
        const taken = await productsDilovodGateway.isBarcodeTaken(b.code.trim(), id);
        if (taken) {
          // may be our own — still try save
        }
        const existingBarcode = existing.barcodes.find(
          (x) =>
            x.code === b.code.trim() &&
            (x.goodPart || null) === goodPart
        );
        const regId = await productsDilovodGateway.saveBarcode({
          goodId: id,
          code: b.code.trim(),
          activity: b.activity !== false,
          registerId: existingBarcode?.dilovodRegisterId,
          goodPart,
        });
        savedBarcodes.push({
          code: b.code.trim(),
          activity: b.activity !== false,
          dilovodRegisterId: regId,
          goodPart,
          goodPartName: b.goodPartName?.trim() || existingBarcode?.goodPartName || null,
        });
      }
    } else {
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
      isGroup: existing.isGroup,
      delMark: existing.delMark,
      name,
      sku,
      mainUnitId,
      packageRatio: packageRatio ?? null,
      weight: weight ?? null,
      accPolicyId,
      printName: printName ?? null,
      description: description ?? null,
      components: components.map((c, idx) => ({
        componentGoodId: c.componentGoodId,
        qty: c.qty,
        rowNum: c.rowNum ?? idx + 1,
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
      logServer('[ProductsCatalogService] local sync after update failed', syncErr);
      await this.refreshFromDilovod([id]);
    }

    const detail = await this.getGoodDetail(id);
    if (!detail) throw new Error('Товар оновлено, але локальна картка недоступна');
    return detail;
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
      })),
      prices: prices.map((p) => ({
        priceType: p.priceType,
        price: p.price,
        currency: p.currency,
      })),
      barcodes: uniqueBarcodes,
    });
  }

  async moveGoods(ids: string[], targetParentId: string): Promise<{ moved: number }> {
    if (!ids.length) return { moved: 0 };
    if (targetParentId == null || targetParentId === '') {
      throw new Error('targetParentId обовʼязковий');
    }

    const parentId =
      targetParentId === 'root' || targetParentId === 'null' ? null : targetParentId;

    let moved = 0;
    for (const id of ids) {
      const detail = await this.getGoodDetail(id);
      if (!detail) continue;

      await productsDilovodGateway.saveObject({
        header: {
          id,
          name: { uk: detail.name, ru: detail.name },
          parent: parentId,
          isGroup: detail.isGroup ? 1 : 0,
          ...(detail.sku ? { productNum: detail.sku } : {}),
          ...(detail.mainUnitId ? { mainUnit: detail.mainUnitId } : {}),
          ...(detail.accPolicyId ? { accPolicy: detail.accPolicyId } : {}),
        },
      });
      moved++;
    }

    try {
      await productsLocalSync.updateParents(ids, parentId);
    } catch (err) {
      logServer('[ProductsCatalogService] move local sync failed', err);
      await this.refreshFromDilovod(ids);
    }

    return { moved };
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
      await productsDilovodGateway.setDelMark(id);
      archived++;
    }

    try {
      await productsLocalSync.updateParents(ids.filter((i) => i !== archiveId), archiveId);
      await productsLocalSync.markDelMark(ids.filter((i) => i !== archiveId), true);
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
      await productsDilovodGateway.setDelMark(id);
      trashed++;
    }

    try {
      await productsLocalSync.updateParents(ids, CATALOG_TRASH_ID);
      await productsLocalSync.markDelMark(ids, true);
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

    // For full refresh: also pull prices/barcodes in chunks for leaves
    const leafIds = goods.filter((g) => !g.isGroup).map((g) => g.id);
    const prices = leafIds.length
      ? await productsDilovodGateway.fetchPricesForGoods(leafIds)
      : [];
    const barcodes = leafIds.length
      ? await productsDilovodGateway.fetchBarcodesForGoods(leafIds)
      : [];

    // For targeted refresh also pull getObject for BOM
    const componentsByGood = new Map<string, Array<{ componentGoodId: string; qty: number; rowNum: number }>>();
    const targetIds = ids && ids.length > 0 ? ids : [];
    for (const id of targetIds) {
      try {
        const obj = await productsDilovodGateway.getObject(id);
        const mapped = productsDilovodGateway.mapObjectToLocal(obj);
        componentsByGood.set(id, mapped.components);
      } catch (err) {
        logServer(`[ProductsCatalogService] getObject failed for ${id}`, err);
      }
    }

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

    const payloads: LocalSyncGoodPayload[] = goods
      .filter((g) => g.id)
      .map((g) => ({
        id: g.id,
        parentId: g.parent,
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
        components: componentsByGood.get(g.id),
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
}

export const productsCatalogService = new ProductsCatalogService();
