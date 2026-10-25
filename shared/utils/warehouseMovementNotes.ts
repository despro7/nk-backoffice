import { isMobMovementStoredItems } from './warehouseMovementMobItems.js';

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

/** Документ з mob-циклу (скан / submit), не desktop v2-only. */
export function isMobScanMovementRecord(input: {
  submittedAt?: Date | string | null;
  items?: unknown;
}): boolean {
  if (input.submittedAt) return true;
  if (typeof input.items === 'string') {
    try {
      const parsed = JSON.parse(input.items);
      return isMobMovementStoredItems(parsed);
    } catch {
      return false;
    }
  }
  return isMobMovementStoredItems(input.items);
}
