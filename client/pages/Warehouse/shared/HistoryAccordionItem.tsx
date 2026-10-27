import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { PERMISSIONS } from '@shared/constants/permissions';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { formatDate, formatRelativeDate, truncateText, pluralize } from '@/lib';
import { HistoryItemsTable } from './HistoryItemsTable';
import { DilovodSendErrorItemsTable } from './DilovodSendErrorItemsTable';
import { HistoryStorageBadge } from './HistoryStorageBadge';
import { normalizeSetsArray, sumHistoryItemsQuantity } from './historyNormalize';
import { recordNeedsHistoryDetailsEnrich } from './lazyEnrichHistoryPage';
import { getFirmDisplayName, getStorageDisplayName } from '@shared/utils/directoryUtils';
import { MovementMobScanInterfaceBadge } from '@/pages/Warehouse/WarehouseMovementMob/components/MovementMobAlternateInterfaceNotice';
import { MovementMobDirectionBadges } from '@/pages/Warehouse/WarehouseMovementMob/components/MovementMobStatusStepper';
import { isMobScanMovementHistoryRecord } from '@shared/utils/warehouseMovementNotes';
import { resolveShortStorageBadge } from '@/pages/Warehouse/WarehouseMovementMob/WarehouseMovementMobUtils';
import { useDilovodSettings } from '@/hooks/useDilovodSettings';
import useUserNames from '@/hooks/useUserNames';
import { WarehouseReleaseAuditAccordion } from '@/pages/Warehouse/WarehouseReleaseSets/components/WarehouseReleaseAuditAccordion';
import { normalizeReleaseSendError } from '@shared/utils/releaseSendError';
import {
  BATCH_CORRECTION_COMMENT_STRIP_RE,
  isReleaseBatchCorrection,
  REBATCH_COMMENT_UI_PREFIX_RE,
} from '@shared/utils/releaseBatchCorrection';
import type { ReleaseHistoryCorrectionLayer } from '@shared/utils/mergeReleaseHistoryCorrections';
import {
  formatReleaseHistoryDetailsHeading,
  formatReleaseHistoryDocTrail,
  formatReleaseHistoryLayerTitle,
  formatReleaseHistoryPrimaryTitle,
  parseReleaseHistoryPrimaryTitleParts,
} from '@shared/utils/releaseHistoryDisplayTitle';
import { formatReleaseInternalDocDisplayNumber } from '@shared/utils/releaseHistoryDisplayDocNumber';
import {
  buildCorrectionDocTrailFromLayers,
  getCorrectionLayerStepPrefix,
  isCorrectionHistoryComplete,
  sortCorrectionLayersForDisplay,
} from '@shared/utils/releaseCorrectionLayers';
import type { WarehouseHistoryDilovodRecordType } from '@shared/constants/warehouseHistoryDilovodFrom';
import {
  collectHistoryDilovodCheckItems,
  runWarehouseHistoryDilovodCheck,
} from './warehouseHistoryDilovodCheck';
import {
  listReleaseCorrectionMergeCandidates,
  toReleasePairCandidate,
  type ReleasePairCandidate,
} from '@shared/utils/linkReleaseCorrectionPairs';

interface HistoryAccordionItemProps {
  records: any[];
  emptyMessage?: string;
  showDelete?: boolean;
  showEdit?: boolean;
  isAdmin?: boolean;
  onRefresh?: () => void;
  onLoadRecord?: (record: any) => Promise<void>;
  onDeleteRecord?: (recordId: string) => Promise<void>;
  onMergeCorrection?: (releaseIds: number[]) => Promise<void>;
  onEditRecord?: (record: any) => Promise<void>;
  onRetryRelease?: (record: any) => Promise<void>;
  canEditRecord?: (record: any) => boolean;
  auditRefreshKey?: number;
  recordType?: WarehouseHistoryDilovodRecordType;
  detailsLoading?: Record<string, boolean>;
};

const CORRECTION_INCOMPLETE_TOOLTIP = (
  'Неповна пара коригування: немає успішного розукомплектування після комплектування '
  + '(або залишився лише один документ сесії). Можлива помилкова спроба Dilovod — '
  + 'перевірте сусідні рядки з тим самим коментарем.'
);

function CorrectionIncompleteHint({
  stopAccordionToggle,
}: {
  stopAccordionToggle?: boolean;
}) {
  return (
    <Tooltip
      content={CORRECTION_INCOMPLETE_TOOLTIP}
      placement="top"
      showArrow
      delay={200}
      closeDelay={0}
      classNames={{
        base: 'before:bg-danger before:rounded-[3px]',
        content: 'bg-danger border-0 text-white text-xs max-w-sm',
      }}
    >
      <span
        className="inline-flex shrink-0 text-danger cursor-help"
        role="img"
        aria-label={CORRECTION_INCOMPLETE_TOOLTIP}
        title={CORRECTION_INCOMPLETE_TOOLTIP}
        onMouseDown={stopAccordionToggle ? (event) => event.stopPropagation() : undefined}
        onClick={stopAccordionToggle ? (event) => event.stopPropagation() : undefined}
        onKeyDown={stopAccordionToggle ? (event) => event.stopPropagation() : undefined}
      >
        <DynamicIcon name="circle-alert" className="w-4 h-4" strokeWidth={2} />
      </span>
    </Tooltip>
  );
}

function historyRecordToPairCandidate(record: {
  id?: unknown;
  internalDocNumber?: unknown;
  internal_doc_number?: unknown;
  operationType?: unknown;
  operation_type?: unknown;
  setSku?: unknown;
  set_sku?: unknown;
  quantity?: unknown;
  comment?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
  correctionSessionId?: unknown;
  items?: unknown;
}): ReleasePairCandidate {
  const createdRaw = record.createdAt ?? record.created_at ?? new Date(0);
  return toReleasePairCandidate({
    id: Number(record.id),
    internalDocNumber: String(record.internalDocNumber ?? record.internal_doc_number ?? '').trim() || null,
    operationType: String(record.operationType ?? record.operation_type ?? ''),
    setSku: String(record.setSku ?? record.set_sku ?? '').trim() || null,
    quantity: Number(record.quantity ?? 0),
    comment: record.comment != null ? String(record.comment) : null,
    createdAt: new Date(String(createdRaw)),
    correctionSessionId: record.correctionSessionId != null ? String(record.correctionSessionId) : null,
    items: record.items,
  });
}

function collectCorrectionMemberIds(record: {
  id?: unknown;
  correctionLayers?: ReleaseHistoryCorrectionLayer[];
}): number[] {
  const layers = Array.isArray(record.correctionLayers) ? record.correctionLayers : [];
  if (layers.length > 0) {
    return layers
      .map((layer) => Number(layer.recordId ?? layer.id))
      .filter((id) => Number.isFinite(id) && id > 0);
  }
  const single = Number(record.id);
  return Number.isFinite(single) && single > 0 ? [single] : [];
}

function formatReleaseHistoryCommentForDisplay(
  comment: unknown,
  isBatchCorrection: boolean,
): string {
  if (comment == null || comment === '') return '';
  let text = String(comment);
  if (isBatchCorrection) {
    text = text.replace(BATCH_CORRECTION_COMMENT_STRIP_RE, '');
    text = text.replace(REBATCH_COMMENT_UI_PREFIX_RE, '');
  }
  return text.trim();
}

export const HistoryAccordionItem = ({
  records,
  emptyMessage = 'Немає записів',
  showDelete = true,
  showEdit = false,
  onDeleteRecord,
  onMergeCorrection,
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
  const [loadingDilovodCheckId, setLoadingDilovodCheckId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; message: string } | null>(null);
  const [mergeModal, setMergeModal] = useState<{
    anchorRecordId: string;
    memberIds: number[];
    candidateIds: number[];
  } | null>(null);
  const [mergeSelectedIds, setMergeSelectedIds] = useState<Set<number>>(new Set());
  const [loadingMerge, setLoadingMerge] = useState(false);

  const correctionPairPool = useMemo(() => {
    const seen = new Set<number>();
    const pool: ReleasePairCandidate[] = [];
    for (const record of records) {
      const push = (row: typeof record) => {
        const candidate = historyRecordToPairCandidate(row);
        if (seen.has(candidate.id)) return;
        seen.add(candidate.id);
        pool.push(candidate);
      };
      push(record);
      if (Array.isArray(record.correctionLayers)) {
        for (const layer of record.correctionLayers) {
          push(layer as typeof record);
        }
      }
    }
    return pool;
  }, [records]);
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
    if (recordNeedsHistoryDetailsEnrich(record)) {
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

  const handleDeleteRecord = (recordId: string, message: string) => {
    if (!onDeleteRecord) return;
    setDeleteConfirm({ id: recordId, message });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm?.id || !onDeleteRecord) return;
    setLoadingDeleteId(deleteConfirm.id);
    try {
      await onDeleteRecord(deleteConfirm.id);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[HistoryAccordionItem] Error deleting record:', error);
    } finally {
      setLoadingDeleteId(null);
      setDeleteConfirm(null);
    }
  };

  const handleCancelDelete = () => {
    if (loadingDeleteId) return;
    setDeleteConfirm(null);
  };

  const openMergeModal = (record: {
    id?: unknown;
    correctionLayers?: ReleaseHistoryCorrectionLayer[];
    operationType?: unknown;
  }) => {
    const memberIds = collectCorrectionMemberIds(record);
    const kitLayer = (record.correctionLayers ?? []).find(
      (layer) => String(layer.operationType ?? '').toLowerCase() === 'kit',
    );
    const anchor = historyRecordToPairCandidate(kitLayer ?? record);
    const candidates = listReleaseCorrectionMergeCandidates(anchor, correctionPairPool);
    setMergeModal({
      anchorRecordId: String(record.id),
      memberIds,
      candidateIds: candidates.map((row) => row.id),
    });
    setMergeSelectedIds(new Set(candidates.map((row) => row.id)));
  };

  const handleConfirmMerge = async () => {
    if (!mergeModal || !onMergeCorrection) return;
    const releaseIds = [...new Set([...mergeModal.memberIds, ...mergeSelectedIds])];
    if (releaseIds.length < 2) return;
    setLoadingMerge(true);
    try {
      await onMergeCorrection(releaseIds);
      setMergeModal(null);
      setMergeSelectedIds(new Set());
    } finally {
      setLoadingMerge(false);
    }
  };

  const handleCheckDilovod = async (record: Parameters<typeof collectHistoryDilovodCheckItems>[0]) => {
    const recordId = String(record.id ?? '');
    setLoadingDilovodCheckId(recordId);
    try {
      await runWarehouseHistoryDilovodCheck(collectHistoryDilovodCheckItems(record, { recordType }));
    } catch (error) {
      window.alert(`⚠️ ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoadingDilovodCheckId(null);
    }
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
    movement: { label: 'Переміщення', genitive: 'переміщення', dateField: 'movementDate', secondaryDateField: 'createdAt' },
	};

  const RELEASE_OPERATION_CONFIG: Record<string, { label: string; icon: string }> = {
    kit: { label: 'Комплектування', icon: 'package' },
    unkit: { label: 'Розукомплектування', icon: 'package-open' },
  };

  const RELEASE_LAYER_ICON_CLASS: Record<string, string> = {
    kit: 'text-blue-500 bg-blue-100',
    unkit: 'text-red-500 bg-red-100',
  };

	const isReleaseSetRecord = recordType === 'releaseSet';
	const isMovementRecord = recordType === 'movement';

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
        const operationType = String(record.operationType ?? '').toLowerCase();
        const operationCfg = RELEASE_OPERATION_CONFIG[operationType]
          ?? (isMovementRecord ? { label: 'Переміщення', icon: 'arrow-left-right' } : undefined);
        const movementFromId = record.sourceWarehouse ?? record.source_warehouse;
        const movementToId = record.destinationWarehouse ?? record.destination_warehouse;
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
        const correctionLayers: ReleaseHistoryCorrectionLayer[] = Array.isArray(record.correctionLayers)
          && record.correctionLayers.length > 0
          ? record.correctionLayers
          : (isBatchCorrection
            ? [{ ...record, recordId: String(record.id) }]
            : []);
        const isCorrectionDisplay = isReleaseSetRecord && correctionLayers.length > 0 && isBatchCorrection;
        const sortedCorrectionLayers = isCorrectionDisplay
          ? sortCorrectionLayersForDisplay(correctionLayers)
          : correctionLayers;
        const correctionDocTrail = isCorrectionDisplay
          ? buildCorrectionDocTrailFromLayers(sortedCorrectionLayers)
          : null;
        const correctionIncomplete = isCorrectionDisplay
          && !isCorrectionHistoryComplete(sortedCorrectionLayers);
        const correctionKitLayer = sortedCorrectionLayers.find(
          (layer) => String(layer.operationType ?? '').toLowerCase() === 'kit',
        );
        const mergeCandidates = isCorrectionDisplay && onMergeCorrection
          ? listReleaseCorrectionMergeCandidates(
            historyRecordToPairCandidate(correctionKitLayer ?? record),
            correctionPairPool,
          )
          : [];
        const showMergeCorrection = Boolean(onMergeCorrection && mergeCandidates.length > 0);
        const displayOperationCfg = isCorrectionDisplay
          ? { label: 'Коригування', icon: 'refresh-cw' }
          : operationCfg;
        const displayOperationIconClass = isCorrectionDisplay
          ? 'text-violet-700 bg-violet-200'
          : (operationType === 'kit' ? 'text-blue-500 bg-blue-100' : 'text-red-500 bg-red-100');
        const totalQuantity = sumHistoryItemsQuantity(items);
        const isExpanded = expandedRecordId === String(record.id);
				const reason = record.reason || record.writeOffReason || record.surplusReason || record.write_off_reason;
        
        const setsForCount = recordType === 'releaseSet' ? (record.setsNormalized ?? normalizeSetsArray(record.items ?? items)) : [];
        const uniqueSetTypes = recordType === 'releaseSet' ? setsForCount.length : 0;
        const totalSets = recordType === 'releaseSet' ? setsForCount.reduce((sum: number, set: any) => sum + (Number(set.setQty ?? 0)), 0) : 0;
        // Primary should be the creation timestamp; if operation date differs, show it as secondary
        const primaryDateValue = record.createdAt || record.created_at
          || (isReleaseSetRecord ? (record.operDate || record.oper_date) : null)
          || (isMovementRecord ? (record.movementDate || record.movement_date) : null);
        const secondaryDateValue = isReleaseSetRecord
          ? (record.operDate || record.oper_date || null)
          : isMovementRecord
            ? (record.movementDate || record.movement_date || null)
            : null;
        const shouldShowSecondaryDate = (isReleaseSetRecord || isMovementRecord)
          && secondaryDateValue
          && formatDate(primaryDateValue) !== formatDate(secondaryDateValue);
        const recordEditable = Boolean(showEdit && onEditRecord && (!canEditRecord || canEditRecord(record)));
        const operationDocNumber = record.internalDocNumber || record.internal_doc_number || null;
        const releaseHistoryTitle = isReleaseSetRecord && displayOperationCfg
          ? (isCorrectionDisplay && correctionDocTrail
            ? `${displayOperationCfg.label} ${correctionDocTrail}`
            : formatReleaseHistoryPrimaryTitle({
              operationLabel: displayOperationCfg.label,
              primaryDocNumber: operationDocNumber,
              docTrail: null,
            }))
          : null;
        const releaseDetailsHeadingKind = isCorrectionDisplay
          ? 'correction' as const
          : operationType === 'unkit'
            ? 'unkit' as const
            : operationType === 'kit'
              ? 'kit' as const
              : 'operation' as const;
        const releaseDetailsHeading = isReleaseSetRecord
          ? (isCorrectionDisplay && correctionDocTrail
            ? `Деталі коригування ${correctionDocTrail}`
            : formatReleaseHistoryDetailsHeading({
              kind: releaseDetailsHeadingKind,
              docTrail: null,
              operationDocNumber,
            }))
          : null;
        const movementDocLabel = isMovementRecord
          ? (operationDocNumber || record.docNumber || record.doc_number || null)
          : null;
        const movementCreatedViaMobScan = isMovementRecord && isMobScanMovementHistoryRecord({
          notes: record.notes,
          comment: record.comment,
          items: record.items ?? record.itemsNormalized,
          receiptScanStartedAt: record.receiptScanStartedAt ?? record.receipt_scan_started_at,
        });
        const historyStorageId = isMovementRecord
          ? (movementFromId || null)
          : (record.storageId || record.storage_id || record.payload?.storage || null);
        const historyStorageBadge = !isMovementRecord && historyStorageId
          ? resolveShortStorageBadge(historyStorageId)
          : null;
        const releaseStatus = String(record.status ?? '').toLowerCase();
        const sendFailed = releaseStatus === 'send_failed'
          || correctionLayers.some((layer) => String(layer.status ?? '').toLowerCase() === 'send_failed');
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
                  {displayOperationCfg && !isMovementRecord && (
                    <span className={`p-2 rounded-full ${displayOperationIconClass}`}>
                      <DynamicIcon name={displayOperationCfg.icon as any} size={16} strokeWidth={1.5} />
                    </span>
                  )}
									<div className="flex flex-col min-w-28">
                    <span className={`text-sm font-medium inline-flex items-center gap-1 flex-wrap ${correctionIncomplete ? 'text-danger' : 'text-gray-700'}`}>
                      {isMovementRecord ? (
                        <span className="inline-flex items-center gap-1">
                          {movementDocLabel ?? '—'}
                          {movementCreatedViaMobScan ? (
                            <MovementMobScanInterfaceBadge stopAccordionToggle />
                          ) : null}
                        </span>
                      ) : (() => {
                        const fallback = releaseHistoryTitle
                          ?? (displayOperationCfg ? displayOperationCfg.label : recordName);
                        const parts = releaseHistoryTitle
                          ? parseReleaseHistoryPrimaryTitleParts(releaseHistoryTitle)
                          : { docPrefix: null, label: fallback };
                        if (parts.docPrefix) {
                          return (
                            <>
                              <span>{parts.label}</span>
                              <span>{parts.docPrefix}</span>
                            </>
                          );
                        }
                        return fallback;
                      })()}
                      {correctionIncomplete ? (
                        <CorrectionIncompleteHint stopAccordionToggle />
                      ) : null}
                    </span>
										<span className="text-xs text-gray-400 inline-flex items-center gap-1">
                      {formatRelativeDate(record[cfg.dateField || 'createdAt'], { maxRelativeDays: 1 })}
                      {historyStorageBadge && historyStorageBadge !== '—' ? (
                        <HistoryStorageBadge badge={historyStorageBadge} />
                      ) : null}
                    </span>
									</div>
									<div className="flex gap-2 flex-wrap">
                    {isMovementRecord && (
                      <MovementMobDirectionBadges
                        sourceBadge={resolveShortStorageBadge(movementFromId)}
                        destBadge={resolveShortStorageBadge(movementToId)}
                      />
                    )}
                    {reason && (
                      <Chip size="sm" color="default" variant="flat" className="bg-gray-200 text-gray-700">{reason}</Chip>
                    )}
                    {isBatchCorrection && !isCorrectionDisplay && (
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
                          formatReleaseHistoryCommentForDisplay(record.comment, isBatchCorrection)
                            || String(record.comment),
                          25,
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
                    <h3 className="text-lg font-semibold flex flex-wrap items-center gap-2 text-gray-800">
                      {releaseDetailsHeading ?? 'Деталі операції'}
                      {correctionIncomplete ? <CorrectionIncompleteHint /> : null}
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
                            onPress={() => handleDeleteRecord(
                              String(record.id),
                              isCorrectionDisplay && sortedCorrectionLayers.length > 1
                                ? `Буде видалено лише запис №${operationDocNumber ?? record.id} (один документ БД), не всю сесію коригування.`
                                : `${operationDocNumber ?? `Запис №${record.id}`} буде позначено deleted${record.dilovodDocId ? ' (delMark у Dilovod, якщо є doc id)' : ' локально'}.`,
                            )}
                          >
                            Видалити
                          </Button>
                        </div>
                      )}
                      {showMergeCorrection && canDeleteHistory ? (
                        <div onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="flat"
                            color="secondary"
                            className="h-auto px-2.5 py-1.5 gap-1 min-w-0 bg-violet-200/90 text-violet-900"
                            isDisabled={!!loadingLoadId || loadingMerge}
                            startContent={<DynamicIcon name="link-2" className="w-3 h-3" />}
                            onPress={() => openMergeModal(record)}
                          >
                            Обʼєднати з сиротами
                          </Button>
                        </div>
                      ) : null}
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
                      {collectHistoryDilovodCheckItems(record, { recordType }).length > 0 ? (
                        <div onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="flat"
                            color="default"
                            className="h-auto px-2.5 py-1.5 gap-1 min-w-0 bg-amber-300/90 text-gray-850"
                            isDisabled={!!loadingLoadId}
                            startContent={(
                              <DynamicIcon
                                name={loadingDilovodCheckId === String(record.id) ? 'loader-circle' : 'search-check'}
                                className={loadingDilovodCheckId === String(record.id) ? 'w-3 h-3 animate-spin' : 'w-3 h-3'}
                              />
                            )}
                            onPress={() => void handleCheckDilovod(record)}
                          >
                            Перевірити в Dilovod
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[13px] text-gray-500 flex-wrap">
                    <span>Автор: <b>{namesMap[Number(record.createdBy ?? record.created_by ?? -1)] ?? record.createdBy ?? record.created_by ?? '—'}</b></span>
                    <span className="border-l border-gray-300 pl-3">Фірма: <b>{(getFirmDisplayName(record.firmId, undefined, directories) || 'Не визначено')}</b></span>
                    {isMovementRecord ? (
                      <>
                        <span className="border-l border-gray-300 pl-3">
                          Зі складу: <b>{getStorageDisplayName(movementFromId, undefined, directories) ?? '—'}</b>
                        </span>
                        <span className="border-l border-gray-300 pl-3">
                          На склад: <b>{getStorageDisplayName(movementToId, undefined, directories) ?? '—'}</b>
                        </span>
                      </>
                    ) : (
                      <span className="border-l border-gray-300 pl-3">
                        Склад: <b>{(getStorageDisplayName(record.storageId || record.payload?.storage, record.storageName, directories) || '—')}</b>
                      </span>
                    )}
                    {!isCorrectionDisplay && (
                      <>
                        <span className="border-l border-gray-300 pl-3">
                          Дата створення: <b>{formatDate(primaryDateValue)}</b>
                        </span>
                        {shouldShowSecondaryDate && (
                          <span className="bg-amber-100 text-gray-700 px-1.5 py-0.5 rounded">
                            Дата операції:
                            <span className="font-semibold"> {formatDate(secondaryDateValue)}</span>
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {correctionIncomplete ? (
                    <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                      {mergeCandidates.length > 0
                        ? `Успішний другий етап, ймовірно, у сусідньому рядку (${mergeCandidates.map((row) => formatReleaseInternalDocDisplayNumber(row.internalDocNumber) ?? `#${row.id}`).join(', ')}). Натисніть «Обʼєднати з сиротами» або видаліть помилкову спробу без Dilovod.`
                        : 'Немає успішного розукомплектування після kit (або сесія розірвана). Перевірте сусідні рядки з тим самим коментарем або запустіть warehouse:link-correction-pairs:apply.'}
                    </p>
                  ) : null}
                  {record.comment && (
                    <p className="text-[13px] text-gray-500 mt-1">
                      Коментар:{' '}
                      <b>
                        {formatReleaseHistoryCommentForDisplay(record.comment, isBatchCorrection)
                          || record.comment}
                      </b>
                    </p>
                  )}
                  {sendFailed && sendError && (
                    <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800 space-y-2">
                      <p>
                        <span className="font-medium">Помилка відправки:</span>{' '}
                        {sendError.message}
                      </p>
                      {sendError.raw ? (
                        <DilovodSendErrorItemsTable raw={sendError.raw} />
                      ) : null}
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
	                  ) : recordType === 'releaseSet' && isCorrectionDisplay ? (
                      <div className="space-y-4">
                        {sortedCorrectionLayers.map((layer) => {
                          const layerOperation = String(layer.operationType ?? '').toLowerCase();
                          const layerCfg = RELEASE_OPERATION_CONFIG[layerOperation]
                            ?? { label: layerOperation || 'Операція', icon: 'package' };
                          const layerStepPrefix = getCorrectionLayerStepPrefix(layer, sortedCorrectionLayers);
                          const layerItems = (Array.isArray(layer.setsNormalized) && layer.setsNormalized.length > 0)
                            ? layer.setsNormalized
                            : (Array.isArray(layer.items) ? layer.items : items);
                          const layerCreatedAt = String(layer.createdAt ?? layer.created_at ?? '');
                          const layerOperDate = String(layer.operDate ?? layer.oper_date ?? '');
                          const layerDocNumber = String(
                            layer.internalDocNumber ?? layer.internal_doc_number ?? '',
                          ).trim() || null;
                          const layerShowOperDate = layerOperDate.length > 0
                            && layerCreatedAt.length > 0
                            && formatDate(layerCreatedAt) !== formatDate(layerOperDate);
                          const layerStatus = String(layer.status ?? '').toLowerCase();
                          const layerSendFailed = layerStatus === 'send_failed';
                          const layerDilovodDocId = String(layer.dilovodDocId ?? layer.dilovod_doc_id ?? '').trim();
                          const layerCanDeleteLocally = canDeleteHistory && showDelete && onDeleteRecord
                            && layerSendFailed && !layerDilovodDocId;
                          const layerIconClass = RELEASE_LAYER_ICON_CLASS[layerOperation]
                            ?? 'text-gray-600 bg-gray-100';
                          const layerId = String(layer.recordId ?? layer.id);

                          return (
                            <div
                              key={String(layer.recordId ?? layer.id)}
                              className="overflow-hidden rounded-lg border border-violet-200/80 bg-white shadow-sm"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-100 bg-violet-50/80 px-3 py-2.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`rounded-full p-1.5 ${layerIconClass}`}>
                                    <DynamicIcon name={layerCfg.icon as any} size={14} strokeWidth={1.5} />
                                  </span>
                                  <span className="text-sm font-semibold text-gray-800">
                                    {formatReleaseHistoryLayerTitle({
                                      operationLabel: layerCfg.label,
                                      docNumber: layerDocNumber,
                                      stepPrefix: layerStepPrefix,
                                    })}
                                  </span>
                                  {layerSendFailed ? (
                                    <Chip size="sm" color="danger" variant="flat" className="text-[12px] text-red-700">
                                      Помилка Dilovod
                                    </Chip>
                                  ) : null}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                                  <span>
                                    Дата створення:{' '}
                                    <b className="text-gray-700">{formatDate(layerCreatedAt)}</b>
                                  </span>
                                  {layerShowOperDate ? (
                                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-gray-700">
                                      Дата операції:{' '}
                                      <span className="font-semibold">{formatDate(layerOperDate)}</span>
                                    </span>
                                  ) : null}
                                  {layerCanDeleteLocally ? (
                                    <Button
                                      size="sm"
                                      variant="flat"
                                      color="danger"
                                      className="h-auto min-h-0 px-2 py-1 text-xs"
                                      isDisabled={loadingDeleteId === layerId}
                                      startContent={(
                                        <DynamicIcon
                                          name={loadingDeleteId === layerId ? 'loader-circle' : 'trash-2'}
                                          className={loadingDeleteId === layerId ? 'w-3 h-3 animate-spin' : 'w-3 h-3'}
                                        />
                                      )}
                                      onPress={() => handleDeleteRecord(
                                        layerId,
                                        `Помилкова спроба ${layerDocNumber ?? layerId} без документа в Dilovod буде видалена лише локально (status deleted).`,
                                      )}
                                    >
                                      Видалити помилку
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                              <div className="p-2">
                                <HistoryItemsTable
                                  mode="sets"
                                  sets={layerItems}
                                  hideHeader
                                  movementsStorageId={historyStorageId}
                                />
                              </div>
                              <WarehouseReleaseAuditAccordion
                                releaseId={Number(layer.recordId ?? layer.id)}
                                refreshKey={auditRefreshKey}
                                titleHint={layerDocNumber}
                                className="mx-2 mb-2"
                                onLayoutChange={() => setLayoutTick((value) => value + 1)}
                              />
                            </div>
                          );
                        })}
                      </div>
	                  ) : recordType === 'releaseSet' ? (
	                    <HistoryItemsTable
                        mode="sets"
                        sets={record.setsNormalized ?? items}
                        movementsStorageId={historyStorageId}
                      />
	                  ) : (
	                    <HistoryItemsTable
                        mode="normal"
                        items={record.itemsNormalized ?? items}
                        movementsStorageId={historyStorageId}
                      />
	                  )}
	                </div>

                {recordType === 'releaseSet' && isExpanded && !isCorrectionDisplay ? (
                  <WarehouseReleaseAuditAccordion
                    releaseId={Number(record.id)}
                    refreshKey={auditRefreshKey}
                    titleHint={operationDocNumber}
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
          isOpen={deleteConfirm !== null}
          title="Видалити запис?"
          message={deleteConfirm?.message ?? 'Запис буде позначено deleted.'}
          confirmText="Видалити"
          cancelText="Скасувати"
          confirmColor="danger"
          confirmLoading={loadingDeleteId !== null}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={handleCancelDelete}
        />
      ) : null}

      {mergeModal && onMergeCorrection ? (
        <Modal isOpen onClose={() => !loadingMerge && setMergeModal(null)} size="lg">
          <ModalContent>
            <ModalHeader className="text-base">Обʼєднати документи коригування</ModalHeader>
            <ModalBody className="gap-3 text-sm text-gray-700">
              <p>
                Обрані рядки отримають одну <code className="text-xs">correctionSessionId</code> і зʼявляться одним коригуванням (kit + unkit + помилкові спроби).
              </p>
              <p className="text-xs text-gray-500">
                Уже в сесії: {mergeModal.memberIds.map((id) => `#${id}`).join(', ')}
              </p>
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-2">
                {mergeModal.candidateIds.map((id) => {
                  const candidate = correctionPairPool.find((row) => row.id === id);
                  const label = formatReleaseInternalDocDisplayNumber(candidate?.internalDocNumber ?? null) ?? `#${id}`;
                  const op = String(candidate?.operationType ?? '').toLowerCase();
                  return (
                    <Checkbox
                      key={id}
                      isSelected={mergeSelectedIds.has(id)}
                      onValueChange={(checked) => {
                        setMergeSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(id);
                          else next.delete(id);
                          return next;
                        });
                      }}
                    >
                      {label} · {op === 'kit' ? 'комплектування' : op === 'unkit' ? 'розукомплектування' : op}
                    </Checkbox>
                  );
                })}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => setMergeModal(null)} isDisabled={loadingMerge}>
                Скасувати
              </Button>
              <Button
                color="secondary"
                isLoading={loadingMerge}
                isDisabled={mergeSelectedIds.size === 0}
                onPress={() => void handleConfirmMerge()}
              >
                Обʼєднати
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      ) : null}
    </div>
  );
};

export default HistoryAccordionItem;
