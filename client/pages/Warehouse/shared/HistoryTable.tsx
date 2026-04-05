import { Button, Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatDate } from '@/lib/formatUtils';
import type { InventorySession } from './WarehouseInventoryTypes';
import { statusLabel, statusColor } from './WarehouseInventoryUtils';

// ---------------------------------------------------------------------------
// HistoryTable — таблиця завершених інвентаризацій
// ---------------------------------------------------------------------------

interface HistoryTableProps {
  sessions: InventorySession[];
}

export const HistoryTable = ({ sessions }: HistoryTableProps) => {
  if (sessions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <DynamicIcon name="clipboard-list" className="w-10 h-10 mx-auto mb-2 opacity-40" />
        <p>Немає завершених інвентаризацій</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left py-3 px-4 font-semibold text-gray-600">Дата</th>
            <th className="text-left py-3 px-4 font-semibold text-gray-600">Статус</th>
            <th className="text-left py-3 px-4 font-semibold text-gray-600">Коментар</th>
            <th className="text-right py-3 px-4 font-semibold text-gray-600">Дії</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
              <td className="py-3 px-4 text-gray-700">{formatDate(s.createdAt)}</td>
              <td className="py-3 px-4">
                <Chip size="sm" color={statusColor[s.status]} variant="flat">
                  {statusLabel[s.status]}
                </Chip>
              </td>
              <td className="py-3 px-4 text-gray-500 italic">{s.comment || '—'}</td>
              <td className="py-3 px-4 text-right">
                <Button size="sm" variant="light" isIconOnly aria-label="Переглянути">
                  <DynamicIcon name="eye" className="w-4 h-4 text-blue-500" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
