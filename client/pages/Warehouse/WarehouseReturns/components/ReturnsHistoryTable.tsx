import { Button, Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useState, useRef, useEffect } from 'react';
import { formatDate, truncateText } from '@/lib/formatUtils';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@shared/constants/roles';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { formatTrackingNumberWithIcon, pluralize } from '@/lib';
import { HistoryItemsTable } from '../../shared/HistoryItemsTable';
import type { ReturnHistoryRecord, ReturnHistoryItem } from '../WarehouseReturnsTypes';
import useUserNames from '@/hooks/useUserNames';

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

  const userIds = records.map(r => Number(r.createdBy ?? null));
  const namesMap = useUserNames(userIds);

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

  // const handleLoadRecord = async (recordId: string) => {
  //   if (!onLoadRecord) return;
  //   setLoadingLoadId(recordId);
  //   try {
  //     await onLoadRecord(records.find((r) => r.id === recordId)!);
  //   } catch (error) {
  //     console.error('[ReturnsHistoryTable] Error loading record:', error);
  //   } finally {
  //     setLoadingLoadId(null);
  //   }
  // };

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
                <div className="flex flex-col items-start">
                  <p className="font-medium text-gray-700 tabular-nums text-left pr-2 whitespace-nowrap">
                    Замовлення №{record.orderNumber}
                  </p>
                  <span className="flex gap-0.5 items-center text-xs text-gray-400" title="Дата оприбутковання"><DynamicIcon name="undo-2" className="w-3 h-3 mb-0.5" /> {record.returnDate ? formatDate(record.returnDate) : formatDate(record.createdAt)}</span>
                </div>
                <div className="flex gap-2">
                  <Chip size="sm" color="default" variant="flat" className="bg-gray-200 text-gray-700 max-w-sm min-w-0 *:[span]:truncate">{getReturnReasonLabel(record.returnReason, record.customReason)}</Chip>
                  {record.comment && (
                    <Chip size="sm" color="warning" variant="flat" className="text-sm text-amber-700 ml-0.5 text-[13px]" startContent={<DynamicIcon name="message-circle-more" className="w-3 h-3 ml-1 mr-0.5" />}>{truncateText(record.comment, 25)}</Chip>
                  )}
                </div>
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
                    <p className="leading-none">{pluralize(items.length, 'позиція', 'позиції', 'позицій')}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-medium font-semibold leading-none">{totalQuantity}</span>
                    <p className="leading-none">{pluralize(totalQuantity, 'порція', 'порції', 'порцій')}</p>
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
                    <span>Автор: <b>{record.createdByName ?? namesMap[Number(record.createdBy ?? -1)] ?? record.createdBy ?? '—'}</b></span>
                    <span className="border-l border-gray-300 pl-3">Фірма оприбуткування: <b>{record.firmName || record.firmId || 'Не визначено'}</b>{record.shipFirmName || record.shipFirmId ? <span className="ml-2">(відвантаження: <b>{record.shipFirmName || record.shipFirmId}</b>)</span> : null}</span>
                    <span className="border-l border-gray-300 pl-3">Дата створення: <b>{formatDate(record.createdAt)}</b></span>
                    {formatDate(record.createdAt) !== formatDate(record.returnDate) && record.returnDate && (
                      <span className="bg-amber-100 text-gray-700 px-1.5 py-0.5 rounded">Дата оприбуткування: <span className="font-semibold">{record.returnDate ? formatDate(record.returnDate) : '—'}</span></span>
                    )}
                  </div>
                  {record.comment && <p className="text-[13px] text-gray-500 mt-1">Коментар: <b>{record.comment}</b></p>}
                </div>

                {/* Items table */}
                <HistoryItemsTable title="Товари на повернення" mode="normal" items={record.itemsNormalized ?? items} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
