import { Button, Card } from '@heroui/react';
import HistoryAccordionItem from '../../shared/HistoryAccordionItem';
import { DynamicIcon } from 'lucide-react/dynamic';

interface Props { records: any[]; loading?: boolean; onRefresh?: () => void; onDelete?: (id: number) => void }

export default function ReleaseHistoryTab({ records = [], loading, onRefresh, onDelete }: Props) {
  // Map release records to the shape expected by WriteOffHistoryTable.
  const mapped = records.map((r: any) => {
    const items = Array.isArray(r.items) && r.items.length > 0
      ? r.items
      : [{ sku: r.setSku || '', quantity: Number(r.quantity ?? r.qty ?? 0) }];

    return {
      id: String(r.id),
      createdAt: r.createdAt || r.created_at || r.created_at,
      createdBy: r.createdBy || r.created_by,
      firmId: r.firmId || r.firm_id,
      storageId: r.storageId || r.payload?.storage,
      comment: r.comment,
      items,
    };
  });

  const handleDeleteRecord = async (id: string) => {
    // `WriteOffHistoryTable` expects `onDeleteRecord(recordId)` with string id
    if (!onDelete) return;
    // try to coerce back to number if original handler expects number
    const numeric = Number(id);
    await onDelete(isNaN(numeric) ? id as any : numeric);
  };

  return (
    <>
      <div className="flex items-end justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800">Минулі випуски</h2>
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
        <div className="text-center py-8 text-gray-400">Завантаження...</div>
      ) : mapped.length === 0 ? (
        <div className="text-sm text-gray-500">Немає записів</div>
      ) : (
        <HistoryAccordionItem
          records={mapped}
          recordType="releaseSet"
          onDeleteRecord={handleDeleteRecord}
        />
      )}
    </>
  );
}
