import { useEffect, useRef, useState } from 'react';
import { Button, Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { PERMISSIONS } from '@shared/constants/permissions';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { formatDate, formatRelativeDate, truncateText, pluralize } from '@/lib';
import { HistoryItemsTable } from './HistoryItemsTable';
import { normalizeSetsArray } from './historyNormalize';
import { getFirmDisplayName, getStorageDisplayName } from '@shared/utils/directoryUtils';
import { useDilovodSettings } from '@/hooks/useDilovodSettings';
import useUserNames from '@/hooks/useUserNames';
import { WarehouseReleaseAuditAccordion } from '@/pages/Warehouse/WarehouseReleaseSets/components/WarehouseReleaseAuditAccordion';
import { normalizeReleaseSendError } from '@shared/utils/releaseSendError';
import {
  BATCH_CORRECTION_COMMENT_STRIP_RE,
  isReleaseBatchCorrection,
} from '@shared/utils/releaseBatchCorrection';

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
  onRetryRelease?: (record: any) => Promise<void>;
  canEditRecord?: (record: any) => boolean;
  auditRefreshKey?: number;
  recordType?: 'return' | 'writeOff' | 'surplus' | 'releaseSet';
  detailsLoading?: Record<string, boolean>;
}

export const HistoryAccordionItem = ({
  records,
  emptyMessage = 'Немає записів',
  showDelete = true,
  showEdit = false,
  onDeleteRecord,
  onEditRecord,
  onRetryRelease,
  canEditRecord,
  auditRefreshKey = 0,
  recordType,
  onLoadRecord,
  detailsLoading = {},
}: HistoryAccordionItemProps) => {
  const { hasPermission } = useRoleAccess();
  const canDeleteHistory = hasPermission(PERMISSIONS.ACTION_WAREHOUSE_HISTORY_DELETE);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [loadingLoadId, setLoadingLoadId] = useState<string | null>(null);
  const [loadingDeleteId, setLoadingDeleteId] = useState<string | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [loadingRetryId, setLoadingRetryId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [contentHeights, setContentHeights] = useState<Record<string, number>>({});
  const [layoutTick, setLayoutTick] = useState(0);
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
    const id = expandedRecordId;
    if (!id) return;
    const el = contentRefs.current[id];
    if (!el) return;

    const publish = () => {
      const next = el.scrollHeight;
      setContentHeights((prev) => (prev[id] === next ? prev : { ...prev, [id]: next }));
    };

    publish();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publish) : null;
    observer?.observe(el);
    const followUp = window.setTimeout(publish, 320);
    return () => {
      observer?.disconnect();
      window.clearTimeout(followUp);
    };
  }, [expandedRecordId, layoutTick, records]);

  useEffect(() => {
    if (!expandedRecordId || !onLoadRecord) return;
    const record = records.find((r) => String(r.id) === expandedRecordId);
    if (!record) return;
    const parsed = safeParseItems(record.items);
    const normalizedCount = Array.isArray(record.itemsNormalized) ? record.itemsNormalized.length : 0;
    if (parsed.length === 0 && normalizedCount === 0) {
      void onLoadRecord(record);
    }
  }, [expandedRecordId, records, onLoadRecord]);

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

  const handleDeleteRecord = (recordId: string) => {
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

  const handleCancelDelete = () => {
    if (loadingDeleteId) return;
    setConfirmDeleteId(null);
  };

  if (!records || records.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">{emptyMessage}</div>
    );
  }

	// константа мапи типів
	const RECORD_TYPE_CONFIG: Record<string, { label: string; genitive?: string; dateField?: string; secondaryDateField?: string; storageOperation?: string }> = {
		writeOff: 	{ label: 'Списання', dateField: 'writeOffDate' },
    surplus: { label: 'Оприбуткування', dateField: 'surplusDate' },
    releaseSet: { label: 'Випуск', genitive: 'випуску', dateField: 'operDate', secondaryDateField: 'createdAt' },
	};

  const RELEASE_OPERATION_CONFIG: Record<string, { label: string; icon: string }> = {
    kit: { label: 'Комплектування', icon: 'package' },
    unkit: { label: 'Розукомплектування', icon: 'package-open' },
  };

	const isReleaseSetRecord = recordType === 'releaseSet';

	// утиліта для отримання конфігурації по типу запису, з дефолтами
	function getRecordTypeConfig(type?: string) {
		if (!type) return { label: 'Запис', genitive: 'операції', dateField: 'createdAt' };
		return RECORD_TYPE_CONFIG[type] || { label: type, genitive: type, dateField: 'createdAt' };
	}

  const { directories } = useDilovodSettings();
  const userIds = records.map(r => Number(r.createdBy ?? r.created_by ?? null));
  const namesMap = useUserNames(userIds);
  const recordPendingDelete = confirmDeleteId
    ? records.find((r) => String(r.id) === confirmDeleteId)
    : undefined;

  return (
    <div className="space-y-2">
      {records.map((record) => {
				const cfg = getRecordTypeConfig(recordType); // recordType передається в компонент, напр. 'writeOff'
        const recordName = `${cfg.label} №${record.id}`;
        const operationType = String(record.operationType ?? '').toLowerCase();
        const operationCfg = RELEASE_OPERATION_CONFIG[operationType];
	        const items = (Array.isArray(record.itemsNormalized) && record.itemsNormalized.length > 0)
	          ? record.itemsNormalized
	          : safeParseItems(record.items);
	        const isDetailsLoading = Boolean(detailsLoading[String(record.id)]);
        const isBatchCorrection = isReleaseBatchCorrection({
          correctionSessionId: record.correctionSessionId,
          comment: record.comment,
          setSku: record.setSku ?? record.set_sku,
          items,
        });
        const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity ?? item.qty ?? 0), 0);
        const isExpanded = expandedRecordId === String(record.id);
				const reason = record.reason || record.writeOffReason || record.surplusReason || record.write_off_reason;
        
        const setsForCount = recordType === 'releaseSet' ? (record.setsNormalized ?? normalizeSetsArray(record.items ?? items)) : [];
        const uniqueSetTypes = recordType === 'releaseSet' ? setsForCount.length : 0;
        const totalSets = recordType === 'releaseSet' ? setsForCount.reduce((sum: number, set: any) => sum + (Number(set.setQty ?? 0)), 0) : 0;
        // Primary should be the creation timestamp; if operation date differs, show it as secondary
        const primaryDateValue = record.createdAt || record.created_at || (isReleaseSetRecord ? (record.operDate || record.oper_date) : null);
        const secondaryDateValue = isReleaseSetRecord ? (record.operDate || record.oper_date || null) : null;
        const shouldShowSecondaryDate = isReleaseSetRecord && secondaryDateValue && formatDate(primaryDateValue) !== formatDate(secondaryDateValue);
        const recordEditable = Boolean(showEdit && onEditRecord && (!canEditRecord || canEditRecord(record)));
        const operationDocNumber = record.internalDocNumber || record.internal_doc_number || null;
        const releaseStatus = String(record.status ?? '').toLowerCase();
        const sendFailed = releaseStatus === 'send_failed';
        const sendError = normalizeReleaseSendError(record.sendError);
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
                  {operationCfg && (
                    <span className={`p-2 rounded-full ${operationCfg && operationType === 'kit' ? 'text-blue-500 bg-blue-100' : 'text-red-500 bg-red-100'}`}>
                      <DynamicIcon name={operationCfg.icon as any} size={16} strokeWidth={1.5} />
                    </span>
                  )}
									<div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-700 tabular-nums">{operationCfg ? operationCfg?.label : recordName}</span>
										<span className="text-xs text-gray-400">{formatRelativeDate(record[cfg.dateField || 'createdAt'], { maxRelativeDays: 1 })}</span>
									</div>
									<div className="flex gap-2">
                    {reason && (
                      <Chip size="sm" color="default" variant="flat" className="bg-gray-200 text-gray-700">{reason}</Chip>
                    )}
                    {isBatchCorrection && (
                      <Chip
                        size="sm"
                        color="secondary"
                        variant="flat"
                        className="text-[13px] text-violet-700 bg-violet-100"
                        startContent={<DynamicIcon name="refresh-cw" className="w-3 h-3 ml-1 mr-0.5" />}
                      >
                        Коригування
                      </Chip>
                    )}
										{record.comment && (
											<Chip
                        size="sm"
                        color="warning"
                        variant="flat"
                        className="text-sm text-amber-700 ml-0.5 text-[13px]"
                        startContent={<DynamicIcon name="message-circle-more" className="w-3 h-3 ml-1 mr-0.5" />}
                      >
                        {truncateText(
                          isBatchCorrection && typeof record.comment === 'string'
                            ? record.comment.replace(BATCH_CORRECTION_COMMENT_STRIP_RE, '')
                            : record.comment,
                          25
                        )}
                      </Chip>
										)}
                    {sendFailed && (
                      <Chip
                        size="sm"
                        color="danger"
                        variant="flat"
                        className="text-[13px] text-red-700"
                        startContent={<DynamicIcon name="alert-circle" className="w-3 h-3 ml-1 mr-0.5" />}
                      >
                        Помилка Dilovod
                      </Chip>
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
                      <p className="leading-none">{pluralize(totalQuantity, 'одиниця', 'одиниці', 'одиниць')}</p>
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
                    <h3 className="text-lg font-semibold text-gray-700 flex flex-wrap items-baseline gap-2">
                      <span>Деталі операції</span>
                      {operationDocNumber ? (
                        <span className="text-sm font-normal text-default-500">{operationDocNumber}</span>
                      ) : null}
                    </h3>
                    <div className="flex items-center gap-3 ml-auto">
                      {/* Delete button (only visible to admin) */}
                      {canDeleteHistory && showDelete && onDeleteRecord && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="flat"
                            color="danger"
                            className="bg-red-200/80 text-red-700 h-auto px-2.5 py-1.5 gap-1 min-w-0"
                            isDisabled={!!loadingLoadId}
                            startContent={<DynamicIcon name={loadingDeleteId === String(record.id) ? 'loader-circle' : 'trash-2'} className={loadingDeleteId === String(record.id) ? 'w-3 h-3 animate-spin' : 'w-3 h-3'} />}
                            onPress={() => handleDeleteRecord(String(record.id))}
                          >
                            Видалити
                          </Button>
                        </div>
                      )}
                      {/* Edit button (optional) */}
                      {recordEditable && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="flat"
                            color="secondary"
                            className="bg-blue-200/75 text-blue-800 h-auto px-2.5 py-1.5 gap-1 min-w-0"
                            isLoading={loadingEditId === String(record.id)}
                            isDisabled={!!loadingLoadId}
                            startContent={<DynamicIcon name="edit-3" className="w-3 h-3" />}
                            onPress={() => handleEditRecord(String(record.id))}
                          >
                            Редагувати
                          </Button>
                        </div>
                      )}
                      {sendFailed && onRetryRelease && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="flat"
                            color="warning"
                            className="h-auto px-2.5 py-1.5 gap-1 min-w-0 bg-orange-600/80 text-white"
                            startContent={<DynamicIcon name={loadingRetryId === String(record.id) ? 'loader-circle' : 'refresh-cw'} className={loadingRetryId === String(record.id) ? 'w-3 h-3 animate-spin' : 'w-3 h-3'} />}
                            onPress={async () => {
                              setLoadingRetryId(String(record.id));
                              try {
                                await onRetryRelease(record);
                              } finally {
                                setLoadingRetryId(null);
                              }
                            }}
                          >
                            Повторити відправку в Dilovod
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[13px] text-gray-500 flex-wrap">
                    <span>Автор: <b>{namesMap[Number(record.createdBy ?? record.created_by ?? -1)] ?? record.createdBy ?? record.created_by ?? '—'}</b></span>
                    <span className="border-l border-gray-300 pl-3">Фірма: <b>{(getFirmDisplayName(record.firmId, undefined, directories) || 'Не визначено')}</b></span>
                    <span className="border-l border-gray-300 pl-3">Склад: <b>{(getStorageDisplayName(record.storageId || record.payload?.storage, record.storageName, directories) || '—')}</b></span>
                    <span className="border-l border-gray-300 pl-3">
                      Дата створення: <b>{formatDate(primaryDateValue)}</b>
                    </span>
                    {shouldShowSecondaryDate && (
                      <span className="bg-amber-100 text-gray-700 px-1.5 py-0.5 rounded">
                        Дата операції:
                        <span className="font-semibold"> {formatDate(secondaryDateValue)}</span>
                      </span>
                    )}
                  </div>
                  {record.comment && <p className="text-[13px] text-gray-500 mt-1">Коментар: <b>{record.comment}</b></p>}
                  {sendFailed && sendError && (
                    <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800 space-y-2">
                      <p>
                        <span className="font-medium">Помилка відправки:</span>{' '}
                        {sendError.message}
                      </p>
                      {sendError.raw ? (
                        <details
                          className="group"
                          onToggle={() => setLayoutTick((value) => value + 1)}
                        >
                          <summary className="cursor-pointer select-none text-red-700/80 hover:text-red-900 text-xs font-medium">
                            {sendError.source === 'internal'
                              ? 'Технічні деталі'
                              : 'Технічна відповідь Dilovod'}
                          </summary>
                          <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-white/70 border border-red-100 px-2 py-1.5 text-[11px] text-red-900/90 font-mono">
                            {sendError.raw}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  )}
                </div>

	                <div className="mb-2">
	                  {isDetailsLoading ? (
	                    <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
	                      <DynamicIcon name="loader-circle" className="w-4 h-4 animate-spin" />
	                      Завантаження позицій…
	                    </div>
	                  ) : recordType === 'releaseSet' ? (
	                    <HistoryItemsTable mode="sets" sets={record.setsNormalized ?? items} />
	                  ) : (
	                    <HistoryItemsTable mode="normal" items={record.itemsNormalized ?? items} />
	                  )}
	                </div>

                {recordType === 'releaseSet' && isExpanded ? (
                  <WarehouseReleaseAuditAccordion
                    releaseId={Number(record.id)}
                    refreshKey={auditRefreshKey}
                    className="mt-4"
                    onLayoutChange={() => setLayoutTick((value) => value + 1)}
                  />
                ) : null}
              </div>
            </div>
          </div>
        );
      })}

      {canDeleteHistory && showDelete && onDeleteRecord ? (
        <ConfirmModal
          isOpen={confirmDeleteId !== null}
          title="Видалити запис?"
          message={
            recordPendingDelete
              ? recordType === 'releaseSet'
                ? `Запис №${recordPendingDelete.id} буде видалений. Документ у Dilovod буде позначено на видалення (delMark).`
                : `Запис №${recordPendingDelete.id} буде видалений безповоротно.`
              : 'Запис буде видалений безповоротно.'
          }
          confirmText="Видалити"
          cancelText="Скасувати"
          confirmColor="danger"
          confirmLoading={loadingDeleteId !== null}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={handleCancelDelete}
        />
      ) : null}
    </div>
  );
};

export default HistoryAccordionItem;
