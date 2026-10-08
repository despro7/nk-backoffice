import { generateBatchSerialFromDate, isMissingDilovodDate } from './dilovodBatchId.js';

export const KIT_BATCH_PREFIX = 'K-';
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

/** YMMDD або YMMDD-N без префікса K / K- (для порівняння кодів Dilovod). */
export function normalizeKitBatchCore(code: string): string {
  let trimmed = String(code ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith(KIT_BATCH_PREFIX)) {
    return trimmed.slice(KIT_BATCH_PREFIX.length);
  }
  if (/^K\d{5}(-\d+)?$/i.test(trimmed)) {
    return trimmed.slice(1);
  }
  return trimmed;
}

/** Варіанти серійного № для пошуку в Dilovod (K-61008 ↔ K61008). */
export function kitBatchSerialLookupVariants(batchName: string): string[] {
  const display = formatKitBatchDisplayName(String(batchName ?? '').trim());
  const core = normalizeKitBatchCore(display);
  if (!core) return [];
  const variants = new Set<string>();
  if (display) variants.add(display);
  variants.add(`${KIT_BATCH_PREFIX}${core}`);
  variants.add(`K${core}`);
  variants.add(core);
  return [...variants].filter(Boolean);
}

/** Код партії для Dilovod (`catalogs.goodParts.code`) — як у backoffice, з префіксом K-. */
export function formatGoodPartCodeForDilovod(batchName: string): string {
  return String(batchName ?? '').trim();
}

/** Номер партії (`catalogs.goodParts.number`) — YMMDD без префікса K-. */
export function formatGoodPartNumberForDilovod(batchName: string): string {
  return stripKitBatchPrefix(String(batchName ?? '').trim());
}

/** Відображувана назва kit-партії з префіксом K- (лише для YMMDD-формату). */
export function formatKitBatchDisplayName(code: string): string {
  const trimmed = String(code ?? '').trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith(KIT_BATCH_PREFIX)) return trimmed;
  // Legacy Dilovod: K61008, K61008-1 → канонічний K-61008, K-61008-1
  if (/^K(\d{5}(-\d+)?)$/i.test(trimmed)) {
    return `${KIT_BATCH_PREFIX}${trimmed.slice(1)}`;
  }
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
  /** false — враховувати лише для суфікса (глобально зайнятий code на іншому товарі). */
  allowReuse?: boolean;
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
  const normalizedCode = normalizeKitBatchCore(String(code ?? '').trim());
  const normalizedBase = normalizeKitBatchCore(String(baseName ?? '').trim());
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
    if (batch.allowReuse === false) continue;
    if (canReuseKitBatchExpiration(batch.expiration, requiredMinExpiration)) {
      return {
        batchName: formatKitBatchDisplayName(batch.code),
        batchId: batch.id,
        reuseExisting: true,
        createNew: false,
      };
    }
  }

  const normalizedBaseCode = normalizeKitBatchCore(normalizedBase);
  const baseExists = relevant.some((batch) => normalizeKitBatchCore(batch.code) === normalizedBaseCode);
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

/**
 * Уточнює план створення kit-партії з урахуванням глобально зайнятих серійних № у Dilovod.
 */
export function refineKitOutputBatchPlanForOccupiedCodes(
  baseName: string,
  existingBatches: KitBatchCandidate[],
  requiredMinExpiration: string | null,
  occupiedCodes: string[],
): KitBatchPlan {
  const normalizedBase = String(baseName ?? '').trim();
  let augmented = [...existingBatches];
  let plan = planKitOutputBatch(normalizedBase, augmented, requiredMinExpiration);
  const occupied = new Set(
    occupiedCodes.map((code) => normalizeKitBatchCore(code)).filter(Boolean),
  );
  if (occupied.size === 0) return plan;

  let guard = 0;
  while (plan.createNew && guard < 32) {
    const plannedCore = normalizeKitBatchCore(plan.batchName);
    if (!plannedCore || !occupied.has(plannedCore)) break;

    const virtualCode = formatKitBatchDisplayName(plan.batchName);
    if (!augmented.some((batch) => normalizeKitBatchCore(batch.code) === plannedCore)) {
      augmented.push({
        id: `virtual:${plannedCore}`,
        code: virtualCode,
        expiration: null,
        allowReuse: false,
      });
    }
    plan = planKitOutputBatch(normalizedBase, augmented, requiredMinExpiration);
    guard += 1;
  }

  return plan;
}
