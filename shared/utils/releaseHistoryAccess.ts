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

export function canEditWarehouseReleaseHistory(params: {
  isAdmin: boolean;
  createdAt: Date | string;
  now?: Date;
}): boolean {
  if (params.isAdmin) return true;
  return isReleaseHistoryEditableToday(params.createdAt, params.now);
}
