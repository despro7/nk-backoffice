import { prisma } from '../../lib/utils.js';
import {
  SHIPMENT_DATE_CONFIRMED_LOG_TITLE as SHIPMENT_DATE_CONFIRMED_LOG_TITLE_SQL,
  SHIPPED_WITHOUT_PICKING_SINCE as SHIPPED_WITHOUT_PICKING_SINCE_SQL,
} from '../../../shared/utils/dilovodShipmentCycle.js';

export {
  isShippedWithoutPicking,
  SHIPMENT_DATE_CONFIRMED_LOG_TITLE,
  SHIPPED_WITHOUT_PICKING_SINCE,
  SHIPPED_BEFORE_PICKING_TOLERANCE_MS,
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

/**
 * id замовлень, відвантажених без комплектації (див. `isShippedWithoutPicking`), крім видалених (8)
 * і тих, де дату відвантаження вже перевірили (meta_logs `Shipment date confirmed`, не прихований).
 */
export async function getShippedWithoutPickingOrderIds(): Promise<number[]> {
  const rows = await prisma.$queryRaw<Array<{ id: number | bigint }>>`
    SELECT o.id
    FROM orders o
    LEFT JOIN (
      SELECT orderId, MIN(changedAt) AS firstPickedAt
      FROM orders_history
      WHERE status = '3'
      GROUP BY orderId
    ) h ON h.orderId = o.id
    WHERE o.dilovodSaleExportDate >= ${new Date(SHIPPED_WITHOUT_PICKING_SINCE_SQL)}
      AND o.status <> '8'
      AND (h.firstPickedAt IS NULL OR o.dilovodSaleExportDate < h.firstPickedAt - INTERVAL 3 HOUR)
      AND NOT EXISTS (
        SELECT 1 FROM meta_logs m
        WHERE m.orderNumber = o.orderNumber
          AND m.title = ${SHIPMENT_DATE_CONFIRMED_LOG_TITLE_SQL}
          AND JSON_EXTRACT(m.hiddenBy, '$._all') IS NULL
      )
  `;
  return rows.map((row) => Number(row.id));
}

/** id замовлень зі справжніми дублікатами відвантаження (з урахуванням повернень). */
export async function getSaleDuplicateOrderIds(): Promise<number[]> {
  const rows = await prisma.$queryRaw<Array<{ id: number | bigint }>>`
    SELECT id FROM orders
    WHERE dilovodSaleDocsCount > COALESCE(dilovodReturnDocsCount, 0) + 1
  `;
  return rows.map((row) => Number(row.id));
}
