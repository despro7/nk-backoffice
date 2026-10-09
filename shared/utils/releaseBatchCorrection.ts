import { isRebatchSku } from '../types/warehouseRelease.js';

/**
 * Префікс авто-коментаря режиму «Коригування парт. обліку».
 * Без `\b`: у JS word-boundary не працює з кирилицею.
 */
export const BATCH_CORRECTION_COMMENT_PREFIX_RE = /^Кор[еи]гування парт\. обліку/i;

/** Префікс + роздільник перед назвою набору в чіпі коментаря. */
export const BATCH_CORRECTION_COMMENT_STRIP_RE = /^Кор[еи]гування парт\. обліку\s[–-]\s/i;

export function isBatchCorrectionComment(comment: unknown): boolean {
  return BATCH_CORRECTION_COMMENT_PREFIX_RE.test(String(comment ?? '').trim());
}

export function normalizeCorrectionSessionId(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw || raw === 'null' || raw === 'undefined') return null;
  return raw;
}

/**
 * Чи запис випуску — коригування партійного обліку.
 * Сесія — основний маркер; comment / REBATCH SKU — fallback для старих/битих записів.
 */
export function isReleaseBatchCorrection(input: {
  correctionSessionId?: unknown;
  comment?: unknown;
  setSku?: unknown;
  items?: unknown;
}): boolean {
  if (normalizeCorrectionSessionId(input.correctionSessionId)) return true;
  if (isBatchCorrectionComment(input.comment)) return true;

  const setSku = String(input.setSku ?? '').trim();
  if (setSku && isRebatchSku(setSku)) return true;

  if (Array.isArray(input.items)) {
    for (const item of input.items) {
      if (!item || typeof item !== 'object') continue;
      const row = item as {
        correction_session_id?: unknown;
        set_sku?: unknown;
        setSku?: unknown;
      };
      if (normalizeCorrectionSessionId(row.correction_session_id)) return true;
      const itemSku = String(row.set_sku ?? row.setSku ?? '').trim();
      if (itemSku && isRebatchSku(itemSku)) return true;
    }
  }

  return false;
}

export function createCorrectionSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `corr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
