import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import HistoryAccordionItem from '../../shared/HistoryAccordionItem';
import type { ReturnHistoryRecord } from '../../WarehouseReturns/WarehouseReturnsTypes';

// ---------------------------------------------------------------------------
// WriteOffHistoryTab — вміст вкладки "Історія списань"
// ---------------------------------------------------------------------------

interface WriteOffHistoryTabProps {
  records: ReturnHistoryRecord[];
  loading: boolean;
  onRefresh: () => void;
  onLoadRecord?: (record: ReturnHistoryRecord) => Promise<void>;
  onDeleteRecord?: (recordId: string) => Promise<void>;
}

export const WriteOffHistoryTab = ({ records, loading, onRefresh, onLoadRecord, onDeleteRecord }: WriteOffHistoryTabProps) => (
  <>
    <div className="flex items-end justify-between mb-4">
      <h2 className="text-base font-semibold text-gray-800">Минулі списання {records.length > 0 && ` (${records.length})`}</h2>
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
    ) : records.length === 0 ? (
      <div className="text-center py-8 text-gray-400">
        <DynamicIcon name="clipboard-x" className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Немає завершених списань</p>
        <Button size="sm" variant="flat" className="mt-3" onPress={onRefresh}>
          Завантажити
        </Button>
      </div>
    ) : (
      <HistoryAccordionItem
        records={records}
        recordType="writeOff"
        onLoadRecord={onLoadRecord}
        onDeleteRecord={onDeleteRecord}
      />
    )}
  </>
);
