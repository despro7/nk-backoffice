import { prisma } from '../../lib/utils.js';

export {
  isLastShipmentReturned,
  SHIPMENT_MONOLITHIC_ACC_GOOD,
  isRepeatPicking,
  isReturnDuplicate,
  isSaleDuplicate,
  latestDocDate,
  needsNewSaleDoc,
  resolveShipmentCycle,
  type ShipmentCycleDecision,
} from '../../../shared/utils/dilovodShipmentCycle.js';

/**
 * Момент останньої комплектації: останній запис історії зі статусом 3,
 * fallback `readyToShipAt` (ставиться лише при першій комплектації).
 */
export async function getLastPickedAt(
  orderId: number,
  readyToShipAt: Date | null | undefined,
): Promise<Date | null> {
  const lastPicked = await prisma.ordersHistory.findFirst({
    where: { orderId, status: '3' },
    orderBy: { changedAt: 'desc' },
    select: { changedAt: true },
  });
  return lastPicked?.changedAt ?? readyToShipAt ?? null;
}

/** id замовлень зі справжніми дублікатами відвантаження (з урахуванням повернень). */
export async function getSaleDuplicateOrderIds(): Promise<number[]> {
  const rows = await prisma.$queryRaw<Array<{ id: number | bigint }>>`
    SELECT id FROM orders
    WHERE dilovodSaleDocsCount > COALESCE(dilovodReturnDocsCount, 0) + 1
  `;
  return rows.map((row) => Number(row.id));
}
