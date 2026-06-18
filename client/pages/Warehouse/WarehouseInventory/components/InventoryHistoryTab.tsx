import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import HistoryTable from './InventoryHistoryTable';
import type { InventorySession } from '../WarehouseInventoryTypes';

// ---------------------------------------------------------------------------
// InventoryHistoryTab — вміст вкладки "Історія"
// ---------------------------------------------------------------------------

interface InventoryHistoryTabProps {
  sessions: InventorySession[];
  loading: boolean;
  onRefresh: () => void;
  onLoadSession?: (session: InventorySession) => Promise<void>;
  onDeleteSession?: (sessionId: string) => Promise<void>;
  onRefreshSessionBalances?: (sessionId: string) => Promise<{ items?: Array<any> } | null>;
}

export const InventoryHistoryTab = ({ sessions, loading, onRefresh, onLoadSession, onDeleteSession, onRefreshSessionBalances }: InventoryHistoryTabProps) => (
  <>
    <div className="flex items-end justify-between">
      <h2 className="text-base font-semibold text-gray-800">Минулі інвентаризації {sessions.length > 0 && ` (${sessions.length})`}</h2>
      <Button
        size="sm"
        variant="flat"
        color="secondary"
        className="bg-blue-200 text-blue-900 hover:opacity-90"
        onPress={onRefresh}
        startContent={<DynamicIcon name="refresh-cw" className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
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
      <HistoryTable sessions={sessions} onLoadSession={onLoadSession} onDeleteSession={onDeleteSession} onRefreshSessionBalances={onRefreshSessionBalances} onRefresh={onRefresh} />
    )}
  </>
);
