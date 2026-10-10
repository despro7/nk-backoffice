const KYIV_TZ = 'Europe/Kyiv';

export function getKyivCalendarDay(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('sv-SE', { timeZone: KYIV_TZ });
}

export function isReleaseHistoryEditableToday(
  createdAt: Date | string,
  now: Date = new Date(),
): boolean {
  const createdDay = getKyivCalendarDay(createdAt);
  const today = getKyivCalendarDay(now);
  return Boolean(createdDay && today && createdDay === today);
}

export const WAREHOUSE_HISTORY_EDIT_DENIED_MESSAGE =
  'Редагування цього запису недоступне (лише свої записи за поточний день або роль адміністратора)';

function normalizeUserId(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function canEditWarehouseReleaseHistory(params: {
  isAdmin: boolean;
  createdAt: Date | string;
  createdBy?: number | string | null;
  currentUserId?: number | string | null;
  now?: Date;
}): boolean {
  if (params.isAdmin) return true;
  if (!isReleaseHistoryEditableToday(params.createdAt, params.now)) return false;

  const ownerId = normalizeUserId(params.createdBy);
  const currentUserId = normalizeUserId(params.currentUserId);
  if (!ownerId || !currentUserId || ownerId !== currentUserId) return false;

  return true;
}
