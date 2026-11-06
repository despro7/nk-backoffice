import { prisma } from '../../lib/utils.js';
import { parseKyivDateTime } from '../../../shared/utils/kyivDateTime.js';
import { dilovodRefId } from './dilovodContractPerson.js';
import type { OrderDilovodDocumentDto, OrderDilovodDocumentType } from '../../../shared/types/orderDilovodDocuments.js';

/**
 * Документи Dilovod замовлення (`order_dilovod_documents`): повна історія циклів
 * (замовлення, оплати, відвантаження, повернення). Поля `orders.dilovod*` лишаються кешем
 * останнього стану, ця таблиця – джерело історії.
 */

export type OrderDilovodDocumentSource = 'sync' | 'export' | 'migration';

export type OrderDilovodDocumentInput = {
  type: OrderDilovodDocumentType;
  dilovodId: string;
  number?: string | null;
  docDate: Date;
};

/** Рядок відповіді Dilovod (`id`, `date` у Europe/Kyiv, `number`) → вхід для запису. Невалідні: null. */
export function toOrderDilovodDocumentInput(
  type: OrderDilovodDocumentType,
  doc: { id?: unknown; date?: unknown; number?: unknown } | null | undefined,
): OrderDilovodDocumentInput | null {
  const dilovodId = dilovodRefId(doc?.id);
  const docDate = parseKyivDateTime(doc?.date);
  if (!dilovodId || !docDate) return null;
  const number = doc?.number == null ? null : String(doc.number).trim() || null;
  return { type, dilovodId, number, docDate };
}

/** Масив рядків Dilovod → валідні входи (без дублікатів за `dilovodId`). */
export function toOrderDilovodDocumentInputs(
  type: OrderDilovodDocumentType,
  docs: Array<{ id?: unknown; date?: unknown; number?: unknown }> | null | undefined,
): OrderDilovodDocumentInput[] {
  const byId = new Map<string, OrderDilovodDocumentInput>();
  for (const doc of docs ?? []) {
    const input = toOrderDilovodDocumentInput(type, doc);
    if (input) byId.set(input.dilovodId, input);
  }
  return [...byId.values()];
}

/** Upsert за `dilovodId`; повторний запис того самого документа лише оновлює дату й номер. */
export async function recordOrderDilovodDocuments(
  orderId: number,
  docs: OrderDilovodDocumentInput[],
  source: OrderDilovodDocumentSource,
): Promise<void> {
  for (const doc of docs) {
    await prisma.orderDilovodDocument.upsert({
      where: { dilovodId: doc.dilovodId },
      create: {
        orderId,
        type: doc.type,
        dilovodId: doc.dilovodId,
        number: doc.number ?? null,
        docDate: doc.docDate,
        source,
      },
      update: {
        orderId,
        type: doc.type,
        docDate: doc.docDate,
        ...(doc.number ? { number: doc.number } : {}),
      },
    });
  }
}

/**
 * Записує актуальний набір документів типу і прибирає ті, яких у Dilovod уже немає.
 * Викликати лише з повною відповіддю Dilovod (`complete`), інакше видаляти не можна.
 */
export async function syncOrderDilovodDocumentsOfType(
  orderId: number,
  type: OrderDilovodDocumentType,
  docs: OrderDilovodDocumentInput[],
  options: { complete: boolean; source: OrderDilovodDocumentSource },
): Promise<void> {
  await recordOrderDilovodDocuments(orderId, docs, options.source);
  if (!options.complete) return;
  await prisma.orderDilovodDocument.deleteMany({
    where: {
      orderId,
      type,
      dilovodId: { notIn: docs.map((doc) => doc.dilovodId) },
    },
  });
}

/** Безпечний запис (помилка не ламає основний flow експорту / синхронізації). */
export async function recordOrderDilovodDocumentsSafe(
  orderId: number | null | undefined,
  docs: OrderDilovodDocumentInput[],
  source: OrderDilovodDocumentSource,
  label: string,
): Promise<void> {
  if (!orderId || docs.length === 0) return;
  try {
    await recordOrderDilovodDocuments(orderId, docs, source);
  } catch (error) {
    console.warn(`⚠️ [${label}] Не вдалося записати документи Dilovod для orderId=${orderId}:`, error instanceof Error ? error.message : error);
  }
}

export async function deleteOrderDilovodDocumentsByOrderNumbers(orderNumbers: string[]): Promise<number> {
  if (orderNumbers.length === 0) return 0;
  const result = await prisma.orderDilovodDocument.deleteMany({
    where: { order: { orderNumber: { in: orderNumbers } } },
  });
  return result.count;
}

/** Документи для набору замовлень одним запитом, у хронологічному порядку. */
export async function loadOrderDilovodDocuments(
  orderIds: number[],
): Promise<Map<number, OrderDilovodDocumentDto[]>> {
  const map = new Map<number, OrderDilovodDocumentDto[]>();
  if (orderIds.length === 0) return map;
  const rows = await prisma.orderDilovodDocument.findMany({
    where: { orderId: { in: orderIds } },
    orderBy: [{ docDate: 'asc' }, { id: 'asc' }],
    select: { orderId: true, type: true, dilovodId: true, number: true, docDate: true },
  });
  for (const row of rows) {
    const list = map.get(row.orderId) ?? [];
    list.push({
      type: row.type as OrderDilovodDocumentType,
      dilovodId: row.dilovodId,
      number: row.number,
      docDate: row.docDate.toISOString(),
    });
    map.set(row.orderId, list);
  }
  return map;
}
