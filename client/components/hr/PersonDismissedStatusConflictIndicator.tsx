import { Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { HrPersonDto } from '@shared/types/hr';
import { personHasDismissedLinkedEmployeeConflict } from '@shared/utils/hrPersonEmploymentStatus';

const STATUS_CONFLICT_TOOLTIP =
  'Конфлікт статусів: контакт у папці звільнених, але в HR ще привʼязаний співробітник';

interface PersonDismissedStatusConflictIndicatorProps {
  person: Pick<HrPersonDto, 'linkedEmployee' | 'dilovodParentId' | 'personGroupLabel'>;
}

export function PersonDismissedStatusConflictIndicator({ person }: PersonDismissedStatusConflictIndicatorProps) {
  if (!personHasDismissedLinkedEmployeeConflict(person)) return null;

  return (
    <Tooltip
      content={STATUS_CONFLICT_TOOLTIP}
      placement="top"
      showArrow
      classNames={{
        base: 'before:bg-danger-600 before:rounded-[2px]',
        content: 'bg-danger-600 border-0 text-white text-xs max-w-xs',
      }}
    >
      <span className="inline-flex shrink-0 text-danger-500">
        <DynamicIcon name="triangle-alert" size={14} />
      </span>
    </Tooltip>
  );
}
