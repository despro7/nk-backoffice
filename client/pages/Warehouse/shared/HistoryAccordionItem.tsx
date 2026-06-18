import { useEffect, useRef, useState } from 'react';
import { Button, Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@shared/constants/roles';
import { formatDate, formatRelativeDate, truncateText, pluralize } from '@/lib';
import { HistoryItemsTable } from './HistoryItemsTable';
import { normalizeSetsArray } from './historyNormalize';
import { getFirmDisplayName, getStorageDisplayName } from '@shared/utils/directoryUtils';
import { useDilovodSettings } from '@/hooks/useDilovodSettings';
import useUserNames from '@/hooks/useUserNames';

interface HistoryAccordionItemProps {
  records: any[];
  emptyMessage?: string;
  showDelete?: boolean;
  showEdit?: boolean;
  isAdmin?: boolean;
  onRefresh?: () => void;
  onLoadRecord?: (record: any) => Promise<void>;
  onDeleteRecord?: (recordId: string) => Promise<void>;
  onEditRecord?: (record: any) => Promise<void>;
  recordType?: 'return' | 'writeOff' | 'releaseSet';
}

export const HistoryAccordionItem = ({
  records,
  emptyMessage = 'Немає записів',
  showDelete = true,
  showEdit = false,
  onDeleteRecord,
  onEditRecord,
  recordType,
}: HistoryAccordionItemProps) => {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [loadingLoadId, setLoadingLoadId] = useState<string | null>(null);
  const [loadingDeleteId, setLoadingDeleteId] = useState<string | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [contentHeights, setContentHeights] = useState<Record<string, number>>({});
  const contentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Utility to safely parse items (may be string, double-encoded, or array)
  const safeParseItems = (raw: any) => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    let v = raw;
    try {
      while (typeof v === 'string') v = JSON.parse(v);
    } catch (e) {
      return [];
    }
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return [v];
    return [];
  };

  

  useEffect(() => {
    if (expandedRecordId && contentRefs.current[expandedRecordId]) {
      const h = contentRefs.current[expandedRecordId]?.scrollHeight || 0;
      setContentHeights((p) => ({ ...p, [expandedRecordId]: h }));
    }
  }, [expandedRecordId]);

  const handleEditRecord = async (recordId: string) => {
    if (!onEditRecord) return;
    setLoadingEditId(recordId);
    try {
      await onEditRecord(records.find((r) => String(r.id) === String(recordId))!);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[HistoryAccordionItem] Error editing record:', error);
    } finally {
      setLoadingEditId(null);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (!onDeleteRecord) return;
    setConfirmDeleteId(recordId);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId || !onDeleteRecord) return;
    setLoadingDeleteId(confirmDeleteId);
    try {
      await onDeleteRecord(confirmDeleteId);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[HistoryAccordionItem] Error deleting record:', error);
    } finally {
      setLoadingDeleteId(null);
      setConfirmDeleteId(null);
    }
  };

  const handleCancelDelete = () => setConfirmDeleteId(null);

  if (!records || records.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">{emptyMessage}</div>
    );
  }

	// константа мапи типів
	const RECORD_TYPE_CONFIG: Record<string, { label: string; genitive?: string; dateField?: string; storageOperation?: string }> = {
		writeOff: 	{ label: 'Списання', dateField: 'writeOffDate' },
		releaseSet: { label: 'Випуск', genitive: 'випуску' },
	};

	// утиліта для отримання конфігурації по типу запису, з дефолтами
	function getRecordTypeConfig(type?: string) {
		if (!type) return { label: 'Запис', genitive: 'операції', dateField: 'createdAt' };
		return RECORD_TYPE_CONFIG[type] || { label: type, genitive: type, dateField: 'createdAt' };
	}

  const { directories } = useDilovodSettings();
  const userIds = records.map(r => Number(r.createdBy ?? r.created_by ?? null));
  const namesMap = useUserNames(userIds);

  return (
    <div className="space-y-2">
      {records.map((record) => {
				const cfg = getRecordTypeConfig(recordType); // recordType передається в компонент, напр. 'writeOff'
				const recordName = `${cfg.label} №${record.id}`;
        const items = safeParseItems(record.items);
        const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity ?? item.qty ?? 0), 0);
        const isExpanded = expandedRecordId === String(record.id);
				const reason = record.reason || record.writeOffReason || record.write_off_reason; // TODO: змінити типи після впровадження компоненту
        
        const setsForCount = recordType === 'releaseSet' ? (record.setsNormalized ?? normalizeSetsArray(record.items ?? items)) : [];
        const uniqueSetTypes = recordType === 'releaseSet' ? setsForCount.length : 0;
        const totalSets = recordType === 'releaseSet' ? setsForCount.reduce((sum: number, set: any) => sum + (Number(set.setQty ?? 0)), 0) : 0;
        const totalPortions = recordType === 'releaseSet' ? setsForCount.reduce((sum: number, set: any) => {
          const componentsTotal = Number(set.componentsTotal ?? 0);
          const setQty = Number(set.setQty ?? 0);
          const mode = String(set.componentsQuantityMode ?? '').toLowerCase();

          if (mode === 'total') {
            return sum + componentsTotal;
          }

          return sum + (componentsTotal * setQty);
        }, 0) : 0;

        return (
          <div key={record.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <button
              className="w-full px-4 py-3 flex items-center justify-between bg-neutral-100 transition-colors"
              onClick={() => setExpandedRecordId(isExpanded ? null : String(record.id))}
            >
              <div className="flex items-center gap-2 flex-1 text-left">
                <DynamicIcon
                  name="chevron-right"
                  className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}
                />
								<div className="flex items-center gap-4">
									<div className="flex flex-col">
										<span className="text-sm font-medium text-gray-700 tabular-nums">{recordName}</span>
										<span className="text-xs text-gray-400">{formatRelativeDate(record[cfg.dateField || 'createdAt'], { maxRelativeDays: 1 })}</span>
									</div>
									<div className="flex gap-2">
										{reason && (
											<Chip size="sm" color="default" variant="flat" className="bg-gray-200 text-gray-700">{reason}</Chip>
										)}
										{record.comment && (
											<Chip size="sm" color="warning" variant="flat" className="text-sm text-amber-700 ml-0.5 text-[13px]" startContent={<DynamicIcon name="message-circle-more" className="w-3 h-3 ml-1 mr-0.5" />}>{truncateText(record.comment, 25)}</Chip>
										)}
									</div>
								</div>
              </div>

              <div className="flex items-center gap-12 ml-20 text-xs text-gray-500">
                {recordType === 'releaseSet' ? (
                  <>
                    <div className="text-right">
                      <span className="text-medium font-semibold leading-none">{totalSets}</span>
                      <p className="leading-none">{pluralize(totalSets, 'набір', 'набори', 'наборів')}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-medium font-semibold leading-none">{totalPortions}</span>
                      <p className="leading-none">{pluralize(totalPortions, 'порція', 'порції', 'порцій')}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-right">
                      <span className="text-medium font-semibold leading-none">{items.length}</span>
                      <p className="leading-none">{pluralize(items.length, 'позиція', 'позиції', 'позицій')}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-medium font-semibold leading-none">{totalQuantity}</span>
                      <p className="leading-none">{pluralize(totalQuantity, 'порція', 'порції', 'порцій')}</p>
                    </div>
                  </>
                )}
              </div>
            </button>

            <div
              style={{
                maxHeight: isExpanded ? `${contentHeights[String(record.id)] || 0}px` : '0',
                opacity: isExpanded ? 1 : 0,
                overflow: 'hidden',
                transition: 'all 300ms ease-in-out',
              }}
              className="bg-gray-50 border-t border-gray-200"
            >
              <div ref={(el) => { if (el) contentRefs.current[String(record.id)] = el; }} className="p-4">
                <div className="mb-6">
                  <div className="flex items-center gap-4 mb-2">
                    <h3 className="text-lg font-semibold text-gray-700">Деталі операції</h3>
										{/* Delete button (only visible to admin) */}
										{isAdmin && showDelete && onDeleteRecord && (
											<div className="ml-2" onClick={(e) => e.stopPropagation()}>
												<Button
													size="sm"
													variant="flat"
													color="danger"
													className="bg-red-200 h-auto px-2.5 py-1.5 gap-1.5 opacity-60"
													isLoading={loadingDeleteId === String(record.id)}
													isDisabled={!!loadingLoadId}
													startContent={loadingDeleteId !== String(record.id) ? <DynamicIcon name="trash-2" className="w-3 h-3" /> : undefined}
													onPress={() => handleDeleteRecord(String(record.id))}
												>
													Видалити
												</Button>
											</div>
										)}
										 {/* Confirm modal rendered here so header button can open it */}
										<ConfirmModal
											isOpen={confirmDeleteId === String(record.id)}
											title="Видалити запис?"
											message={`Запис №${record.id} буде видалений безповоротно.`}
											confirmText="Видалити"
											cancelText="Скасувати"
											confirmColor="danger"
											onConfirm={handleConfirmDelete}
											onCancel={handleCancelDelete}
										/>
                    {/* Edit button (optional) */}
                    {isAdmin && showEdit && onEditRecord && (
                      <div className="ml-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="flat"
                          color="default"
                          className="h-auto px-2.5 py-1.5 gap-1.5"
                          isLoading={loadingEditId === String(record.id)}
                          isDisabled={!!loadingLoadId}
                          startContent={<DynamicIcon name="edit-3" className="w-3 h-3" />}
                          onPress={() => handleEditRecord(String(record.id))}
                        >
                          Редагувати
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-[13px] text-gray-500 flex-wrap">
                    <span>Автор: <b>{namesMap[Number(record.createdBy ?? record.created_by ?? -1)] ?? record.createdBy ?? record.created_by ?? '—'}</b></span>
                    <span className="border-l border-gray-300 pl-3">Фірма: <b>{(getFirmDisplayName(record.firmId, undefined, directories) || 'Не визначено')}</b></span>
                    <span className="border-l border-gray-300 pl-3">Склад: <b>{(getStorageDisplayName(record.storageId || record.payload?.storage, record.storageName, directories) || '—')}</b></span>
                    <span className="border-l border-gray-300 pl-3">Дата створення: <b>{formatDate(record.createdAt || record.created_at)}</b></span>
                    {cfg.dateField && formatDate(record.createdAt || record.created_at) !== formatDate(record[cfg.dateField]) && (
                      <span className="bg-amber-100 text-gray-700 px-1.5 py-0.5 rounded">Дата {cfg.dateField ? cfg.storageOperation || cfg.label.toLowerCase() : ''}: <span className="font-semibold">{record[cfg.dateField] ? formatDate(record[cfg.dateField]) : '—'}</span></span>
                    )}
                  </div>
                  {record.comment && <p className="text-[13px] text-gray-500 mt-1">Коментар: <b>{record.comment}</b></p>}
                </div>

                <div className="mb-2">
                  {recordType === 'releaseSet' ? (
                    <HistoryItemsTable mode="sets" sets={record.setsNormalized ?? items} />
                  ) : (
                    <HistoryItemsTable mode="normal" items={record.itemsNormalized ?? items} />
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default HistoryAccordionItem;
