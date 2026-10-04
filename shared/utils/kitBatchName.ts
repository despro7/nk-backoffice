import { generateBatchSerialFromDate, isMissingDilovodDate } from './dilovodBatchId.js';

export const KIT_BATCH_PREFIX = 'K';
export const REBATCH_NAME_PREFIX = 'REBATCH: ';

export function formatKitBatchBaseName(date: Date | string): string | null {
  let isoDay: string;
  if (date instanceof Date) {
    const pad = (value: number): string => String(value).padStart(2, '0');
    isoDay = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  } else {
    isoDay = String(date ?? '').trim().slice(0, 10);
  }

  const serial = generateBatchSerialFromDate(isoDay);
  return serial ? `${KIT_BATCH_PREFIX}${serial}` : null;
}

export function normalizeBatchExpiration(value: unknown): string | null {
  if (isMissingDilovodDate(value)) return null;
  const day = String(value ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** Dilovod `catalogs.goodParts.expiration` приймає лише datetime (`YYYY-MM-DD 00:00:00`). */
export function formatBatchExpirationForDilovod(value: unknown): string | null {
  const day = normalizeBatchExpiration(value);
  return day ? `${day} 00:00:00` : null;
}

function stripKitBatchPrefix(value: string): string {
  const trimmed = String(value ?? '').trim();
  return trimmed.startsWith(KIT_BATCH_PREFIX) ? trimmed.slice(KIT_BATCH_PREFIX.length) : trimmed;
}

/** Код партії для Dilovod (`catalogs.goodParts.code`) — як у backoffice, з префіксом K. */
export function formatGoodPartCodeForDilovod(batchName: string): string {
  return String(batchName ?? '').trim();
}

/** Номер партії (`catalogs.goodParts.number`) — YMMDD без префікса K. */
export function formatGoodPartNumberForDilovod(batchName: string): string {
  return stripKitBatchPrefix(String(batchName ?? '').trim());
}

/** Відображувана назва kit-партії з префіксом K (лише для YMMDD-формату). */
export function formatKitBatchDisplayName(code: string): string {
  const trimmed = String(code ?? '').trim();
  if (!trimmed || trimmed.startsWith(KIT_BATCH_PREFIX)) return trimmed;
  if (/^\d{5}(-\d+)?$/.test(trimmed)) return `${KIT_BATCH_PREFIX}${trimmed}`;
  return trimmed;
}

export function pickMinExpiration(values: Array<string | null | undefined>): string | null {
  const normalized = values
    .map((value) => normalizeBatchExpiration(value))
    .filter((value): value is string => Boolean(value));
  if (normalized.length === 0) return null;
  return [...normalized].sort()[0];
}

export function canReuseKitBatchExpiration(
  existingExpiration: string | null,
  requiredMinExpiration: string | null,
): boolean {
  if (!requiredMinExpiration) return true;
  if (!existingExpiration) return true;
  return requiredMinExpiration >= existingExpiration;
}

export type KitBatchCandidate = {
  id: string;
  code: string;
  expiration: string | null;
};

export type KitBatchPlan = {
  batchName: string;
  batchId: string | null;
  reuseExisting: boolean;
  createNew: boolean;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseKitBatchSuffix(code: string, baseName: string): number {
  const normalizedCode = stripKitBatchPrefix(String(code ?? '').trim());
  const normalizedBase = stripKitBatchPrefix(String(baseName ?? '').trim());
  if (!normalizedCode || !normalizedBase) return -1;
  if (normalizedCode === normalizedBase) return 0;
  const match = new RegExp(`^${escapeRegex(normalizedBase)}-(\\d+)$`).exec(normalizedCode);
  return match ? Number(match[1]) : -1;
}

export function isKitBatchCode(code: string, baseName: string): boolean {
  return parseKitBatchSuffix(code, baseName) >= 0;
}

export function planKitOutputBatch(
  baseName: string,
  existingBatches: KitBatchCandidate[],
  requiredMinExpiration: string | null,
): KitBatchPlan {
  const normalizedBase = String(baseName ?? '').trim();
  const relevant = existingBatches.filter((batch) => isKitBatchCode(batch.code, normalizedBase));

  const sorted = [...relevant].sort((left, right) => (
    parseKitBatchSuffix(left.code, normalizedBase) - parseKitBatchSuffix(right.code, normalizedBase)
  ));

  for (const batch of sorted) {
    if (canReuseKitBatchExpiration(batch.expiration, requiredMinExpiration)) {
      return {
        batchName: formatKitBatchDisplayName(batch.code),
        batchId: batch.id,
        reuseExisting: true,
        createNew: false,
      };
    }
  }

  const normalizedBaseCode = stripKitBatchPrefix(normalizedBase);
  const baseExists = relevant.some((batch) => stripKitBatchPrefix(batch.code) === normalizedBaseCode);
  if (!baseExists) {
    return {
      batchName: normalizedBase,
      batchId: null,
      reuseExisting: false,
      createNew: true,
    };
  }

  const maxSuffix = relevant.reduce((max, batch) => (
    Math.max(max, parseKitBatchSuffix(batch.code, normalizedBase))
  ), 0);

  return {
    batchName: `${normalizedBase}-${maxSuffix + 1}`,
    batchId: null,
    reuseExisting: false,
    createNew: true,
  };
}

export function formatRebatchSetName(name: string): string {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return REBATCH_NAME_PREFIX.trim();
  if (/^REBATCH:\s*/i.test(trimmed)) {
    const rest = trimmed.replace(/^REBATCH:\s*/i, '').trim();
    return `${REBATCH_NAME_PREFIX}${rest}`;
  }
  return `${REBATCH_NAME_PREFIX}${trimmed}`;
}
