import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/utils.js';

export const SALE_SHIPMENT_LOCK_TTL_MS = 10 * 60 * 1000;

type SaleShipmentLockStatus = 'acquired' | 'already_shipped' | 'locked' | 'not_found';

export interface SaleShipmentLockResult {
  status: SaleShipmentLockStatus;
  lockToken?: string;
  lockUntil?: Date;
}

function createLockToken(): string {
  return crypto.randomUUID();
}

/**
 * @param options.repeatOf Повторне відвантаження після повернення: поточна dilovodSaleExportDate.
 *   Lock береться лише якщо дата не змінилась (optimistic), замість вимоги dilovodSaleExportDate = null.
 */
export async function acquireSaleShipmentLock(
  orderId: number,
  options?: { repeatOf?: Date | null },
): Promise<SaleShipmentLockResult> {
  const repeatOf = options?.repeatOf ?? null;
  const isShippedForLock = (date: Date | null) =>
    repeatOf ? date?.getTime() !== repeatOf.getTime() : !!date;

  const snapshot = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      dilovodSaleExportDate: true,
      dilovodSaleExportLockUntil: true,
    }
  });

  if (!snapshot) {
    return { status: 'not_found' };
  }

  if (isShippedForLock(snapshot.dilovodSaleExportDate)) {
    return { status: 'already_shipped' };
  }

  const now = new Date();
  if (snapshot.dilovodSaleExportLockUntil && snapshot.dilovodSaleExportLockUntil > now) {
    return { status: 'locked' };
  }

  const lockToken = createLockToken();
  const lockUntil = new Date(now.getTime() + SALE_SHIPMENT_LOCK_TTL_MS);

  const result = await prisma.order.updateMany({
    where: {
      id: orderId,
      dilovodSaleExportDate: repeatOf ?? null,
      OR: [
        { dilovodSaleExportLockUntil: null },
        { dilovodSaleExportLockUntil: { lte: now } }
      ]
    },
    data: {
      dilovodSaleExportLockToken: lockToken,
      dilovodSaleExportLockUntil: lockUntil,
    }
  });

  if (result.count > 0) {
    return { status: 'acquired', lockToken, lockUntil };
  }

  const freshSnapshot = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      dilovodSaleExportDate: true,
      dilovodSaleExportLockUntil: true,
    }
  });

  if (!freshSnapshot) {
    return { status: 'not_found' };
  }

  if (isShippedForLock(freshSnapshot.dilovodSaleExportDate)) {
    return { status: 'already_shipped' };
  }

  if (freshSnapshot.dilovodSaleExportLockUntil && freshSnapshot.dilovodSaleExportLockUntil > now) {
    return { status: 'locked' };
  }

  return { status: 'locked' };
}

export async function completeSaleShipmentLock(
  orderId: number,
  lockToken: string,
  saleDate: string,
  saleDocsCount?: number
): Promise<boolean> {
  const data: Record<string, unknown> = {
    dilovodSaleExportDate: saleDate,
    dilovodSaleExportLockToken: null,
    dilovodSaleExportLockUntil: null,
  };

  if (saleDocsCount !== undefined) {
    data.dilovodSaleDocsCount = saleDocsCount;
  }

  const result = await prisma.order.updateMany({
    where: {
      id: orderId,
      dilovodSaleExportLockToken: lockToken,
    },
    data
  });

  if (result.count > 0) {
    await hideShipmentErrorLogsForOrderIds([orderId]);
  }

  return result.count > 0;
}

/**
 * Приховує (hiddenBy._all) активні error-логи відвантаження замовлень після успішного відвантаження.
 * Саме ці логи тримають замовлення у фільтрі «Невідвантажені» і в сповіщеннях.
 * Умова збігається з фільтром у GET /salesdrive/orders (routes/dilovod.ts).
 */
export async function hideShipmentErrorLogs(orderNumbers: string[]): Promise<number> {
  const unique = [...new Set(orderNumbers.filter(Boolean))];
  if (unique.length === 0) return 0;

  try {
    const now = new Date().toISOString();
    return await prisma.$executeRaw(Prisma.sql`
      UPDATE meta_logs
      SET hiddenBy = JSON_SET(COALESCE(hiddenBy, JSON_OBJECT()), '$._all', ${now})
      WHERE orderNumber IN (${Prisma.join(unique)})
        AND status = 'error'
        AND (
          LOWER(title) LIKE '%shipment%' OR LOWER(title) LIKE '%відвантаж%' OR
          LOWER(message) LIKE '%shipment%' OR LOWER(message) LIKE '%відвантаж%'
        )
        AND JSON_EXTRACT(hiddenBy, '$._all') IS NULL
    `);
  } catch (err) {
    console.log('⚠️ [Dilovod] Не вдалося приховати error-логи відвантаження:', err);
    return 0;
  }
}

export async function hideShipmentErrorLogsForOrderIds(orderIds: number[]): Promise<number> {
  if (orderIds.length === 0) return 0;
  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: { orderNumber: true },
  });
  return hideShipmentErrorLogs(orders.map((order) => order.orderNumber));
}

export async function releaseSaleShipmentLock(orderId: number, lockToken: string): Promise<boolean> {
  const result = await prisma.order.updateMany({
    where: {
      id: orderId,
      dilovodSaleExportLockToken: lockToken,
    },
    data: {
      dilovodSaleExportLockToken: null,
      dilovodSaleExportLockUntil: null,
    }
  });

  return result.count > 0;
}