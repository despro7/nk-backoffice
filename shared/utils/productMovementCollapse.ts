import {
  normalizeNullablePortionQty,
  normalizePortionQty,
  PRODUCT_MOVEMENT_PORTION_EPSILON,
} from './productMovementQty.js';

/** Один рух регістру після оцінки receipt/expense (до згортання по документу). */
export interface ProductMovementRegisterEffect {
  sortPeriod: string;
  date: string;
  dateTime: string;
  documentId: string | null;
  documentLabel: string;
  receiptQty: number | null;
  expenseQty: number | null;
  signedQty: number;
}

export interface CollapsedProductMovementLine {
  date: string;
  dateTime: string;
  documentId: string | null;
  documentLabel: string;
  receiptQty: number | null;
  expenseQty: number | null;
  signedQty: number;
}

/** Документи комплектації/розукомплектування — дробові рядки регістру згортаємо в один рух. */
export function isKitLikeProductMovementDocumentLabel(documentLabel: string): boolean {
  const text = documentLabel.trim().toLowerCase();
  return text.includes('комплектац')
    || text.includes('розкомплект')
    || text.includes('розукомплект');
}

export function buildProductMovementDocumentCollapseKey(effect: ProductMovementRegisterEffect): string {
  const id = effect.documentId?.trim() || '';
  const label = effect.documentLabel.trim() || '—';
  return `${id}|${label}|${effect.date}`;
}

/**
 * Згортає кілька рядків регістру одного документа комплектації в один рух.
 * Інші типи документів не змішуємо (навіть якщо recorder id збігається).
 */
export function collapseProductMovementEffectsByDocument(
  effects: ProductMovementRegisterEffect[],
): CollapsedProductMovementLine[] {
  if (effects.length === 0) return [];

  type Bucket = {
    date: string;
    dateTime: string;
    documentId: string | null;
    documentLabel: string;
    sortPeriod: string;
    receiptSum: number;
    expenseSum: number;
    signedSum: number;
  };

  const order: string[] = [];
  const buckets = new Map<string, Bucket>();

  for (let index = 0; index < effects.length; index += 1) {
    const effect = effects[index];
    const key = isKitLikeProductMovementDocumentLabel(effect.documentLabel)
      ? buildProductMovementDocumentCollapseKey(effect)
      : `__row__:${index}|${effect.sortPeriod}`;

    let bucket = buckets.get(key);
    if (!bucket) {
      order.push(key);
      bucket = {
        date: effect.date,
        dateTime: effect.dateTime,
        documentId: effect.documentId,
        documentLabel: effect.documentLabel,
        sortPeriod: effect.sortPeriod,
        receiptSum: 0,
        expenseSum: 0,
        signedSum: 0,
      };
      buckets.set(key, bucket);
    }

    if (effect.receiptQty != null) bucket.receiptSum += effect.receiptQty;
    if (effect.expenseQty != null) bucket.expenseSum += effect.expenseQty;
    bucket.signedSum += effect.signedQty;

    if (effect.sortPeriod.localeCompare(bucket.sortPeriod) > 0) {
      bucket.sortPeriod = effect.sortPeriod;
      bucket.dateTime = effect.dateTime;
    }
  }

  return order.map((key) => {
    const bucket = buckets.get(key)!;
    const receiptQty = normalizeNullablePortionQty(bucket.receiptSum);
    const expenseQty = normalizeNullablePortionQty(bucket.expenseSum);
    const signedQty = normalizePortionQty(bucket.signedSum);

    return {
      date: bucket.date,
      dateTime: bucket.dateTime,
      documentId: bucket.documentId,
      documentLabel: bucket.documentLabel,
      receiptQty,
      expenseQty,
      signedQty,
    };
  });
}

export function isMeaningfulCollapsedMovementLine(line: CollapsedProductMovementLine): boolean {
  return line.receiptQty != null
    || line.expenseQty != null
    || Math.abs(line.signedQty) > PRODUCT_MOVEMENT_PORTION_EPSILON;
}
