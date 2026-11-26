import type { ReactNode } from 'react';
import { Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { AuthSessionDto, SessionDeviceType } from '@shared/types/authSessions';
import { DEVICE_ICONS, formatFullDate, formatShortDate, locationLabel } from './sessionUtils';

/** Тултіп має бути поверх Drawer */
function Hint({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <Tooltip content={content} classNames={{ base: 'z-[2000]' }}>
      {children}
    </Tooltip>
  );
}

export function DeviceCell({ deviceType, label, badge, note }: {
  deviceType: SessionDeviceType;
  label: string;
  /** В одному рядку з назвою */
  badge?: ReactNode;
  /** Вторинний рядок під назвою */
  note?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <DynamicIcon name={DEVICE_ICONS[deviceType]} size={16} className="mt-0.5 shrink-0 text-default-400" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm text-default-900">{label}</span>
          {badge}
        </div>
        {note && <div className="text-xs text-default-500">{note}</div>}
      </div>
    </div>
  );
}

export function LocationCell({ session }: { session: AuthSessionDto }) {
  const label = locationLabel(session);

  return (
    <Hint
      content={(
        <div className="space-y-0.5 text-xs">
          <div>{label}</div>
          <div>IP: {session.lastIp ?? session.ip ?? '–'}</div>
          {session.ip && session.lastIp && session.ip !== session.lastIp && <div>IP при вході: {session.ip}</div>}
        </div>
      )}
    >
      <span className="block cursor-help truncate text-sm text-default-500">{label}</span>
    </Hint>
  );
}

export function DateCell({ value }: { value: string | null }) {
  return (
    <Hint content={formatFullDate(value)}>
      <span className="cursor-help whitespace-nowrap text-sm text-default-500">{formatShortDate(value)}</span>
    </Hint>
  );
}
