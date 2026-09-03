import {
  HR_TIMESHEET_KIND_CODES,
  HR_TIMESHEET_WORK_KIND,
  type HrTimesheetKind,
  type HrTimesheetKindCode,
} from '../types/hr.js';

export interface HrTimesheetCellValue {
  kind: HrTimesheetKind | null;
  hours: string | null;
}

const TWO_LETTER: Record<string, HrTimesheetKindCode> = {
  тн: 'ТН',
  пр: 'Пр',
  св: 'Св',
};

const ONE_LETTER: Record<string, HrTimesheetKindCode> = {
  в: 'В',
  о: 'О',
  н: 'Н',
};

export function isTimesheetKind(value: string): value is HrTimesheetKind {
  return value === HR_TIMESHEET_WORK_KIND || (HR_TIMESHEET_KIND_CODES as readonly string[]).includes(value);
}

export function formatTimesheetHours(raw: string | null): string {
  if (!raw) return '';
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n)) return '';
  const rounded = Math.round(n * 10) / 10;
  return String(rounded).replace('.', ',');
}

export function parseTimesheetHours(raw: string): string | null {
  const normalized = raw.trim().replace(',', '.').replace(/\s/g, '');
  if (!normalized) return null;
  if (!/^\d{1,2}(\.\d)?$/.test(normalized)) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0 || n > 24) return null;
  return (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');
}

export function cellDisplay(value: HrTimesheetCellValue, weekendPrefill: boolean): string {
  if (value.kind === HR_TIMESHEET_WORK_KIND) {
    return formatTimesheetHours(value.hours);
  }
  if (value.kind) return value.kind;
  if (weekendPrefill) return 'В';
  return '';
}

export type TimesheetKeyResult =
  | { type: 'hours'; hours: string }
  | { type: 'kind'; kind: HrTimesheetKindCode }
  | { type: 'buffer'; buffer: string }
  | { type: 'clear' }
  | { type: 'ignore' };

/** Обробка літери/цифри для Excel-подібної клітинки. buffer тримає префікс дволітерного коду. */
export function applyTimesheetKey(key: string, buffer: string): TimesheetKeyResult {
  if (key === 'Backspace' || key === 'Delete') {
    return { type: 'clear' };
  }
  if (key.length !== 1) {
    return { type: 'ignore' };
  }

  if (/[0-9]/.test(key)) {
    return { type: 'hours', hours: key };
  }
  if (key === ',' || key === '.') {
    return { type: 'hours', hours: '0,' };
  }

  const letter = key.toLowerCase();
  const combined = `${buffer}${letter}`;
  const two = TWO_LETTER[combined];
  if (two) {
    return { type: 'kind', kind: two };
  }
  if (ONE_LETTER[letter] && !buffer) {
    if (letter === 'т' || letter === 'п' || letter === 'с') {
      return { type: 'buffer', buffer: letter };
    }
    return { type: 'kind', kind: ONE_LETTER[letter] };
  }
  if (buffer && TWO_LETTER[`${buffer}${letter}`]) {
    return { type: 'kind', kind: TWO_LETTER[`${buffer}${letter}`] };
  }
  if (letter === 'т' || letter === 'п' || letter === 'с') {
    return { type: 'buffer', buffer: letter };
  }
  if (ONE_LETTER[letter]) {
    return { type: 'kind', kind: ONE_LETTER[letter] };
  }
  return { type: 'ignore' };
}

export function emptyCell(): HrTimesheetCellValue {
  return { kind: null, hours: null };
}

export function workCell(hours: string): HrTimesheetCellValue {
  return { kind: HR_TIMESHEET_WORK_KIND, hours };
}

export function codeCell(kind: HrTimesheetKindCode): HrTimesheetCellValue {
  return { kind, hours: null };
}

export function cellsEqual(a: HrTimesheetCellValue, b: HrTimesheetCellValue): boolean {
  return a.kind === b.kind && (a.hours ?? null) === (b.hours ?? null);
}
