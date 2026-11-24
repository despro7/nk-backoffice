import { addToVector, negateVector, type DeviationVector } from './deviationVector.js';
import type { HypothesisCandidate } from './scoreHypotheses.js';

/** Скільки днів до кінця вікна дивимось відвантаження для пошуку непроведених/дубльованих повернень. */
export const RETURN_LOOKBACK_DAYS = 45;
export const RETURN_STATUSES: readonly string[] = ['6', '7'];

export interface ReturnOrderInput {
  reportKey: string;
  externalId: string;
  orderNumber: string | null;
  saleDocumentNumber: string | null;
  status: string | null;
  dilovodSaleExportDate: Date | string | null;
  dilovodReturnDate: Date | string | null;
  dilovodReturnDocsCount: number | null;
  /** Склад відвантаження (sku -> кількість), уже звужений до SKU сесії. */
  shipped: DeviationVector;
}

/** Повернення: фізично повернено, але не проведено (+склад) або проведено двічі (-склад). */
export function buildReturnCandidates(orders: ReturnOrderInput[]): HypothesisCandidate[] {
  const out: HypothesisCandidate[] = [];
  for (const o of orders) {
    if (o.shipped.size === 0) continue;
    const at = o.dilovodSaleExportDate ? new Date(o.dilovodSaleExportDate) : null;
    const reference = {
      kind: 'order' as const,
      id: String(o.externalId),
      number: String(o.saleDocumentNumber ?? o.orderNumber ?? o.externalId),
      orderNumber: o.orderNumber != null ? String(o.orderNumber) : null,
      date: at ? at.toISOString() : null,
    };
    const returnedStatus = o.status != null && RETURN_STATUSES.includes(String(o.status));
    if (returnedStatus && o.dilovodReturnDate == null && !(o.dilovodReturnDocsCount && o.dilovodReturnDocsCount > 0)) {
      const vector: DeviationVector = new Map();
      for (const [sku, q] of o.shipped) addToVector(vector, sku, q);
      out.push({ id: `return-unposted-${o.reportKey}`, type: 'return_unposted', vector, at: at?.getTime() ?? null, reference });
    }
    if ((o.dilovodReturnDocsCount ?? 0) > 1) {
      // Зайві документи повернення: кожен додатковий повертає склад ще раз
      const extra = (o.dilovodReturnDocsCount ?? 1) - 1;
      const vector: DeviationVector = new Map();
      for (const [sku, q] of o.shipped) addToVector(vector, sku, q * extra);
      out.push({ id: `return-duplicated-${o.reportKey}`, type: 'return_duplicated', vector: negateVector(vector), at: at?.getTime() ?? null, reference });
    }
  }
  return out;
}
