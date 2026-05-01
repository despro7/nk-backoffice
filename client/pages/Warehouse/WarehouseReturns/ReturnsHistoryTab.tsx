import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ReturnsHistoryTable } from './ReturnsHistoryTable';
import type { ReturnHistoryRecord } from './WarehouseReturnsTypes';

// ---------------------------------------------------------------------------
// ReturnsHistoryTab — вміст вкладки "Історія"
// ---------------------------------------------------------------------------

interface ReturnsHistoryTabProps {
  records: ReturnHistoryRecord[];
  loading: boolean;
  onRefresh: () => void;
  onLoadRecord?: (record: ReturnHistoryRecord) => Promise<void>;
  onDeleteRecord?: (recordId: string) => Promise<void>;
}

export const ReturnsHistoryTab = ({ records, loading, onRefresh, onLoadRecord, onDeleteRecord }: ReturnsHistoryTabProps) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-base font-semibold text-gray-800">Попередні повернення</h2>
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
    ) : records.length === 0 ? (
      <div className="text-center py-8 text-gray-400">
        <DynamicIcon name="clipboard-x" className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Немає завершених повернень</p>
        <Button size="sm" variant="flat" className="mt-3" onPress={onRefresh}>
          Завантажити
        </Button>
      </div>
    ) : (
      <ReturnsHistoryTable
        records={records}
        onLoadRecord={onLoadRecord}
        onDeleteRecord={onDeleteRecord}
      />
    )}
  </div>
);
