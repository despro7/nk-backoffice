/**
 * Local mirror sync for catalog_* only.
 * Таблицю `products` Products 2.0 НЕ чіпає — legacy Dilovod sync лишається єдиним власником.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma, logServer } from '../../lib/utils.js';
import { LocalSyncGoodPayload } from './ProductsTypes.js';
import { nextSiblingSortOrder } from '../../../shared/utils/catalogSortOrder.js';

type Tx = Prisma.TransactionClient | PrismaClient;

export class ProductsLocalSync {
  /**
   * Upsert catalog good + replace BOM/prices/barcodes in one transaction.
   */
  async syncGood(payload: LocalSyncGoodPayload): Promise<void> {
    try {
      await prisma.$transaction(
        async (tx) => {
          await this.upsertCatalogGood(tx, payload);

          if (payload.components) {
            await this.replaceComponents(tx, payload.id, payload.components);
          }
          if (payload.prices) {
            await this.replacePrices(tx, payload.id, payload.prices);
          }
          if (payload.barcodes) {
            await this.replaceBarcodes(tx, payload.id, payload.barcodes);
          }
        },
        { maxWait: 10_000, timeout: 30_000 }
      );
    } catch (error) {
      logServer('[ProductsLocalSync] syncGood failed', {
        id: payload.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Bulk upsert catalog rows (refresh path).
   * Малі чанки + збільшений timeout: на товар кілька запитів (BOM/prices/barcodes),
   * дефолтні 5s Prisma interactive tx не вистачає.
   */
  async syncGoodsBatch(rows: LocalSyncGoodPayload[]): Promise<{ upserted: number }> {
    let upserted = 0;
    const chunkSize = 10;
    const txOptions = { maxWait: 15_000, timeout: 60_000 } as const;

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      try {
        await prisma.$transaction(async (tx) => {
          for (const payload of chunk) {
            await this.upsertCatalogGood(tx, payload);
            if (payload.components) {
              await this.replaceComponents(tx, payload.id, payload.components);
            }
            if (payload.prices) {
              await this.replacePrices(tx, payload.id, payload.prices);
            }
            if (payload.barcodes) {
              await this.replaceBarcodes(tx, payload.id, payload.barcodes);
            }
            upserted++;
          }
        }, txOptions);
      } catch (error) {
        logServer('[ProductsLocalSync] syncGoodsBatch chunk failed', {
          from: i,
          size: chunk.length,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      if ((i + chunkSize) % 50 === 0 || i + chunkSize >= rows.length) {
        logServer(
          `[ProductsLocalSync] syncGoodsBatch progress ${Math.min(i + chunkSize, rows.length)}/${rows.length}`
        );
      }
    }

    return { upserted };
  }

  async markDelMark(ids: string[], delMark = true): Promise<void> {
    if (ids.length === 0) return;
    await prisma.$transaction(async (tx) => {
      await tx.catalogGood.updateMany({
        where: { id: { in: ids } },
        data: { delMark, syncedAt: new Date() },
      });
    });
  }

  async updateParents(ids: string[], parentId: string | null): Promise<void> {
    if (ids.length === 0) return;
    await prisma.$transaction(async (tx) => {
      await tx.catalogGood.updateMany({
        where: { id: { in: ids } },
        data: { parentId, syncedAt: new Date() },
      });
    });
  }

  private async upsertCatalogGood(tx: Tx, payload: LocalSyncGoodPayload): Promise<void> {
    const now = new Date();
    const data = {
      parentId: payload.parentId,
      isGroup: payload.isGroup,
      delMark: payload.delMark,
      name: payload.name,
      sku: payload.sku,
      mainUnitId: payload.mainUnitId,
      packageRatio: payload.packageRatio,
      weight: payload.weight,
      accPolicyId: payload.accPolicyId,
      printName: payload.printName,
      description: payload.description,
      syncedAt: now,
    };

    // UNIQUE(sku): clear conflicting sku on another row before upsert when needed
    if (payload.sku) {
      const conflict = await tx.catalogGood.findFirst({
        where: { sku: payload.sku, NOT: { id: payload.id } },
        select: { id: true },
      });
      if (conflict) {
        await tx.catalogGood.update({
          where: { id: conflict.id },
          data: { sku: null },
        });
      }
    }

    const existing = await tx.catalogGood.findUnique({
      where: { id: payload.id },
      select: { id: true, sortOrder: true },
    });

    // sortOrder: на create — кінець siblings; на update з Dilovod — не затирати
    let sortOrder = payload.sortOrder;
    if (sortOrder === undefined) {
      if (!existing) {
        const maxRow = await tx.catalogGood.aggregate({
          where: {
            ...(payload.parentId
              ? { parentId: payload.parentId }
              : { OR: [{ parentId: null }, { parentId: '0' }, { parentId: '' }] }),
          },
          _max: { sortOrder: true },
        });
        const { nextSiblingSortOrder } = await import('../../../shared/utils/catalogSortOrder.js');
        sortOrder = nextSiblingSortOrder(maxRow._max.sortOrder);
      }
    }

    // fullDescription / unitRatio / stockBalanceByStock / sortOrder — локальні;
    // Dilovod sync не передає → не затираємо на update
    const createData = {
      id: payload.id,
      ...data,
      fullDescription: payload.fullDescription ?? null,
      unitRatio: payload.unitRatio ?? 1,
      stockBalanceByStock: payload.stockBalanceByStock ?? null,
      sortOrder: sortOrder ?? 10,
    };

    const updateData: Record<string, unknown> = { ...data };
    if (payload.fullDescription !== undefined) {
      updateData.fullDescription = payload.fullDescription;
    }
    if (payload.unitRatio !== undefined) {
      updateData.unitRatio = payload.unitRatio;
    }
    if (payload.stockBalanceByStock !== undefined) {
      updateData.stockBalanceByStock = payload.stockBalanceByStock;
    }
    if (sortOrder !== undefined) {
      updateData.sortOrder = sortOrder;
    }

    await tx.catalogGood.upsert({
      where: { id: payload.id },
      create: createData,
      update: updateData,
    });
  }

  private async replaceComponents(
    tx: Tx,
    parentGoodId: string,
    components: Array<{
      componentGoodId: string;
      qty: number;
      rowNum: number;
      unitId?: string | null;
      note?: string | null;
    }>
  ): Promise<void> {
    // Примітки: Dilovod SoT (remark). Якщо payload.note === undefined — зберігаємо попереднє
    // (structure-only sync без BOM). Якщо null/рядок — пишемо з Dilovod / UI.
    // Ключ по rowNum: один інгредієнт може бути в кількох рядках.
    const existingNotes = await tx.catalogGoodComponent.findMany({
      where: { parentGoodId },
      select: { componentGoodId: true, rowNum: true, note: true },
    });
    const noteByRow = new Map(
      existingNotes
        .filter((r) => r.note != null && String(r.note).trim() !== '')
        .map((r) => [`${r.rowNum}:${r.componentGoodId}`, r.note as string])
    );

    await tx.catalogGoodComponent.deleteMany({ where: { parentGoodId } });
    if (components.length === 0) return;

    // Ensure component goods exist (minimal stub) to satisfy FK
    const ensuredIds = new Set<string>();
    for (const c of components) {
      if (ensuredIds.has(c.componentGoodId)) continue;
      ensuredIds.add(c.componentGoodId);
      const exists = await tx.catalogGood.findUnique({
        where: { id: c.componentGoodId },
        select: { id: true },
      });
      if (!exists) {
        await tx.catalogGood.create({
          data: {
            id: c.componentGoodId,
            name: c.componentGoodId,
            isGroup: false,
            delMark: false,
          },
        });
      }
    }

    // Гарантуємо унікальний rowNum у межах parent (unique parentGoodId+rowNum)
    await tx.catalogGoodComponent.createMany({
      data: components.map((c, idx) => {
        const rowNum = idx + 1;
        const noteFromPayload =
          c.note !== undefined ? (c.note?.trim() || null) : undefined;
        const note =
          noteFromPayload !== undefined
            ? noteFromPayload
            : noteByRow.get(`${c.rowNum}:${c.componentGoodId}`) ??
              noteByRow.get(`${rowNum}:${c.componentGoodId}`) ??
              null;
        return {
          parentGoodId,
          componentGoodId: c.componentGoodId,
          qty: c.qty,
          rowNum,
          unitId: c.unitId ?? null,
          note,
        };
      }),
    });
  }

  private async replacePrices(
    tx: Tx,
    goodId: string,
    prices: Array<{ priceType: string; price: number; currency?: string | null }>
  ): Promise<void> {
    await tx.catalogGoodPrice.deleteMany({ where: { goodId } });
    if (prices.length === 0) return;
    const now = new Date();
    await tx.catalogGoodPrice.createMany({
      data: prices.map((p) => ({
        goodId,
        priceType: p.priceType,
        price: p.price,
        currency: p.currency ?? null,
        syncedAt: now,
      })),
    });
  }

  private async replaceBarcodes(
    tx: Tx,
    goodId: string,
    barcodes: Array<{
      code: string;
      activity: boolean;
      dilovodRegisterId?: string | null;
      goodPart?: string | null;
      goodPartName?: string | null;
    }>
  ): Promise<void> {
    await tx.catalogGoodBarcode.deleteMany({ where: { goodId } });
    if (barcodes.length === 0) return;
    const now = new Date();
    await tx.catalogGoodBarcode.createMany({
      data: barcodes.map((b) => ({
        goodId,
        code: b.code,
        activity: b.activity,
        dilovodRegisterId: b.dilovodRegisterId ?? null,
        goodPart: b.goodPart?.trim() || '',
        goodPartName: b.goodPartName?.trim() || null,
        syncedAt: now,
      })),
    });
  }
}

export const productsLocalSync = new ProductsLocalSync();
