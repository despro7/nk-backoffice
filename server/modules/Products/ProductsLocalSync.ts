/**
 * Local mirror sync for catalog_* only.
 * Таблицю `products` Products 2.0 НЕ чіпає — legacy Dilovod sync лишається єдиним власником.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma, logServer } from '../../lib/utils.js';
import { LocalSyncGoodPayload } from './ProductsTypes.js';

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

    await tx.catalogGood.upsert({
      where: { id: payload.id },
      create: { id: payload.id, ...data },
      update: data,
    });
  }

  private async replaceComponents(
    tx: Tx,
    parentGoodId: string,
    components: Array<{ componentGoodId: string; qty: number; rowNum: number }>
  ): Promise<void> {
    await tx.catalogGoodComponent.deleteMany({ where: { parentGoodId } });
    if (components.length === 0) return;

    // Ensure component goods exist (minimal stub) to satisfy FK
    for (const c of components) {
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

    await tx.catalogGoodComponent.createMany({
      data: components.map((c) => ({
        parentGoodId,
        componentGoodId: c.componentGoodId,
        qty: c.qty,
        rowNum: c.rowNum,
      })),
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
