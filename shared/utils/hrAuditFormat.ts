import {
  HR_PAY_GROUP_LABELS,
  HR_TIMESHEET_KIND_LABELS,
  type HrPayGroup,
  type HrTimesheetKind,
} from '../types/hr.js';

export const HR_AUDIT_ACTION_LABELS: Record<string, string> = {
  created: 'Створено',
  updated: 'Оновлено',
  deleted: 'Видалено',
  restored: 'Відновлено',
  merged: 'Обʼєднано',
  deactivated: 'Деактивовано',
  reordered: 'Змінено порядок',
  sync_pull: 'Синхронізація (завантаження)',
  sync_push: 'Синхронізація (відправка)',
  employment_synced: 'Синхронізація зайнятості',
  employee_synced: 'Синхронізація співробітника',
  cell_changed: 'Зміна комірки табеля',
  employment_merged: 'Обʼєднано зайнятості',
  'person.moved_to_employees_group': 'Перенесено до групи «Працівники»',
};

export const HR_AUDIT_ENTITY_LABELS: Record<string, string> = {
  employee: 'Працівник',
  employment: 'Зайнятість',
  legal_entity: 'Роботодавець',
  pay_group: 'Група оплати',
  person: 'Фізособа',
  pay_terms: 'Ставка',
  timesheet_entry: 'Табель',
};

interface TimesheetCellSnapshot {
  kind: string;
  hours: string | null;
}

interface TimesheetCellDiffPayload {
  employmentId?: number;
  date?: string;
  before?: TimesheetCellSnapshot | null;
  after?: TimesheetCellSnapshot | null;
}

interface EmploymentMergeSummary {
  id?: number;
  label?: string;
  legalEntity?: string;
  payGroup?: string;
  period?: string;
  personnelNumber?: string | null;
}

interface EmploymentMergePayload {
  fromId?: number;
  toId?: number;
  removed?: EmploymentMergeSummary;
  kept?: EmploymentMergeSummary;
  transferred?: {
    timesheetEntries?: number;
    payrollLines?: number;
    payTerms?: number;
  };
  deletedDuplicates?: {
    timesheetEntries?: number;
    payrollLines?: number;
    payTerms?: number;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatUkDate(ymd: string): string {
  const [year, month, day] = ymd.split('-');
  if (!year || !month || !day) return ymd;
  return `${day}.${month}.${year}`;
}

export function formatTimesheetCellValue(kind: string, hours: string | null): string {
  if (kind === 'work') {
    if (!hours) return 'години';
    const normalized = hours.replace(/\.00$/, '');
    return `${normalized} год`;
  }
  return HR_TIMESHEET_KIND_LABELS[kind as HrTimesheetKind] ?? kind;
}

export function formatHrAuditAction(action: string): string {
  return HR_AUDIT_ACTION_LABELS[action] ?? action;
}

export function formatHrAuditEntityType(entityType: string): string {
  return HR_AUDIT_ENTITY_LABELS[entityType] ?? entityType;
}

export function formatHrAuditHeader(createdAt: string, userName: string | null): string {
  const timestamp = new Date(createdAt).toLocaleString('uk-UA');
  return `${timestamp} • ${userName || 'Система'}`;
}

/** Хронологічно: старі зверху, нові знизу. */
export function sortHrAuditLogsChronological<T extends { createdAt: string }>(logs: T[]): T[] {
  return [...logs].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export function getHrAuditActionColorClass(action: string): string {
  if (['created', 'restored', 'sync_pull', 'employment_synced', 'employee_synced', 'person.moved_to_employees_group'].includes(action)) {
    return 'text-emerald-600';
  }
  if (['deleted', 'deactivated'].includes(action)) {
    return 'text-rose-600';
  }
  return 'text-sky-600';
}

function formatTimesheetCellDiff(payload: TimesheetCellDiffPayload): string | null {
  const before = payload.before ?? null;
  const after = payload.after ?? null;

  if (!before && after) {
    const value = formatTimesheetCellValue(after.kind, after.hours);
    return `Встановлено «${value}»`;
  }
  if (before && !after) {
    return 'Комірку очищено';
  }
  if (before && after) {
    const from = formatTimesheetCellValue(before.kind, before.hours);
    const to = formatTimesheetCellValue(after.kind, after.hours);
    return `Зміна значення: «${from}» → «${to}»`;
  }
  return null;
}

export type HrAuditMergeDetailKind = 'removed' | 'kept' | 'transferred' | 'duplicates';

export interface HrAuditMergeDetailLine {
  kind: HrAuditMergeDetailKind;
  text: string;
}

function formatCountLine(label: string, count: number): string | null {
  if (!count) return null;
  return `${label}: ${count}`;
}

export function getEmploymentMergeDetailLines(payload: EmploymentMergePayload): HrAuditMergeDetailLine[] {
  const lines: HrAuditMergeDetailLine[] = [];

  if (payload.removed?.label) {
    lines.push({ kind: 'removed', text: payload.removed.label });
  }
  if (payload.kept?.label) {
    lines.push({ kind: 'kept', text: payload.kept.label });
  } else if (payload.fromId != null && payload.toId != null && lines.length === 0) {
    lines.push({ kind: 'removed', text: `Зайнятість #${payload.fromId} → #${payload.toId}` });
  }

  const transferred = payload.transferred;
  if (transferred) {
    const moved = [
      formatCountLine('записів табеля перенесено', transferred.timesheetEntries ?? 0),
      formatCountLine('рядків нарахування перенесено', transferred.payrollLines ?? 0),
      formatCountLine('ставок перенесено', transferred.payTerms ?? 0),
    ].filter((item): item is string => item != null);
    if (moved.length > 0) {
      lines.push({ kind: 'transferred', text: moved.join(', ') });
    }
  }

  const deleted = payload.deletedDuplicates;
  if (deleted) {
    const dropped = [
      formatCountLine('дублікатів табеля видалено', deleted.timesheetEntries ?? 0),
      formatCountLine('дублікатів нарахування видалено', deleted.payrollLines ?? 0),
      formatCountLine('дублікатів ставок видалено', deleted.payTerms ?? 0),
    ].filter((item): item is string => item != null);
    if (dropped.length > 0) {
      lines.push({ kind: 'duplicates', text: dropped.join(', ') });
    }
  }

  return lines;
}

function formatEmploymentMergeDetails(payload: EmploymentMergePayload): string | null {
  const structured = getEmploymentMergeDetailLines(payload);
  if (structured.length === 0) return null;

  const prefix: Record<HrAuditMergeDetailKind, string> = {
    removed: 'Видалено:',
    kept: 'Залишено:',
    transferred: 'Перенесено —',
    duplicates: 'Дублікати —',
  };

  return structured.map((line) => `${prefix[line.kind]} ${line.text}`).join('\n');
}

function formatGenericPayload(payload: Record<string, unknown>): string | null {
  if (typeof payload.label === 'string' && payload.label.trim()) {
    return payload.label;
  }
  if (typeof payload.name === 'string' && payload.name.trim()) {
    return payload.name;
  }
  if (typeof payload.displayName === 'string' && payload.displayName.trim()) {
    return payload.displayName;
  }
  if (typeof payload.fromId === 'number' && typeof payload.toId === 'number') {
    return `#${payload.fromId} → #${payload.toId}`;
  }
  return null;
}

export function formatHrAuditDetails(action: string, payload: unknown): string | null {
  if (!isRecord(payload)) return null;

  if (action === 'cell_changed') {
    return formatTimesheetCellDiff(payload as TimesheetCellDiffPayload);
  }
  if (action === 'employment_merged') {
    return formatEmploymentMergeDetails(payload as EmploymentMergePayload);
  }
  if (action === 'merged' && typeof payload.sourceId === 'number' && typeof payload.targetId === 'number') {
    const sourceLabel = typeof payload.sourceDisplayName === 'string' && payload.sourceDisplayName.trim()
      ? payload.sourceDisplayName.trim()
      : `#${payload.sourceId}`;
    return `«${sourceLabel}» обʼєднано з #${payload.targetId}`;
  }
  if (action === 'reordered' && Array.isArray(payload.ids)) {
    return `Новий порядок: ${payload.ids.join(' → ')}`;
  }
  if (action === 'updated' && isRecord(payload.before) && isRecord(payload.after)) {
    const keys = Object.keys(payload.after).filter((key) => payload.before?.[key] !== payload.after[key]);
    if (keys.length > 0) {
      return `Змінені поля: ${keys.join(', ')}`;
    }
  }

  return formatGenericPayload(payload);
}

export function buildEmploymentAuditLabel(input: {
  legalEntityName: string;
  payGroupSlug: HrPayGroup;
  validFrom: string;
  validTo: string | null;
  personnelNumber?: string | null;
}): string {
  const period = `${formatUkDate(input.validFrom)} – ${input.validTo ? formatUkDate(input.validTo) : 'досі'}`;
  const parts = [
    input.legalEntityName,
    HR_PAY_GROUP_LABELS[input.payGroupSlug],
    period,
  ];
  if (input.personnelNumber) {
    parts.push(`таб. № ${input.personnelNumber}`);
  }
  return parts.join(' · ');
}
