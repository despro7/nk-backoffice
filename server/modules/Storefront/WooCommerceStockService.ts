/**
 * WooCommerce stock sync via REST API (Phase 3).
 */

import { prisma, logServer } from '../../lib/utils.js';
import { getPortionsInOrdersBySku } from '../../services/productExportHelper.js';
import { catalogOpsLookup } from '../Products/CatalogOpsLookup.js';
import type { CatalogOpsProduct } from '../Products/CatalogOpsLookup.js';
import type { StorefrontStockViaWcMode, WooStockSyncResult } from '../../../shared/types/storefront.js';
import { storefrontService } from './StorefrontService.js';
import { createWooCommerceClient } from './WooCommerceApiClient.js';

const BATCH_CHUNK_SIZE = 25;

export function computeEffectiveStock(
  stockBalanceByStock: Record<string, number> | null | undefined,
  portionsInOrders: number,
): number {
  const gpStock = Number(stockBalanceByStock?.['1']) || 0;
  const moStock = Number(stockBalanceByStock?.['2']) || 0;
  return Math.max(0, gpStock + moStock - portionsInOrders);
}

function shouldSyncProductStock(product: CatalogOpsProduct): boolean {
  const set = Array.isArray(product.set) ? product.set : [];
  const stockBalanceByStock = { ...(product.stockBalanceByStock ?? {}) };
  const hasOwnStock =
    Number(stockBalanceByStock['1']) > 0 || Number(stockBalanceByStock['2']) > 0;
  if (set.length > 0 && !hasOwnStock) return false;
  return Boolean(product.sku?.trim());
}

function buildStockPayload(quantity: number): {
  manage_stock: boolean;
  stock_quantity: number;
  stock_status: 'instock' | 'outofstock';
} {
  return {
    manage_stock: true,
    stock_quantity: quantity,
    stock_status: quantity > 0 ? 'instock' : 'outofstock',
  };
}

export class WooCommerceStockService {
  async computeStockTargets(skus?: string[]): Promise<
    Array<{ sku: string; goodId: string | null; effectiveStock: number }>
  > {
    const products = await catalogOpsLookup.listFinishedProducts({ includeOutdated: false });
    const portionsMap = await getPortionsInOrdersBySku();
    const skuFilter = skus?.length ? new Set(skus.map((sku) => sku.trim()).filter(Boolean)) : null;

    const targets: Array<{ sku: string; goodId: string | null; effectiveStock: number }> = [];

    for (const product of products) {
      if (!shouldSyncProductStock(product)) continue;
      const sku = product.sku.trim();
      if (skuFilter && !skuFilter.has(sku)) continue;

      const effectiveStock = computeEffectiveStock(
        product.stockBalanceByStock,
        portionsMap.get(sku) ?? 0,
      );

      const good = await prisma.catalogGood.findFirst({
        where: { sku, isGroup: false },
        select: { id: true },
      });

      targets.push({ sku, goodId: good?.id ?? null, effectiveStock });
    }

    return targets;
  }

  async resolveWooProductId(
    sku: string,
    goodId: string | null,
    wooProductId: number | null,
  ): Promise<number | null> {
    if (wooProductId) return wooProductId;

    const creds = await storefrontService.getWooCredentialsInternal();
    const client = createWooCommerceClient(creds);
    const found = await client.getProductBySku(sku);
    if (found) {
      if (goodId) {
        await prisma.catalogGood.update({
          where: { id: goodId },
          data: { wooProductId: found.id },
        });
      }
      return found.id;
    }

    logServer(
      `[WooCommerceStockService] skipped stock sync for ${sku}: product not found on WC (create via push BO→WC)`,
    );
    return null;
  }

  async syncStock(options?: {
    skus?: string[];
    mode?: StorefrontStockViaWcMode;
  }): Promise<WooStockSyncResult> {
    const mode = options?.mode ?? await storefrontService.getStockViaWcMode();
    const targets = await this.computeStockTargets(options?.skus);
    const creds = await storefrontService.getWooCredentialsInternal();
    const client = createWooCommerceClient(creds);

    const results: WooStockSyncResult['results'] = [];
    const discrepancies: WooStockSyncResult['discrepancies'] = [];
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    const resolved: Array<{
      sku: string;
      goodId: string | null;
      effectiveStock: number;
      wooProductId: number;
    }> = [];

    for (const target of targets) {
      try {
        const good = await prisma.catalogGood.findFirst({
          where: target.goodId
            ? { id: target.goodId, isGroup: false }
            : { sku: target.sku, isGroup: false },
          select: { id: true, wooProductId: true },
        });

        const goodId = good?.id ?? target.goodId ?? null;
        const resolvedWooProductId = await this.resolveWooProductId(
          target.sku,
          goodId,
          good?.wooProductId ?? null,
        );
        if (resolvedWooProductId == null) {
          skipped++;
          results.push({
            sku: target.sku,
            goodId: goodId ?? undefined,
            effectiveStock: target.effectiveStock,
            ok: true,
            skipped: true,
          });
          continue;
        }

        resolved.push({
          sku: target.sku,
          goodId,
          effectiveStock: target.effectiveStock,
          wooProductId: resolvedWooProductId,
        });
      } catch (err) {
        errors++;
        results.push({
          sku: target.sku,
          goodId: target.goodId ?? undefined,
          effectiveStock: target.effectiveStock,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    for (let i = 0; i < resolved.length; i += BATCH_CHUNK_SIZE) {
      const chunk = resolved.slice(i, i + BATCH_CHUNK_SIZE);
      try {
        await client.batchUpdateProducts(
          chunk.map((row) => ({
            id: row.wooProductId,
            ...buildStockPayload(row.effectiveStock),
          })),
        );
        updated += chunk.length;

        if (mode === 'parallel') {
          for (const row of chunk) {
            const wcProduct = await client.getProductById(row.wooProductId);
            const wcStock = wcProduct?.stock_quantity ?? null;
            if (wcStock != null && wcStock !== row.effectiveStock) {
              discrepancies.push({ sku: row.sku, local: row.effectiveStock, wc: wcStock });
              logServer(
                `[stock-sync][discrepancy] sku=${row.sku} local=${row.effectiveStock} wc=${wcStock}`,
              );
            }
          }
        }

        for (const row of chunk) {
          results.push({
            sku: row.sku,
            goodId: row.goodId ?? undefined,
            wooProductId: row.wooProductId,
            effectiveStock: row.effectiveStock,
            ok: true,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors += chunk.length;
        for (const row of chunk) {
          results.push({
            sku: row.sku,
            goodId: row.goodId ?? undefined,
            wooProductId: row.wooProductId,
            effectiveStock: row.effectiveStock,
            ok: false,
            error: message,
          });
        }
      }
    }

    return {
      mode,
      updated,
      skipped,
      errors,
      discrepancies,
      results,
    };
  }
}

export const wooCommerceStockService = new WooCommerceStockService();
