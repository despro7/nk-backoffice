import {
  isMobMovementStoredItems,
  isMovementCreatedViaMobScanFlow,
} from './warehouseMovementMobItems.js';

export type MovementNotesChannel = 'default' | 'mob-scan';

/** Суфікс коментаря для remark документа goodMoving у Dilovod. */
export function buildBackofficeMovementNotesSuffix(
  isAdd: boolean,
  channel: MovementNotesChannel = 'default',
): string {
  const date = new Date().toLocaleString('uk-UA');
  const verb = isAdd ? 'Додано' : 'Оновлено';
  const scanTag = channel === 'mob-scan' ? ' (сканування)' : '';
  return `${verb} з Backoffice${scanTag} ${date}`;
}

const BACKOFFICE_SUFFIX_PATTERN =
  /\s*\|\s*(Додано|Оновлено) з Backoffice(?: \(сканування\))? .+$/;

/** Користувацький текст + один актуальний суфікс Backoffice (без дублювання). */
export function buildEffectiveMovementNotes(
  userNotes: string | null | undefined,
  isAdd: boolean,
  channel: MovementNotesChannel = 'default',
): string {
  const suffix = buildBackofficeMovementNotesSuffix(isAdd, channel);
  const cleaned = String(userNotes ?? '').replace(BACKOFFICE_SUFFIX_PATTERN, '').trim();
  return cleaned ? `${cleaned} | ${suffix}` : suffix;
}

const MOB_SCAN_NOTES_MARK = /\(сканування\)/;

/** Суфікс remark «…з Backoffice (сканування) …» — mob-переміщення. */
export function movementNotesIndicateMobScan(notes: string | null | undefined): boolean {
  return MOB_SCAN_NOTES_MARK.test(String(notes ?? ''));
}

/** Історія v2: mob-скан за приміткою, receiptScanStartedAt або ШК у items. */
export function isMobScanMovementHistoryRecord(input: {
  notes?: string | null;
  comment?: string | null;
  items?: unknown;
  receiptScanStartedAt?: Date | string | null;
}): boolean {
  if (movementNotesIndicateMobScan(input.notes ?? input.comment)) {
    return true;
  }
  const receiptScanStartedAt = input.receiptScanStartedAt != null
    ? String(input.receiptScanStartedAt)
    : null;
  return isMovementCreatedViaMobScanFlow({
    items: input.items,
    receiptScanStartedAt,
  });
}

/** Документ з mob-циклу (скан / submit), не desktop v2-only. */
export function isMobScanMovementRecord(input: {
  submittedAt?: Date | string | null;
  items?: unknown;
}): boolean {
  if (typeof input.items === 'string') {
    try {
      const parsed = JSON.parse(input.items);
      if (isMobMovementStoredItems(parsed)) return true;
    } catch {
      // fall through
    }
  } else if (isMobMovementStoredItems(input.items)) {
    return true;
  }
  return Boolean(input.submittedAt);
}
