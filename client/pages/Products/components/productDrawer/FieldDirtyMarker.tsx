import { Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface FieldDirtyMarkerProps {
  show?: boolean;
}

/** Іконка незбережених змін біля лейбла поля. */
export function FieldDirtyMarker({ show }: FieldDirtyMarkerProps) {
  if (!show) return null;
  return (
    <Tooltip
      content="Незбережені зміни"
      color="warning"
      delay={200}
      showArrow={true}
      classNames={{
        base: 'before:bg-yellow-400 before:z-[10] before:rounded-[2px]',
        content: 'bg-yellow-400 text-yellow-950 text-xs font-medium rounded-sm border-0',
      }}
    >
      <span className="inline-flex shrink-0" aria-label="Незбережені зміни">
        <DynamicIcon name="save" size={13} className="text-yellow-400" />
      </span>
    </Tooltip>
  );
}
