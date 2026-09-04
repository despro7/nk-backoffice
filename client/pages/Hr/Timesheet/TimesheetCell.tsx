import { memo } from 'react';
import {
  cellDisplay,
  type HrTimesheetCellValue,
} from '@shared/utils/hrTimesheetCell';
import type { HrTimesheetKind } from '@shared/types/hr';

interface TimesheetCellProps {
  value: HrTimesheetCellValue;
  isWeekend: boolean;
  isDirty: boolean;
  isActive: boolean;
  isHoursEditing: boolean;
  hoursDraft: string;
  readOnly: boolean;
  ariaLabel: string;
  colorClass: string;
  onContextMenu?: (event: React.MouseEvent) => void;
}

function effectiveKind(
  value: HrTimesheetCellValue,
  isWeekend: boolean,
): HrTimesheetKind | 'prefill' | null {
  if (value.kind) return value.kind;
  if (isWeekend) return 'prefill';
  return null;
}

export const TimesheetCell = memo(function TimesheetCell({
  value,
  isWeekend,
  isDirty,
  isActive,
  isHoursEditing,
  hoursDraft,
  readOnly,
  ariaLabel,
  colorClass,
  onContextMenu,
}: TimesheetCellProps) {
  const kind = effectiveKind(value, isWeekend);
  const label = cellDisplay(value, isWeekend && !value.kind);

  return (
    <div
      role="gridcell"
      aria-label={ariaLabel}
      aria-readonly={readOnly || undefined}
      onContextMenu={onContextMenu}
      className={[
        'relative flex h-8 min-w-8 items-center justify-center text-xs font-medium outline-none select-none bg-transparent rounded-sm z-[1]',
        colorClass,
        isActive ? 'border-2 border-blue-500!' : '',
        isDirty ? `border-2 ${colorClass}` : '',
        readOnly ? 'cursor-default' : 'cursor-cell',
      ].join(' ')}
    >
      {isHoursEditing ? (
        <span className="font-semibold text-sky-800 underline decoration-dotted underline-offset-2">
          {hoursDraft || '…'}
        </span>
      ) : (
        <span className={kind === 'prefill' ? 'opacity-50' : undefined}>{label}</span>
      )}
    </div>
  );
});
