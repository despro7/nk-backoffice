import { Button, Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useState, useRef, useEffect } from 'react';
import { formatDate } from '@/lib/formatUtils';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@shared/constants/roles';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import type { ReturnHistoryRecord, ReturnHistoryItem } from './WarehouseReturnsTypes';
import { formatTrackingNumberWithIcon } from '@/lib/formatUtilsJSX';

// ---------------------------------------------------------------------------
// ReturnsHistoryTable — список повернень як акордеон
// ---------------------------------------------------------------------------

interface ReturnsHistoryTableProps {
  records: ReturnHistoryRecord[];
  onLoadRecord?: (record: ReturnHistoryRecord) => Promise<void>;
  onDeleteRecord?: (recordId: string) => Promise<void>;
}

export const ReturnsHistoryTable = ({ records, onLoadRecord, onDeleteRecord }: ReturnsHistoryTableProps) => {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [loadingLoadId, setLoadingLoadId] = useState<string | null>(null);
  const [loadingDeleteId, setLoadingDeleteId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [contentHeights, setContentHeights] = useState<Record<string, number>>({});
  const contentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  if (records.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <DynamicIcon name="clipboard-x" className="w-10 h-10 mx-auto mb-2 opacity-40" />
        <p>Немає завершених повернень</p>
      </div>
    );
  }

  const getReturnReasonLabel = (reason: string, customReason?: string) => {
    if (reason === 'Інше' && customReason) {
      return customReason;
    }
    return reason;
  };

  const handleLoadRecord = async (recordId: string) => {
    if (!onLoadRecord) return;
    setLoadingLoadId(recordId);
    try {
      await onLoadRecord(records.find((r) => r.id === recordId)!);
    } catch (error) {
      console.error('[ReturnsHistoryTable] Error loading record:', error);
    } finally {
      setLoadingLoadId(null);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (!onDeleteRecord) return;
    // Запитуємо підтвердження перед видаленням
    setConfirmDeleteId(recordId);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId || !onDeleteRecord) return;
    
    setLoadingDeleteId(confirmDeleteId);
    try {
      await onDeleteRecord(confirmDeleteId);
    } catch (error) {
      console.error('[ReturnsHistoryTable] Error deleting record:', error);
    } finally {
      setLoadingDeleteId(null);
      setConfirmDeleteId(null);
    }
  };

  const handleCancelDelete = () => {
    setConfirmDeleteId(null);
  };

  useEffect(() => {
    if (expandedRecordId && contentRefs.current[expandedRecordId]) {
      const h = contentRefs.current[expandedRecordId]?.scrollHeight || 0;
      setContentHeights((p) => ({ ...p, [expandedRecordId]: h }));
    }
  }, [expandedRecordId]);

  return (
    <div className="space-y-2">
      {records.map((record) => {
        const items = Array.isArray(record.items) ? record.items : JSON.parse(record.items || '[]') as ReturnHistoryItem[];
        const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
        const isExpanded = expandedRecordId === record.id;

        return (
          <div key={record.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <button
              className="w-full px-4 py-3 flex items-center justify-between bg-neutral-100 transition-colors"
              onClick={() => setExpandedRecordId(isExpanded ? null : record.id)}
            >
              <div className="flex items-center gap-2 flex-1">
                <DynamicIcon
                  name="chevron-right"
                  className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}
                />
                <div className="text-left pr-2">
                  <p className="text-sm font-medium text-gray-700 tabular-nums">
                    Замовлення №{record.orderNumber}
                  </p>
                </div>
                <Chip size="sm" color="default" variant="flat">
                  {getReturnReasonLabel(record.returnReason, record.customReason)}
                </Chip>
              </div>

              <div className="flex items-center gap-4">
                <div className="grid grid-cols-3 w-90 gap-8 ml-2 text-xs text-gray-500">
                  <div className="text-right">
                    <span className="text-medium font-semibold leading-none">
											{record.ttn && formatTrackingNumberWithIcon(record.ttn, {
												showIcon: false,
												compactMode: true,
												boldLastGroup: false,
											})}</span>
                    <p className="leading-none">ТТН</p>
                  </div>
                  <div className="text-right">
                    <span className="text-medium font-semibold leading-none">{items.length}</span>
                    <p className="leading-none">позицій</p>
                  </div>
                  <div className="text-right">
                    <span className="text-medium font-semibold leading-none">{totalQuantity}</span>
                    <p className="leading-none">кількість</p>
                  </div>
                </div>
              </div>
            </button>

            <div
              style={{
                maxHeight: isExpanded ? `${contentHeights[record.id] || 0}px` : '0',
                opacity: isExpanded ? 1 : 0,
                overflow: 'hidden',
                transition: 'all 300ms ease-in-out',
              }}
              className="bg-gray-50 border-t border-gray-200"
            >
              <div
                ref={(el) => { if (el) contentRefs.current[record.id] = el; }}
                className="p-4"
              >
                <div className="mb-6">
                  <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">
                      Деталі повернення #{record.id}
                    </h3>
                    {isAdmin && (
                      <div className="flex items-center gap-2 mb-2" onClick={(e) => e.stopPropagation()}>
                        {onDeleteRecord && (
                          <>
                            <Button
                              size="sm"
                              variant="flat"
                              color="danger"
                              className="bg-red-200 h-auto px-2.5 py-1.5 gap-1.5 opacity-60"
                              isLoading={loadingDeleteId === record.id}
                              isDisabled={!!loadingLoadId}
                              startContent={loadingDeleteId !== record.id ? <DynamicIcon name="trash-2" className="w-3 h-3" /> : undefined}
                              onPress={() => handleDeleteRecord(record.id)}
                            >
                              Видалити
                            </Button>
                            <ConfirmModal
                              isOpen={confirmDeleteId === record.id}
                              title="Видалити запис повернення?"
                              message={`Запис повернення №${record.id} буде видалений безповоротно.`}
                              confirmText="Видалити"
                              cancelText="Скасувати"
                              confirmColor="danger"
                              onConfirm={handleConfirmDelete}
                              onCancel={handleCancelDelete}
                            />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[13px] text-gray-500 flex-wrap">
                    <span>Автор: <b>{record.createdByName || record.createdBy}</b></span>
                    <span className="border-l border-gray-300 pl-3">Дата створення: <b>{formatDate(record.createdAt)}</b></span>
                    <span className="border-l border-gray-300 pl-3">Фірма: <b>{record.firmName || record.firmId || 'Не визначено'}</b></span>
                    {record.returnDate && (
                      <span className="border-l border-gray-300 pl-3">
                        Дата повернення: <b>{new Date(record.returnDate).toLocaleDateString('uk-UA')}</b>
                      </span>
                    )}
                    {record.comment && <span className="border-l border-gray-300 pl-3">Коментар: {record.comment}</span>}
                  </div>
                </div>

                {/* Items table */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 bg-gray-50 justify-between px-3 py-2 rounded-t-md border-1 border-b-0 border-gray-200">
                    <h4 className="text-md font-medium text-gray-700">Товари для повернення</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm bg-white border-1 border-gray-200">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-100">
                          <th className="text-left py-2 px-3 font-semibold text-gray-600">SKU</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-600">Позиція</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-600">Партія</th>
                          <th className="text-center py-2 px-3 font-semibold text-gray-600">Кількість</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, idx) => (
                          <tr key={idx} className="border-b not-last:border-b-gray-100 hover:bg-white text-gray-700 transition-colors">
                            <td className="py-2 px-3 font-mono">{item.sku}</td>
                            <td className="py-2 px-3">{item.name}</td>
                            <td className="py-2 px-3">{item.batchNumber || '–'}</td>
                            <td className="py-2 px-3 text-center font-semibold">{item.quantity}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-100/60">
                          <td></td>
                          <td></td>
                          <td className="text-right font-semibold py-2 px-3">Всього:</td>
                          <td className="text-center font-semibold py-2">{totalQuantity}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
