import { Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { InventoryStatus } from '../WarehouseInventoryTypes';

// ---------------------------------------------------------------------------
// InventorySessionMeta — права частина рядка табів (статус, дата, хто проводить)
// ---------------------------------------------------------------------------

interface InventorySessionMetaProps {
  sessionStatus: InventoryStatus | null;
  userName: string | undefined;
  sessionDate?: string | null; // ISO-рядок дати активної/завершеної сесії
}

export const InventorySessionMeta = ({ sessionStatus, userName, sessionDate }: InventorySessionMetaProps) => {
  const displayDate = sessionDate
    ? new Date(sessionDate).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : new Date().toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
  <div className="flex items-center gap-3 text-sm text-gray-500 shrink-0 bg-neutral-50 px-4 py-2 h-12 rounded-lg">
    {/* Статус */}
    <div className="flex items-center gap-1.5">
      <span>Статус:</span>
      {sessionStatus === null && (
        <Chip size="sm" color="default" variant="flat" startContent={<DynamicIcon name="file" className="w-3 h-3 ml-1" />}>
          Чернетка
        </Chip>
      )}
      {sessionStatus === 'in_progress' && (
        <Chip size="sm" color="warning" variant="flat" startContent={<DynamicIcon name="loader-2" className="w-3 h-3 ml-1 animate-spin" />}>
          В процесі
        </Chip>
      )}
      {sessionStatus === 'completed' && (
        <Chip size="sm" color="success" variant="flat" startContent={<DynamicIcon name="circle-check" className="w-3 h-3 ml-1" />}>
          Завершена
        </Chip>
      )}
    </div>

    <span className="text-gray-300">|</span>

    {/* Дата */}
    <span className="flex items-center gap-1.5 text-gray-500">
      <DynamicIcon name="calendar" className="w-3.5 h-3.5 text-gray-400" />
      {displayDate}
    </span>

    <span className="text-gray-300">|</span>

    {/* Хто проводить */}
    <span className="flex items-center gap-1.5 text-gray-500">
      <DynamicIcon name="user" className="w-3.5 h-3.5 text-gray-400" />
      {userName ?? '—'}
    </span>
  </div>
  );
};
