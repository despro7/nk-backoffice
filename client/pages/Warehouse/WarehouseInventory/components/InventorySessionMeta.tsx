import { Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { InventoryStatus } from '../WarehouseInventoryTypes';
import { DateTimePicker } from '@/components/DateTimePicker';

// ---------------------------------------------------------------------------
// InventorySessionMeta — права частина рядка табів (статус, дата, хто проводить)
// ---------------------------------------------------------------------------

interface InventorySessionMetaProps {
  sessionStatus: InventoryStatus | null;
  sessionDate?: string | null; // ISO-рядок дати активної/завершеної сесії
  onSessionDateChange?: (date: Date) => void; // колбек зміни дати (лише для активних сесій)
  isEditable?: boolean; // якщо адмін редагує завершену сесію — показати пікер дати
}

export const InventorySessionMeta = ({ sessionStatus, sessionDate, onSessionDateChange, isEditable = false }: InventorySessionMetaProps) => {
  const sessionDateObj = sessionDate ? new Date(sessionDate) : new Date();
  const displayDate = sessionDateObj.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
  <div className="flex items-center gap-4 text-sm text-gray-500">
    {/* Дата: редагований пікер для активної сесії, або просто текст */}
    {onSessionDateChange && (sessionStatus !== 'completed' || isEditable) && (
      <DateTimePicker
        value={sessionDateObj}
        onChange={onSessionDateChange}
        label="Дата інвентаризації"
      />
    )}

    {/* Статус */}
    <div className="flex items-center gap-1.5 shrink-0 bg-neutral-50 px-4 py-2 h-12 rounded-lg">
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
  </div>
  );
};