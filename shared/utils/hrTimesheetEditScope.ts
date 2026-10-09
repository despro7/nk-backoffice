const KYIV_TZ = 'Europe/Kyiv';

function kyivDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: KYIV_TZ }).format(date);
}

/** Чи створено запис табеля в поточний календарний день (Europe/Kyiv). */
export function isTimesheetEntryCreatedTodayKyiv(createdAt: Date, now = new Date()): boolean {
  return kyivDateKey(createdAt) === kyivDateKey(now);
}

/**
 * full — повне редагування.
 * author-today — будь-який співробітник; порожні клітинки ок;
 * існуючі — лише автор = поточний user і createdAt сьогодні; без автора — блок.
 */
export type HrTimesheetEditMode = 'full' | 'author-today';

export function canEditTimesheetCell(params: {
  mode: HrTimesheetEditMode;
  currentUserId: number | null | undefined;
  /** null / відсутній запис = порожня клітинка */
  entry: {
    createdAt?: string | Date | null;
    createdByUserId?: number | null;
  } | null;
  now?: Date;
}): boolean {
  if (params.mode === 'full') return true;

  if (!params.entry) return true;

  const authorId = params.entry.createdByUserId;
  if (authorId == null || !params.currentUserId || authorId !== params.currentUserId) {
    return false;
  }

  if (!params.entry.createdAt) return false;
  const created =
    params.entry.createdAt instanceof Date
      ? params.entry.createdAt
      : new Date(params.entry.createdAt);
  if (Number.isNaN(created.getTime())) return false;
  return isTimesheetEntryCreatedTodayKyiv(created, params.now);
}
