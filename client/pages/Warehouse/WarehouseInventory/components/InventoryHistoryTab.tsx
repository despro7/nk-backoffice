import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { HistoryTable } from '../../shared/HistoryTable';
import type { InventorySession } from '../../shared/WarehouseInventoryTypes';

// ---------------------------------------------------------------------------
// InventoryHistoryTab — вміст вкладки "Історія"
// ---------------------------------------------------------------------------

interface InventoryHistoryTabProps {
  sessions: InventorySession[];
  loading: boolean;
  onRefresh: () => void;
}

export const InventoryHistoryTab = ({ sessions, loading, onRefresh }: InventoryHistoryTabProps) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-base font-semibold text-gray-800">Попередні інвентаризації</h2>
      <Button
        size="sm"
        variant="flat"
        color="default"
        onPress={onRefresh}
        isLoading={loading}
        startContent={!loading ? <DynamicIcon name="refresh-cw" className="w-3.5 h-3.5" /> : undefined}
      >
        Оновити
      </Button>
    </div>

    {loading ? (
      <div className="text-center py-8 text-gray-400">
        <DynamicIcon name="loader-2" className="w-6 h-6 mx-auto mb-2 animate-spin opacity-50" />
        <p className="text-sm">Завантаження...</p>
      </div>
    ) : sessions.length === 0 ? (
      <div className="text-center py-8 text-gray-400">
        <DynamicIcon name="clipboard-x" className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Немає завершених інвентаризацій</p>
        <Button size="sm" variant="flat" className="mt-3" onPress={onRefresh}>
          Завантажити
        </Button>
      </div>
    ) : (
      <HistoryTable sessions={sessions} />
    )}
  </div>
);
