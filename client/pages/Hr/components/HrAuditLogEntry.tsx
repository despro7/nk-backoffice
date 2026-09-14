import { useMemo } from 'react';
import {
  formatHrAuditAction,
  formatHrAuditDetails,
  formatHrAuditEntityType,
  formatHrAuditHeader,
  getEmploymentMergeDetailLines,
  getHrAuditActionColorClass,
  sortHrAuditLogsChronological,
  type HrAuditMergeDetailKind,
} from '@shared/utils/hrAuditFormat';
import type { HrAuditLogDto } from '@shared/types/hr';

export type HrAuditLogEntryVariant = 'default' | 'timesheet';

interface HrAuditLogEntryProps {
  item: HrAuditLogDto;
  variant?: HrAuditLogEntryVariant;
}

const MERGE_DETAIL_LABEL: Record<HrAuditMergeDetailKind, { text: string; className: string }> = {
  removed: { text: 'Видалено:', className: 'text-rose-600 bg-rose-600/10 px-1 py-0 rounded font-medium' },
  kept: { text: 'Залишено:', className: 'text-emerald-600 bg-emerald-600/10 px-1 py-0 rounded font-medium' },
  transferred: { text: 'Перенесено:', className: 'bg-gray-600/5 px-1 py-0 rounded font-medium' },
  duplicates: { text: 'Дублікати:', className: 'bg-gray-600/5 px-1 py-0 rounded font-medium' },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function HrAuditDetails({ action, payload }: { action: string; payload: unknown }) {
  if (action === 'employment_merged' && isRecord(payload)) {
    const lines = getEmploymentMergeDetailLines(payload);
    if (lines.length === 0) return null;

    return (
      <div className="mt-0.5 space-y-0.5 text-xs">
        {lines.map((line, index) => {
          const label = MERGE_DETAIL_LABEL[line.kind];
          return (
            <div key={`${line.kind}-${index}`}>
              <span className={label.className}>{label.text}</span>
              <span> {line.text}</span>
            </div>
          );
        })}
      </div>
    );
  }

  const details = formatHrAuditDetails(action, payload);
  if (!details) return null;

  return <div className="mt-0.5 text-xs whitespace-pre-line">{details}</div>;
}

interface HrAuditLogListProps {
  logs: HrAuditLogDto[];
  variant?: HrAuditLogEntryVariant;
}

export function HrAuditLogList({ logs, variant = 'default' }: HrAuditLogListProps) {
  const sorted = useMemo(() => sortHrAuditLogsChronological(logs), [logs]);

  return (
    <>
      {sorted.map((item) => (
        <HrAuditLogEntry key={item.id} item={item} variant={variant} />
      ))}
    </>
  );
}

export function HrAuditLogEntry({ item, variant = 'default' }: HrAuditLogEntryProps) {
  const actionLabel = formatHrAuditAction(item.action);
  const entityLabel = formatHrAuditEntityType(item.entityType);
  const header = formatHrAuditHeader(item.createdAt, item.userName);
  const actionColor = getHrAuditActionColorClass(item.action);
  const details = formatHrAuditDetails(item.action, item.payload);
  const isTimesheetCell = variant === 'timesheet' && item.action === 'cell_changed';

  if (variant === 'timesheet') {
    return (
      <div className="py-1.5 first:pt-0 last:pb-0">
        <div className="text-[11px] text-secondary">{header}</div>
        <div className="mt-0.5 text-xs text-gray-600">
          {isTimesheetCell ? details : (
            <>
              <span className={`font-medium ${actionColor}`}>{actionLabel}</span>
              {details ? <span className="text-text-secondary"> — {details}</span> : null}
            </>
          )}
        </div>
      </div>
    );
  }

  const showEntityPrefix = item.entityType !== 'employee' && item.entityType !== 'timesheet_entry';

  return (
    <div className="py-2 first:pt-0 last:pb-0">
      <div className="text-xs text-secondary">{header}</div>
      <div className="mt-0.5 mb-1 text-sm text-primary font-semibold">
        {showEntityPrefix ? `${entityLabel}: ` : ''}
        {actionLabel}
      </div>
      <HrAuditDetails action={item.action} payload={item.payload} />
    </div>
  );
}
