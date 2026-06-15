import crypto from 'crypto';
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

export async function acquireSaleShipmentLock(orderId: number): Promise<SaleShipmentLockResult> {
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

  if (snapshot.dilovodSaleExportDate) {
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
      dilovodSaleExportDate: null,
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

  if (freshSnapshot.dilovodSaleExportDate) {
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

  return result.count > 0;
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