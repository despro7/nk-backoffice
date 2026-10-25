import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useDisclosure } from '@heroui/react';
import { useDebug } from '@/contexts/debug-context';
import { useDilovodDirectories } from '@/contexts/DilovodDirectoriesContext';
import { useAuth } from '@/contexts/auth-context';
import { useApi } from '@/hooks/useApi';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { useWarehouseMovementSettings } from '@/hooks/useWarehouseMovementSettings';
import { playSoundChoice } from '@/lib/soundUtils';
import { ToastService } from '@/services/ToastService';
import { PayloadPreviewModal } from '@/components/modals/PayloadPreviewModal';
import ResultDrawer from '@/components/ResultDrawer';
import { PERMISSIONS } from '@shared/constants/permissions';
import { WAREHOUSE_MOVEMENT_SETTING_DEFAULTS, mobScanStepperDelta } from '@shared/types/movement';
import { isUsableDilovodBatchId } from '@shared/utils/dilovodBatchId';
import type {
  MovementMobActionBar,
  MovementMobAdminQtySide,
  MovementMobEditorMode,
  MovementMobProductLineViewModel,
  MovementMobScanDraft,
} from './WarehouseMovementMobTypes';
import {
  aggregatesFromLines,
  aggregatesFromReceivedLines,
  applyProductMetaToLines,
  batchPortionsOnStorage,
  breakdownStockPortions,
  clampMovementMobQty,
  maxSendablePortionsFromSource,
  packageRatioToPortionsPerBox,
  totalPortionsOnStorage,
  canReceiverEditAfterConfirm,
  canSenderEditAfterSubmit,
  classifyReceivingScan,
  committedPortionsForSku,
  findMovementMobLine,
  findSentLineForScan,
  hasSentShipmentLines,
  insertMovementMobLineAt,
  movementLineMatchesBatch,
  lineTotalPortions,
  linesMissingBatchLink,
  movementMobLineKey,
  receiptDeviations,
  replaceMovementMobLine,
  resolveWarehouseAcceptedState,
  serializeMobDraftItems,
  toDocumentViewModel,
} from './WarehouseMovementMobUtils';
import type { MovementMobBatchRow } from './WarehouseMovementMobUtils';
import {
  cancelReceiptConfirmation,
  confirmReceipt,
  createWarehouseMovementDraft,
  deleteMovement,
  fetchBarcodeForBatch,
  fetchBatchFallback,
  fetchBatchNumbersBySku,
  fetchConfirmReceiptPayload,
  fetchMovementLogs,
  fetchMovementMobLineStock,
  fetchProductByBarcode,
  resolveBatchNameForProduct,
  saveReceipt,
  submitMovement,
  syncMovementToDilovod,
  updateWarehouseMovementDraft,
} from './movementMobApi';
import { useMovementMobScan } from './useMovementMobScan';
import { invalidateMovementMobLineEnrichment, useMovementMobLinesEnrichment } from './useMovementMobLinesEnrichment';
import { useWarehouseMovementMobDocument } from './useWarehouseMovementMobDocument';
import MovementMobCameraOverlay from './components/MovementMobCameraOverlay';
import MovementMobDocumentScreen, { MovementMobDocumentScreenLoading } from './components/MovementMobDocumentScreen';
import MovementMobManualBarcodeModal from './components/MovementMobManualBarcodeModal';
import MovementMobMockBarcodeBar, {
  readMovementMobMock,
  writeMovementMobMock,
} from './components/MovementMobMockBarcodeBar';
import MovementMobScanDrawer from './components/MovementMobScanDrawer';
import MovementMobSubmitSheet from './components/MovementMobSubmitSheet';
import MovementMobConfirmReceiptSheet from './components/MovementMobConfirmReceiptSheet';
import MovementMobCancelReceiptModal from './components/MovementMobCancelReceiptModal';
import MovementMobDeleteConfirmModal from './components/MovementMobDeleteConfirmModal';
import MovementMobSyncDilovodModal from './components/MovementMobSyncDilovodModal';
import MovementMobProductEditDrawer, {
  type MovementMobProductSavedPayload,
} from './components/MovementMobProductEditDrawer';
import MovementMobUndoBanner from './components/MovementMobUndoBanner';
import MovementMobBatchPickerSheet from './components/MovementMobBatchPickerSheet';
import type { MovementMobStorageOption } from './components/MovementMobWarehouseSelectors';

interface MovementMobEditorPageProps {
  documentId: number | null;
  useMockBarcode?: boolean;
  mockBarcode?: string;
}

function sameScanTarget(draft: MovementMobScanDraft, sku: string, batchId: string, batchNumber: string): boolean {
  if (draft.sku !== sku) return false;
  return movementLineMatchesBatch(
    { batchId: draft.batchId, batchNumber: draft.batchNumber },
    batchId,
    batchNumber,
  );
}

export default function MovementMobEditorPage({
  documentId,
  useMockBarcode: useMockBarcodeProp,
  mockBarcode: mockBarcodeProp,
}: MovementMobEditorPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { hasPermission } = useRoleAccess();
  const canOverrideEdit = hasPermission(PERMISSIONS.ACTION_WAREHOUSE_MOVEMENT_EDIT);
  const canOverrideDelete = hasPermission(PERMISSIONS.ACTION_WAREHOUSE_MOVEMENT_DELETE);
  const { apiCall } = useApi();
  const { isDebugMode } = useDebug();
  const dirsCtx = useDilovodDirectories();
  const { settings: wmSettings } = useWarehouseMovementSettings();
  const { document, loading, error, refetch } = useWarehouseMovementMobDocument(documentId);

  const [sourceId, setSourceId] = useState('');
  const [destId, setDestId] = useState('');
  const [lines, setLines] = useState<MovementMobProductLineViewModel[]>([]);
  const [draft, setDraft] = useState<MovementMobScanDraft | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [stepperFocused, setStepperFocused] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [confirmingReceipt, setConfirmingReceipt] = useState(false);
  const [payloadOpen, setPayloadOpen] = useState(false);
  const [payloadPreview, setPayloadPreview] = useState<Record<string, unknown> | null>(null);
  const [isLoadingPayload, setIsLoadingPayload] = useState(false);
  const { isOpen: logsOpen, onOpen: openLogs, onOpenChange: onLogsOpenChange } = useDisclosure();
  const [logsResult, setLogsResult] = useState<Record<string, unknown>[] | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [undo, setUndo] = useState<{ line: MovementMobProductLineViewModel; index: number } | null>(null);
  const [receiveUndo, setReceiveUndo] = useState<{
    previous: MovementMobProductLineViewModel[];
    productName: string;
    prefix?: string;
  } | null>(null);
  const [adminEditing, setAdminEditing] = useState(
    () => Boolean((location.state as { adminEdit?: boolean } | null)?.adminEdit),
  );
  const [adminQtySide, setAdminQtySide] = useState<MovementMobAdminQtySide>('sent');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncingDilovod, setSyncingDilovod] = useState(false);
  const [cancelReceiptOpen, setCancelReceiptOpen] = useState(false);
  const [cancelingReceipt, setCancelingReceipt] = useState(false);
  const [productEditGoodId, setProductEditGoodId] = useState<string | null>(null);
  const [enterLineKey, setEnterLineKey] = useState<string | null>(null);
  const [mockEnabled, setMockEnabled] = useState(() => useMockBarcodeProp ?? readMovementMobMock().enabled);
  const [mockCode, setMockCode] = useState(() => mockBarcodeProp ?? readMovementMobMock().code);
  const [batchPickerOpen, setBatchPickerOpen] = useState(false);
  const [batchPickerRows, setBatchPickerRows] = useState<MovementMobBatchRow[]>([]);
  const [batchPickerLoading, setBatchPickerLoading] = useState(false);

  const persistedIdRef = useRef<number | null>(documentId);
  const syncedDocIdRef = useRef<number | null>(null);
  const syncedStatusRef = useRef<string | null>(null);
  const defaultDirectionAppliedRef = useRef(false);
  const lookupBusyRef = useRef(false);
  const sourceIdRef = useRef(sourceId);
  const destIdRef = useRef(destId);
  const draftRef = useRef(draft);
  const linesRef = useRef(lines);
  sourceIdRef.current = sourceId;
  destIdRef.current = destId;
  draftRef.current = draft;
  linesRef.current = lines;
  if (documentId != null) {
    persistedIdRef.current = documentId;
  }

  useEffect(() => {
    if (useMockBarcodeProp != null) setMockEnabled(useMockBarcodeProp);
    if (mockBarcodeProp != null) setMockCode(mockBarcodeProp);
  }, [mockBarcodeProp, useMockBarcodeProp]);

  useEffect(() => {
    writeMovementMobMock({ enabled: mockEnabled, code: mockCode });
  }, [mockCode, mockEnabled]);

  const storages = useMemo<MovementMobStorageOption[]>(() => {
    const src = Array.isArray(dirsCtx.directories?.storages) ? dirsCtx.directories!.storages : [];
    return (src || []).map((s: { id: string | number; name?: string }) => ({
      id: String(s.id),
      name: s.name ?? String(s.id),
    }));
  }, [dirsCtx.directories]);

  const mobScanStepperMode = wmSettings?.mobScanStepperMode
    ?? WAREHOUSE_MOVEMENT_SETTING_DEFAULTS.mobScanStepperMode;
  const mobRequireBatch = wmSettings?.mobRequireBatch
    ?? WAREHOUSE_MOVEMENT_SETTING_DEFAULTS.mobRequireBatch;

  const storageName = useCallback((id: string) => {
    return storages.find((item) => item.id === id)?.name ?? id;
  }, [storages]);

  useEffect(() => {
    if (!document) return;
    if (syncedDocIdRef.current === document.id && syncedStatusRef.current === document.status) return;
    syncedDocIdRef.current = document.id;
    syncedStatusRef.current = document.status;
    persistedIdRef.current = document.id;
    defaultDirectionAppliedRef.current = true;
    setSourceId(document.sourceStorageId);
    setDestId(document.destStorageId);
    setLines(document.lines);
  }, [document]);

  // Дефолтний напрямок для нового документа — з /settings/warehouse-movement
  useEffect(() => {
    if (documentId != null || defaultDirectionAppliedRef.current || !wmSettings) return;
    if (wmSettings.storageFrom) setSourceId(wmSettings.storageFrom);
    if (wmSettings.storageTo) setDestId(wmSettings.storageTo);
    defaultDirectionAppliedRef.current = true;
  }, [documentId, wmSettings]);

  const isSender = user?.id != null
    && document?.createdBy != null
    && Number(user.id) === Number(document.createdBy);
  const isDeleted = document?.status === 'deleted';
  const isPendingReceipt = document?.status === 'pending_receipt';
  const isFinalized = document?.status === 'finalized';
  const isWarehouseAccepted = useMemo(
    () => resolveWarehouseAcceptedState(document ? { ...document, lines } : null),
    [document, lines],
  );
  const senderEditWindowActive = canSenderEditAfterSubmit(document, user?.id ?? null, wmSettings);
  const receiverEditWindowActive = canReceiverEditAfterConfirm(document, user?.id ?? null, wmSettings);
  const canReceive = isPendingReceipt && user?.id != null && !isSender && !adminEditing;
  const canReceiverEdit = receiverEditWindowActive && !adminEditing;
  const adminCanEdit = canOverrideEdit && adminEditing && !isDeleted;
  const adminDualEdit = adminCanEdit && isWarehouseAccepted;
  const editingReceived = (adminCanEdit && isWarehouseAccepted && adminQtySide === 'received' && !adminDualEdit)
    || canReceiverEdit;
  const canEditSentAsSender = (documentId == null || document?.status === 'draft' || senderEditWindowActive) && isSender;
  const canEditDraft = (canEditSentAsSender || adminCanEdit) && !isDeleted;

  const editorMode: MovementMobEditorMode = useMemo(() => {
    if (isDeleted) return 'view';
    if (adminCanEdit) return lines.length === 0 ? 'empty' : 'formation';
    if (canReceiverEdit) return lines.length === 0 ? 'empty' : 'receiving';
    if (senderEditWindowActive) return lines.length === 0 ? 'empty' : 'formation';
    if (document?.mode === 'view') return 'view';
    if (isPendingReceipt) return canReceive ? 'receiving' : 'view';
    if (documentId != null && document != null && !isSender) return 'view';
    if (lines.length === 0) return 'empty';
    return 'formation';
  }, [adminCanEdit, canReceive, canReceiverEdit, document, document?.mode, documentId, isDeleted, isPendingReceipt, isSender, lines.length, senderEditWindowActive]);

  const canScan = !isDeleted && (
    documentId == null
    || document?.mode === 'formation'
    || canReceive
    || canReceiverEdit
    || senderEditWindowActive
    || adminCanEdit
  );

  const actionBar = useMemo<MovementMobActionBar | null>(() => {
    if (isDeleted) return null;
    if (adminCanEdit) {
      if (document?.status === 'draft' || documentId == null) return 'formation';
      return 'adminEdit';
    }
    if (canReceiverEdit) return 'receiverEdit';
    if (senderEditWindowActive) return 'senderEdit';
    if (isPendingReceipt) return canReceive ? 'receiving' : 'awaitingReceipt';
    if (editorMode === 'formation') return 'formation';
    return null;
  }, [adminCanEdit, canReceive, canReceiverEdit, document?.status, documentId, editorMode, isDeleted, isPendingReceipt, senderEditWindowActive]);

  const {
    lines: enrichedLines,
    stockLoading,
    stockRefreshing,
    batchLoading,
    batchRefreshing,
  } = useMovementMobLinesEnrichment(lines);
  const aggregates = useMemo(() => aggregatesFromLines(lines), [lines]);
  const receivedAggregates = useMemo(() => aggregatesFromReceivedLines(lines), [lines]);
  const chronology = document?.chronology ?? [];
  const otherCommittedPortions = draft
    ? committedPortionsForSku(
      lines,
      draft.sku,
      draft.editingLineKey ?? movementMobLineKey(draft.sku, draft.batchId, draft.batchNumber),
      editingReceived ? 'received' : 'sent',
    )
    : 0;
  const capSentToSourceBatch = draft != null
    && (draft.dualQtyMode
      || !(((canReceive || canReceiverEdit) && !adminCanEdit) || editingReceived));
  const maxSentPortionsForDraft = useMemo(() => {
    if (!draft?.stockInfo || !capSentToSourceBatch) return null;
    return maxSendablePortionsFromSource(draft.stockInfo, sourceId, otherCommittedPortions);
  }, [capSentToSourceBatch, draft?.stockInfo, otherCommittedPortions, sourceId]);

  const sourceBatchMissingOnSource = Boolean(
    draft?.stockInfo
    && capSentToSourceBatch
    && batchPortionsOnStorage(draft.stockInfo, sourceId) === null,
  );

  useEffect(() => {
    if (maxSentPortionsForDraft == null || !capSentToSourceBatch) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const capped = clampMovementMobQty(
        prev.boxes,
        prev.portions,
        prev.portionsPerBox,
        maxSentPortionsForDraft,
      );
      if (capped.boxes === prev.boxes && capped.portions === prev.portions) return prev;
      return { ...prev, boxes: capped.boxes, portions: capped.portions };
    });
  }, [capSentToSourceBatch, maxSentPortionsForDraft, draft?.batchId, draft?.stockInfo]);

  const applySentQtyToDraft = useCallback((patch: { boxes?: number; portions?: number }) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const perBox = prev.portionsPerBox;
      const boxes = patch.boxes ?? prev.boxes;
      const portions = patch.portions ?? prev.portions;
      const cap = prev.stockInfo && capSentToSourceBatch
        ? maxSendablePortionsFromSource(
          prev.stockInfo,
          sourceIdRef.current,
          committedPortionsForSku(
            linesRef.current,
            prev.sku,
            prev.editingLineKey ?? movementMobLineKey(prev.sku, prev.batchId, prev.batchNumber),
            'sent',
          ),
        )
        : null;
      const capped = cap != null
        ? clampMovementMobQty(boxes, portions, perBox, cap)
        : { boxes, portions };
      return { ...prev, boxes: capped.boxes, portions: capped.portions };
    });
  }, [capSentToSourceBatch]);

  const draftCatalogGoodId = useMemo(() => {
    if (!draft) return null;
    if (draft.editingLineKey) {
      const byKey = enrichedLines.find((line) => line.key === draft.editingLineKey);
      if (byKey?.catalogGoodId) return byKey.catalogGoodId;
    }
    const line = findMovementMobLine(enrichedLines, draft.sku, draft.batchId, draft.batchNumber);
    if (line?.catalogGoodId) return line.catalogGoodId;
    const sameSku = enrichedLines.find((item) => item.sku === draft.sku && item.catalogGoodId);
    return sameSku?.catalogGoodId ?? null;
  }, [draft, enrichedLines]);

  const draftSentTotalPortions = useMemo(() => {
    if (!draft) return null;
    const receiving = ((canReceive || canReceiverEdit) && !adminCanEdit) || editingReceived;
    if (!receiving) return null;
    const line = findMovementMobLine(lines, draft.sku, draft.batchId, draft.batchNumber);
    return line?.totalPortions ?? 0;
  }, [adminCanEdit, canReceive, canReceiverEdit, draft, editingReceived, lines]);

  const notifyNotFound = useCallback((code: string) => {
    playSoundChoice('error', 'error');
    ToastService.show({
      title: 'Товар не знайдено',
      description: `Штрих-код ${code}`,
      color: 'danger',
    });
  }, []);

  const handleScan = useCallback(async (code: string) => {
    if (
      documentId != null
      && document?.mode !== 'formation'
      && !canReceive
      && !adminCanEdit
      && !senderEditWindowActive
      && !canReceiverEdit
    ) {
      return;
    }
    const openDraft = draftRef.current;

    if (lookupBusyRef.current && !openDraft) return;
    lookupBusyRef.current = true;

    try {
      const product = await fetchProductByBarcode(apiCall, code);
      if (!product) {
        notifyNotFound(code);
        return;
      }

      const scanBatchId = product.batchId ?? '';
      const scanBatchNumber = product.batchNumber ?? '';
      const sentShipment = hasSentShipmentLines(linesRef.current);
      const isFormationDoc = documentId == null || document?.status === 'draft';

      let matchedSentLine: MovementMobProductLineViewModel | undefined;
      let batchId = scanBatchId;
      let batchNumber = scanBatchNumber;

      if (sentShipment) {
        const verdict = classifyReceivingScan(
          linesRef.current,
          product.sku,
          scanBatchId,
          scanBatchNumber,
          product.barcode,
        );
        if (verdict.kind === 'match') {
          matchedSentLine = verdict.line;
          batchId = verdict.line.batchId;
          batchNumber = verdict.line.batchNumber;
        } else if (verdict.kind === 'wrong_batch') {
          playSoundChoice('error', 'error');
          const hasBatchOnBarcode = isUsableDilovodBatchId(scanBatchId)
            || Boolean(scanBatchNumber.trim());
          ToastService.show({
            title: hasBatchOnBarcode
              ? 'Сканований штрихкод належить іншій партії'
              : 'Невірна партія товару',
            description: `${product.name} (SKU ${product.sku}) є у відправленні, але з іншою партією`,
            color: 'danger',
          });
          return;
        } else if (!isFormationDoc) {
          playSoundChoice('error', 'error');
          ToastService.show({
            title: 'Товар не у відправленні',
            description: `${product.name} (SKU ${product.sku}) не входить до цього переміщення`,
            color: 'danger',
          });
          return;
        }
      }

      if (!matchedSentLine) {
        if (!isUsableDilovodBatchId(batchId)) {
          if (mobRequireBatch) {
            batchId = '';
            batchNumber = '';
          } else {
            const fallback = await fetchBatchFallback(apiCall, product.sku, sourceIdRef.current);
            if (!fallback?.batchId) {
              playSoundChoice('error', 'error');
              ToastService.show({
                title: 'Немає партії',
                description: 'Для цього товару немає партії на складі-джерелі',
                color: 'danger',
              });
              return;
            }
            batchId = fallback.batchId;
            batchNumber = fallback.batchNumber || batchNumber;
          }
        } else {
          const resolved = await resolveBatchNameForProduct(
            apiCall,
            product.sku,
            batchId,
            batchNumber,
            sourceIdRef.current,
          );
          batchId = resolved.batchId;
          batchNumber = resolved.batchNumber;
        }
      }

      const receiving = canReceive || canReceiverEdit || editingReceived || adminDualEdit
        || (adminCanEdit && matchedSentLine != null && adminQtySide === 'received');

      if (openDraft) {
        if (sameScanTarget(openDraft, product.sku, batchId, batchNumber)) {
          const delta = mobScanStepperDelta(mobScanStepperMode, product.barcodeKind);
          const scanAddsToReceived = openDraft.dualQtyMode && receiving;
          setDraft((prev) => {
            if (!prev) return prev;
            let boxes = scanAddsToReceived ? prev.boxes : prev.boxes + delta.boxes;
            let portions = scanAddsToReceived ? prev.portions : prev.portions + delta.portions;
            if (!scanAddsToReceived && prev.stockInfo) {
              const max = maxSendablePortionsFromSource(
                prev.stockInfo,
                sourceIdRef.current,
                committedPortionsForSku(
                  linesRef.current,
                  prev.sku,
                  prev.editingLineKey ?? movementMobLineKey(prev.sku, prev.batchId, prev.batchNumber),
                  'sent',
                ),
              );
              const capped = clampMovementMobQty(boxes, portions, prev.portionsPerBox, max);
              boxes = capped.boxes;
              portions = capped.portions;
            }
            return {
              ...prev,
              barcode: product.barcode,
              barcodeKind: product.barcodeKind,
              boxes,
              portions,
              receivedBoxes: scanAddsToReceived ? (prev.receivedBoxes ?? 0) + delta.boxes : prev.receivedBoxes,
              receivedPortions: scanAddsToReceived ? (prev.receivedPortions ?? 0) + delta.portions : prev.receivedPortions,
            };
          });
          return;
        }

        ToastService.show({
          title: 'Спочатку підтвердіть поточну позицію',
          color: 'warning',
        });
        return;
      }

      const portionsPerBox = product.portionsPerBox && product.portionsPerBox > 0 ? product.portionsPerBox : 0;
      const existing = matchedSentLine
        ?? findMovementMobLine(linesRef.current, product.sku, batchId, batchNumber, product.barcode);
      const resolvedBatchId = existing?.batchId ?? batchId;
      const resolvedBatchNumber = existing?.batchNumber && existing.batchNumber !== '—'
        ? existing.batchNumber
        : batchNumber;
      const stockInfo = await fetchMovementMobLineStock(
        apiCall,
        product.sku,
        resolvedBatchId,
        resolvedBatchNumber,
        sourceIdRef.current,
        destIdRef.current,
      );
      const scanDelta = mobScanStepperDelta(mobScanStepperMode, product.barcodeKind);
      const baseBoxes = adminDualEdit
        ? (existing?.boxQuantity ?? 0)
        : receiving
          ? (existing?.receivedBoxQuantity ?? 0)
          : (existing?.boxQuantity ?? 0);
      const basePortions = adminDualEdit
        ? (existing?.portionQuantity ?? 0)
        : receiving
          ? (existing?.receivedPortionQuantity ?? 0)
          : (existing?.portionQuantity ?? 0);
      const receivedBaseBoxes = adminDualEdit ? (existing?.receivedBoxQuantity ?? 0) : 0;
      const receivedBasePortions = adminDualEdit ? (existing?.receivedPortionQuantity ?? 0) : 0;
      let boxes = adminDualEdit
        ? (existing?.boxQuantity ?? 0)
        : baseBoxes + scanDelta.boxes;
      let portions = adminDualEdit
        ? (existing?.portionQuantity ?? 0)
        : basePortions + scanDelta.portions;
      const capSent = adminDualEdit || !receiving;
      if (capSent) {
        const lineKey = existing?.key ?? movementMobLineKey(product.sku, resolvedBatchId, resolvedBatchNumber);
        const max = maxSendablePortionsFromSource(
          stockInfo,
          sourceIdRef.current,
          committedPortionsForSku(linesRef.current, product.sku, lineKey, 'sent'),
        );
        const capped = clampMovementMobQty(boxes, portions, portionsPerBox, max);
        boxes = capped.boxes;
        portions = capped.portions;
        if (max <= 0) {
          playSoundChoice('error', 'error');
          ToastService.show({
            title: 'Немає залишку для відвантаження',
            description: batchPortionsOnStorage(stockInfo, sourceIdRef.current) === null
              ? 'Партія відсутня на складі-джерелі'
              : 'Залишок партії на складі-джерелі — 0',
            color: 'danger',
          });
        }
      }
      const srcId = sourceIdRef.current;
      const dstId = destIdRef.current;
      setDraft({
        sku: product.sku,
        name: product.name,
        weight: product.weight,
        portionsPerBox,
        barcode: product.barcode,
        barcodeKind: product.barcodeKind,
        batchId: resolvedBatchId,
        batchNumber: resolvedBatchNumber,
        boxes,
        portions,
        receivedBoxes: adminDualEdit
          ? receivedBaseBoxes + scanDelta.boxes
          : receivedBaseBoxes,
        receivedPortions: adminDualEdit
          ? receivedBasePortions + scanDelta.portions
          : receivedBasePortions,
        dualQtyMode: adminDualEdit,
        editingLineKey: existing?.key,
        stockInfo,
        sourceStock: breakdownStockPortions(totalPortionsOnStorage(stockInfo, srcId), portionsPerBox),
        destStock: breakdownStockPortions(totalPortionsOnStorage(stockInfo, dstId), portionsPerBox),
      });
      setDrawerOpen(true);
    } catch {
      notifyNotFound(code);
    } finally {
      lookupBusyRef.current = false;
    }
  }, [adminCanEdit, adminDualEdit, adminQtySide, apiCall, canReceive, canReceiverEdit, document?.mode, document?.status, documentId, editingReceived, mobRequireBatch, mobScanStepperMode, notifyNotFound, senderEditWindowActive]);

  const scan = useMovementMobScan({
    enabled: canScan,
    pauseHid: stepperFocused || manualOpen,
    onScan: handleScan,
    useMockBarcode: isDebugMode && mockEnabled,
    mockBarcode: mockCode,
  });

  const persistLines = useCallback(async (nextLines: MovementMobProductLineViewModel[]) => {
    const items = serializeMobDraftItems(nextLines, sourceIdRef.current);
    const existingId = persistedIdRef.current;

    if (!existingId) {
      const created = await createWarehouseMovementDraft(apiCall, {
        items,
        sourceWarehouse: sourceIdRef.current,
        destinationWarehouse: destIdRef.current,
      });
      persistedIdRef.current = created.id;
      const viewModel = toDocumentViewModel(
        created,
        Object.fromEntries(
          nextLines.map((line) => [line.sku, { weight: line.weight, portionsPerBox: line.portionsPerBox }]),
        ),
        storages.find((item) => item.id === destIdRef.current)?.name,
      );
      queryClient.setQueryData(['warehouse-movement-mob-document', created.id], viewModel);
      await queryClient.invalidateQueries({ queryKey: ['warehouse-movement-mob-list'] });
      navigate(`/warehouse/movement-mob/${created.id}`, { replace: true });
      return;
    }

    if ((canReceive || canReceiverEdit) && !adminCanEdit) {
      await saveReceipt(apiCall, existingId, items);
    } else {
      await updateWarehouseMovementDraft(apiCall, existingId, items);
    }
    await queryClient.invalidateQueries({ queryKey: ['warehouse-movement-mob-document', existingId] });
    await queryClient.invalidateQueries({ queryKey: ['warehouse-movement-mob-list'] });
  }, [adminCanEdit, apiCall, canReceive, canReceiverEdit, navigate, queryClient]);

  const handleProductSaved = useCallback(async (saved: MovementMobProductSavedPayload) => {
    const sku = saved.sku.trim();
    if (!sku) return;

    void invalidateMovementMobLineEnrichment(queryClient);

    const portionsPerBox = packageRatioToPortionsPerBox(saved.packageRatio);
    const nextLines = applyProductMetaToLines(linesRef.current, sku, {
      weight: saved.weight,
      portionsPerBox,
      name: saved.name,
    });
    setLines(nextLines);

    setDraft((current) => (
      current?.sku === sku
        ? {
          ...current,
          name: saved.name || current.name,
          weight: saved.weight ?? current.weight,
          portionsPerBox: portionsPerBox ?? current.portionsPerBox,
        }
        : current
    ));

    const canPersist = canEditDraft || canReceive || canReceiverEdit || adminCanEdit;
    if (persistedIdRef.current && canPersist) {
      try {
        await persistLines(nextLines);
      } catch (err) {
        ToastService.show({
          title: 'Не вдалося оновити рядки документа',
          description: err instanceof Error ? err.message : undefined,
          color: 'danger',
        });
      }
    }
  }, [adminCanEdit, canEditDraft, canReceive, canReceiverEdit, persistLines, queryClient]);

  const handleConfirm = useCallback(async () => {
    const current = draftRef.current;
    if (!current || confirming) return;
    const sentTotal = lineTotalPortions(current.boxes, current.portions, current.portionsPerBox);
    const receivedTotal = current.dualQtyMode
      ? lineTotalPortions(current.receivedBoxes ?? 0, current.receivedPortions ?? 0, current.portionsPerBox)
      : sentTotal;
    if (current.dualQtyMode) {
      if (sentTotal <= 0 && receivedTotal <= 0) return;
    } else if (sentTotal <= 0) {
      return;
    }

    playSoundChoice('success', 'success');
    setConfirming(true);
    try {
      const previous = linesRef.current;
      const receiving = ((canReceive || canReceiverEdit) && !adminCanEdit) || editingReceived;
      // Партія завжди з draft (користувач міг змінити її в picker).
      // Не брати batchId з existing за editingLineKey — інакше заміна партії відкочується.
      const resolvedBatchId = current.batchId;
      const resolvedBatchNumber = current.batchNumber || '—';
      const resolvedKey = movementMobLineKey(current.sku, resolvedBatchId, resolvedBatchNumber);
      // existing — лише для qty/received; партію з нього більше не читаємо.
      const existing = findMovementMobLine(previous, current.sku, resolvedBatchId, resolvedBatchNumber)
        ?? (receiving
          ? findSentLineForScan(previous, current.sku, resolvedBatchId, resolvedBatchNumber)
          : undefined)
        ?? (current.editingLineKey
          ? previous.find((line) => line.key === current.editingLineKey)
          : undefined);
      const incoming: MovementMobProductLineViewModel = current.dualQtyMode
        ? {
          key: resolvedKey,
          sku: current.sku,
          productName: current.name,
          batchId: resolvedBatchId,
          batchNumber: resolvedBatchNumber,
          boxQuantity: current.boxes,
          portionQuantity: current.portions,
          totalPortions: sentTotal,
          weight: current.weight,
          portionsPerBox: current.portionsPerBox || null,
          barcode: current.barcode,
          barcodeKind: current.barcodeKind,
          receivedBoxQuantity: current.receivedBoxes ?? 0,
          receivedPortionQuantity: current.receivedPortions ?? 0,
          receivedTotalPortions: receivedTotal,
        }
        : receiving
          ? {
            key: resolvedKey,
            sku: current.sku,
            productName: current.name,
            batchId: resolvedBatchId,
            batchNumber: resolvedBatchNumber,
            boxQuantity: existing?.boxQuantity ?? 0,
            portionQuantity: existing?.portionQuantity ?? 0,
            totalPortions: existing?.totalPortions ?? 0,
            weight: current.weight,
            portionsPerBox: current.portionsPerBox || null,
            barcode: current.barcode,
            barcodeKind: current.barcodeKind,
            receivedBoxQuantity: current.boxes,
            receivedPortionQuantity: current.portions,
            receivedTotalPortions: sentTotal,
          }
          : {
            key: resolvedKey,
            sku: current.sku,
            productName: current.name,
            batchId: resolvedBatchId,
            batchNumber: resolvedBatchNumber,
            boxQuantity: current.boxes,
            portionQuantity: current.portions,
            totalPortions: sentTotal,
            weight: current.weight,
            portionsPerBox: current.portionsPerBox || null,
            barcode: current.barcode,
            barcodeKind: current.barcodeKind,
            receivedBoxQuantity: existing?.receivedBoxQuantity ?? 0,
            receivedPortionQuantity: existing?.receivedPortionQuantity ?? 0,
            receivedTotalPortions: existing?.receivedTotalPortions ?? 0,
          };

      let nextLines = previous;
      if (current.editingLineKey && current.editingLineKey !== resolvedKey) {
        nextLines = previous.filter((line) => line.key !== current.editingLineKey);
      }
      if (sentTotal <= 0 && receivedTotal <= 0) {
        nextLines = nextLines.filter((line) => line.key !== resolvedKey && line.key !== current.editingLineKey);
      } else {
        nextLines = replaceMovementMobLine(nextLines, incoming);
      }

      setLines(nextLines);
      setDrawerOpen(false);
      setDraft(null);
      setStepperFocused(false);
      if (receiving || current.dualQtyMode) {
        setReceiveUndo({ previous, productName: incoming.productName, prefix: current.dualQtyMode ? 'Змінено' : 'Прийнято' });
        setUndo(null);
      }
      void invalidateMovementMobLineEnrichment(queryClient);
      await persistLines(nextLines);
    } catch (err) {
      ToastService.show({
        title: 'Не вдалося зберегти чернетку',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setConfirming(false);
    }
  }, [adminCanEdit, canReceive, canReceiverEdit, confirming, editingReceived, persistLines, queryClient]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setDraft(null);
    setStepperFocused(false);
  }, []);

  const handleEditLine = useCallback(async (line: MovementMobProductLineViewModel) => {
    if ((!canEditDraft && !canReceive && !canReceiverEdit && !adminCanEdit) || lookupBusyRef.current) return;
    playSoundChoice('tick', 'pending');
    lookupBusyRef.current = true;
    try {
      const portionsPerBox = line.portionsPerBox && line.portionsPerBox > 0 ? line.portionsPerBox : 0;
      const batchNumber = line.batchNumber === '—' ? '' : line.batchNumber;
      const stockInfo = await fetchMovementMobLineStock(
        apiCall,
        line.sku,
        line.batchId,
        batchNumber,
        sourceIdRef.current,
        destIdRef.current,
      );
      const dualMode = adminDualEdit;
      const editReceived = (canReceive || canReceiverEdit || editingReceived) && !dualMode;
      const srcId = sourceIdRef.current;
      const dstId = destIdRef.current;
      let boxes = editReceived ? line.receivedBoxQuantity : line.boxQuantity;
      let portions = editReceived ? line.receivedPortionQuantity : line.portionQuantity;
      const capSent = dualMode || !editReceived;
      if (capSent) {
        const max = maxSendablePortionsFromSource(
          stockInfo,
          srcId,
          committedPortionsForSku(linesRef.current, line.sku, line.key, 'sent'),
        );
        const capped = clampMovementMobQty(boxes, portions, portionsPerBox, max);
        boxes = capped.boxes;
        portions = capped.portions;
      }
      setDraft({
        sku: line.sku,
        name: line.productName,
        weight: line.weight,
        portionsPerBox,
        barcode: line.barcode ?? '',
        barcodeKind: line.barcodeKind ?? 'portion',
        batchId: line.batchId,
        batchNumber,
        boxes,
        portions,
        receivedBoxes: dualMode ? line.receivedBoxQuantity : undefined,
        receivedPortions: dualMode ? line.receivedPortionQuantity : undefined,
        dualQtyMode: dualMode,
        editingLineKey: line.key,
        stockInfo,
        sourceStock: breakdownStockPortions(totalPortionsOnStorage(stockInfo, srcId), portionsPerBox),
        destStock: breakdownStockPortions(totalPortionsOnStorage(stockInfo, dstId), portionsPerBox),
      });
      setDrawerOpen(true);
    } catch (err) {
      ToastService.show({
        title: 'Не вдалося відкрити позицію',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      lookupBusyRef.current = false;
    }
  }, [adminCanEdit, adminDualEdit, apiCall, canEditDraft, canReceive, canReceiverEdit, editingReceived]);

  const handleDeleteLine = useCallback(async (line: MovementMobProductLineViewModel) => {
    if (document?.mode === 'receiving' && !adminCanEdit) return;
    playSoundChoice('droplet', 'error');
    const previous = linesRef.current;
    const index = previous.findIndex((item) => item.key === line.key);

    const nextLines = previous.filter((item) => item.key !== line.key);
    setUndo({ line, index: Math.max(0, index) });
    setReceiveUndo(null);

    setLines(nextLines);
    try {
      await persistLines(nextLines);
    } catch (err) {
      setLines(previous);
      setUndo(null);
      setReceiveUndo(null);
      ToastService.show({
        title: 'Не вдалося видалити позицію',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    }
  }, [adminCanEdit, document?.mode, persistLines]);

  const dismissUndo = useCallback(() => setUndo(null), []);

  const handleUndoDelete = useCallback(() => {
    const pending = undo;
    if (!pending) return;
    setUndo(null);
    setEnterLineKey(pending.line.key);
    const nextLines = insertMovementMobLineAt(linesRef.current, pending.line, pending.index);
    setLines(nextLines);
    window.setTimeout(() => setEnterLineKey(null), 400);
    void persistLines(nextLines).catch((err: unknown) => {
      ToastService.show({
        title: 'Не вдалося відновити позицію',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    });
  }, [persistLines, undo]);

  const handleAddMore = () => {
    scan.openCamera();
  };

  const handleSend = () => {
    if (mobRequireBatch) {
      const missing = linesMissingBatchLink(enrichedLines);
      if (missing.length > 0) {
        playSoundChoice('error', 'error');
        ToastService.show({
          title: 'Обовʼязкова партія',
          description: `${missing.length} ${missing.length === 1 ? 'позиція' : 'позиції'} без привʼязаної партії до штрих-коду. Оберіть партію або відредагуйте товар.`,
          color: 'danger',
        });
        return;
      }
    }
    setSubmitOpen(true);
  };

  const loadBatchPickerRows = useCallback(async (sku: string, force = false) => {
    setBatchPickerLoading(true);
    try {
      const rows = await fetchBatchNumbersBySku(apiCall, sku, {
        sourceStorageId: sourceIdRef.current,
        includeSmallStorage: true,
        force,
      });
      setBatchPickerRows(rows);
    } finally {
      setBatchPickerLoading(false);
    }
  }, [apiCall]);

  const handleOpenBatchPicker = useCallback(() => {
    const current = draftRef.current;
    if (!current) return;
    setBatchPickerOpen(true);
    void loadBatchPickerRows(current.sku);
  }, [loadBatchPickerRows]);

  const handleBatchSelect = useCallback(async (batch: MovementMobBatchRow) => {
    const current = draftRef.current;
    if (!current) return;
    const nextBatchId = batch.batchId;
    const nextBatchNumber = batch.batchNumber || batch.batchId;
    try {
      const barcodeInfo = await fetchBarcodeForBatch(apiCall, current.sku, nextBatchId);
      const portionsPerBox = current.portionsPerBox > 0 ? current.portionsPerBox : 0;
      const stockInfo = await fetchMovementMobLineStock(
        apiCall,
        current.sku,
        nextBatchId,
        barcodeInfo.batchNumber || nextBatchNumber,
        sourceIdRef.current,
        destIdRef.current,
      );
      // Беремо актуальний draft після await (кількість могла змінитись у stepper).
      const latest = draftRef.current ?? current;
      const srcId = sourceIdRef.current;
      const dstId = destIdRef.current;
      let boxes = latest.boxes;
      let portions = latest.portions;
      const max = maxSendablePortionsFromSource(
        stockInfo,
        srcId,
        committedPortionsForSku(
          linesRef.current,
          latest.sku,
          latest.editingLineKey
            ?? movementMobLineKey(latest.sku, nextBatchId, barcodeInfo.batchNumber || nextBatchNumber),
          'sent',
        ),
      );
      const capped = clampMovementMobQty(boxes, portions, portionsPerBox, max);
      boxes = capped.boxes;
      portions = capped.portions;
      setDraft({
        ...latest,
        batchId: nextBatchId,
        batchNumber: barcodeInfo.batchNumber || nextBatchNumber,
        barcode: barcodeInfo.barcode ?? latest.barcode,
        barcodeKind: barcodeInfo.barcodeKind ?? latest.barcodeKind,
        boxes,
        portions,
        stockInfo,
        sourceStock: breakdownStockPortions(totalPortionsOnStorage(stockInfo, srcId), portionsPerBox),
        destStock: breakdownStockPortions(totalPortionsOnStorage(stockInfo, dstId), portionsPerBox),
      });
      void invalidateMovementMobLineEnrichment(queryClient);
    } catch (err) {
      ToastService.show({
        title: 'Не вдалося змінити партію',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      // Після застосування — щоб click не пробив ScanDrawer.
      requestAnimationFrame(() => setBatchPickerOpen(false));
    }
  }, [apiCall, queryClient]);

  const handleSubmitConfirm = useCallback(async () => {
    const existingId = persistedIdRef.current;
    if (!existingId || submitting) return;
    setSubmitting(true);
    try {
      await persistLines(linesRef.current);
      await submitMovement(apiCall, existingId);
      setSubmitOpen(false);
      ToastService.show({
        title: 'Відправлено',
        description: 'Документ очікує підтвердження отримання',
        color: 'success',
      });
      await queryClient.invalidateQueries({ queryKey: ['warehouse-movement-mob-document', existingId] });
      await queryClient.invalidateQueries({ queryKey: ['warehouse-movement-mob-list'] });
      await refetch();
    } catch (err) {
      ToastService.show({
        title: 'Не вдалося відправити',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  }, [apiCall, persistLines, queryClient, refetch, submitting]);

  const handleShowPayload = useCallback(async () => {
    const existingId = persistedIdRef.current;
    if (!existingId || isLoadingPayload) return;
    setIsLoadingPayload(true);
    try {
      await persistLines(linesRef.current);
      const payload = isFinalized
        ? await syncMovementToDilovod(apiCall, existingId, { dryRun: true }) as Record<string, unknown>
        : await fetchConfirmReceiptPayload(apiCall, existingId);
      setPayloadPreview(payload);
      setPayloadOpen(true);
    } catch (err) {
      setPayloadPreview(null);
      setPayloadOpen(false);
      ToastService.show({
        title: 'Не вдалося отримати payload',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setIsLoadingPayload(false);
    }
  }, [apiCall, isFinalized, isLoadingPayload, persistLines]);

  const handleShowLogs = useCallback(async () => {
    const existingId = persistedIdRef.current ?? documentId;
    if (!existingId || isLoadingLogs) return;
    setIsLoadingLogs(true);
    try {
      const logs = await fetchMovementLogs(apiCall, existingId);
      setLogsResult(logs);
      openLogs();
    } catch (err) {
      setLogsResult(null);
      ToastService.show({
        title: 'Не вдалося завантажити логи',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setIsLoadingLogs(false);
    }
  }, [apiCall, documentId, isLoadingLogs, openLogs]);

  const handleConfirmReceiptPress = () => {
    if (receivedAggregates.totalPortions <= 0) {
      ToastService.show({
        title: 'Немає прийнятих позицій',
        description: 'Відскануйте хоча б один товар',
        color: 'warning',
      });
      return;
    }
    setReceiptOpen(true);
  };

  const handleConfirmReceipt = useCallback(async () => {
    const existingId = persistedIdRef.current;
    if (!existingId || confirmingReceipt) return;
    setConfirmingReceipt(true);
    try {
      await persistLines(linesRef.current);
      await confirmReceipt(apiCall, existingId);
      setReceiptOpen(false);
      ToastService.show({
        title: 'Отримання підтверджено',
        description: 'Документ відправлено в Dilovod',
        color: 'success',
      });
      await queryClient.invalidateQueries({ queryKey: ['warehouse-movement-mob-document', existingId] });
      await queryClient.invalidateQueries({ queryKey: ['warehouse-movement-mob-list'] });
      await refetch();
    } catch (err) {
      ToastService.show({
        title: 'Не вдалося підтвердити отримання',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setConfirmingReceipt(false);
    }
  }, [apiCall, confirmingReceipt, persistLines, queryClient, refetch]);

  const handleCancelReceipt = useCallback(async () => {
    const existingId = persistedIdRef.current;
    if (!existingId || cancelingReceipt) return;
    setCancelingReceipt(true);
    try {
      const updated = await cancelReceiptConfirmation(apiCall, existingId);
      setCancelReceiptOpen(false);
      setAdminEditing(false);
      setAdminQtySide('sent');
      ToastService.show({
        title: 'Підтвердження скасовано',
        description: 'Документ повернуто на етап очікування отримання. У Діловоді скасовано проведення',
        color: 'success',
      });
      const viewModel = toDocumentViewModel(
        updated,
        Object.fromEntries(
          linesRef.current.map((line) => [line.sku, { weight: line.weight, portionsPerBox: line.portionsPerBox }]),
        ),
        storages.find((item) => item.id === destIdRef.current)?.name,
      );
      queryClient.setQueryData(['warehouse-movement-mob-document', existingId], viewModel);
      await queryClient.invalidateQueries({ queryKey: ['warehouse-movement-mob-list'] });
      await refetch();
    } catch (err) {
      ToastService.show({
        title: 'Не вдалося скасувати підтвердження',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setCancelingReceipt(false);
    }
  }, [apiCall, cancelingReceipt, queryClient, refetch, storages]);

  const handleSyncDilovod = useCallback(async () => {
    const existingId = persistedIdRef.current;
    if (!existingId || syncingDilovod) return;
    setSyncingDilovod(true);
    try {
      await persistLines(linesRef.current);
      await syncMovementToDilovod(apiCall, existingId);
      setSyncOpen(false);
      ToastService.show({
        title: 'Збережено в Dilovod',
        description: 'Документ перезаписано з отриманими кількостями',
        color: 'success',
      });
      await queryClient.invalidateQueries({ queryKey: ['warehouse-movement-mob-document', existingId] });
      await queryClient.invalidateQueries({ queryKey: ['warehouse-movement-mob-list'] });
      await refetch();
    } catch (err) {
      ToastService.show({
        title: 'Не вдалося зберегти в Dilovod',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setSyncingDilovod(false);
    }
  }, [apiCall, persistLines, queryClient, refetch, syncingDilovod]);

  const handleDeleteDocument = useCallback(async () => {
    const existingId = persistedIdRef.current ?? documentId;
    if (!existingId || deleting) return;
    setDeleting(true);
    try {
      await deleteMovement(apiCall, existingId);
      setDeleteOpen(false);
      ToastService.show({
        title: 'Документ видалено',
        description: 'У Діловоді поставлено delMark, якщо документ там був',
        color: 'success',
      });
      await queryClient.invalidateQueries({ queryKey: ['warehouse-movement-mob-list'] });
      await queryClient.removeQueries({ queryKey: ['warehouse-movement-mob-document', existingId] });
      navigate('/warehouse/movement-mob');
    } catch (err) {
      ToastService.show({
        title: 'Не вдалося видалити',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setDeleting(false);
    }
  }, [apiCall, deleting, documentId, navigate, queryClient]);

  const handleCaptureChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    void scan.handleCaptureFile(file);
  };

  if (documentId != null && loading && !document) {
    return <MovementMobDocumentScreenLoading />;
  }

  const showAdminActions = (canOverrideEdit || canOverrideDelete) && documentId != null;
  const canPreviewPayload = isDebugMode && documentId != null && (
    document?.status === 'pending_receipt' || document?.status === 'finalized'
  );

  if (documentId != null && error && !document) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2 text-danger px-4 text-center">
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <>
      <input
        id="movement-mob-capture-input"
        ref={scan.captureInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute h-px w-px opacity-0"
        onChange={handleCaptureChange}
      />

      <MovementMobDocumentScreen
        editorMode={editorMode}
        storages={storages}
        sourceId={sourceId}
        destId={destId}
        onSourceChange={setSourceId}
        onDestChange={setDestId}
        onSwap={() => {
          setSourceId(destId);
          setDestId(sourceId);
        }}
        lines={enrichedLines}
        aggregates={aggregates}
        receivedAggregates={receivedAggregates}
        chronology={chronology}
        scanSlot={
          isDebugMode ? (
            <MovementMobMockBarcodeBar
              enabled={mockEnabled}
              code={mockCode}
              onEnabledChange={setMockEnabled}
              onCodeChange={setMockCode}
            />
          ) : null
        }
        onAddMore={handleAddMore}
        onManualBarcode={() => setManualOpen(true)}
        onEditLine={editorMode === 'formation' || editorMode === 'receiving' || adminCanEdit ? handleEditLine : undefined}
        onDeleteLine={editorMode === 'formation' || adminCanEdit || senderEditWindowActive ? handleDeleteLine : undefined}
        requireBatch={mobRequireBatch}
        adminDualEdit={adminDualEdit}
        stockLoading={stockLoading}
        stockRefreshing={stockRefreshing}
        batchLoading={batchLoading}
        batchRefreshing={batchRefreshing}
        showSendButton={document?.status === 'draft' || documentId == null}
        onEditProduct={(line) => {
          if (line.catalogGoodId) setProductEditGoodId(line.catalogGoodId);
        }}
        enterLineKey={enterLineKey}
        onSend={handleSend}
        onConfirmReceipt={handleConfirmReceiptPress}
        onShowPayload={canPreviewPayload ? handleShowPayload : undefined}
        isLoadingPayload={isLoadingPayload}
        showDebugPayload={canPreviewPayload && showAdminActions}
        onShowLogs={showAdminActions ? handleShowLogs : undefined}
        isLoadingLogs={isLoadingLogs}
        warehousesLocked={documentId != null || Boolean(persistedIdRef.current)}
        actionBar={actionBar}
        isDeleted={isDeleted}
        isFinalized={isFinalized}
        isWarehouseAccepted={isWarehouseAccepted}
        showAdminActions={showAdminActions}
        adminEditing={adminCanEdit}
        adminQtySide={adminQtySide}
        canAdminEdit={canOverrideEdit}
        canAdminDelete={canOverrideDelete}
        onAdminQtySideChange={(side) => {
          setAdminQtySide(side);
          closeDrawer();
        }}
        onAdminEdit={() => setAdminEditing(true)}
        onAdminDelete={() => setDeleteOpen(true)}
        onFinishAdminEdit={() => {
          setAdminEditing(false);
          setAdminQtySide('sent');
        }}
        onSyncDilovod={() => setSyncOpen(true)}
        syncingDilovod={syncingDilovod}
        dilovodDocId={document?.dilovodDocId ?? null}
        dilovodCheckRecordId={document?.id ?? null}
        dilovodCheckLabel={document?.internalDocNumber ?? document?.docNumber ?? null}
        onCancelReceipt={isFinalized && canOverrideEdit ? () => setCancelReceiptOpen(true) : undefined}
        cancelingReceipt={cancelingReceipt}
      />

      <MovementMobScanDrawer
        isOpen={drawerOpen}
        draft={draft}
        sourceLabel={storageName(sourceId)}
        destLabel={storageName(destId)}
        sourceStorageId={sourceId}
        destStorageId={destId}
        maxSentPortions={maxSentPortionsForDraft}
        sourceBatchMissingOnSource={sourceBatchMissingOnSource}
        sentTotalPortions={draftSentTotalPortions}
        confirming={confirming}
        qtySideHint={
          adminDualEdit
            ? 'Редагування відправленого та отриманого'
            : adminCanEdit && isWarehouseAccepted
              ? (adminQtySide === 'received' ? 'Редагування отриманої кількості' : 'Редагування відправленої кількості')
              : undefined
        }
        dualQtyMode={Boolean(draft?.dualQtyMode)}
        allowBatchChange={canEditDraft || adminCanEdit}
        catalogGoodId={draftCatalogGoodId}
        onClose={closeDrawer}
        onBoxesChange={(value) => applySentQtyToDraft({ boxes: value })}
        onPortionsChange={(value) => applySentQtyToDraft({ portions: value })}
        onReceivedBoxesChange={(value) => setDraft((prev) => (prev ? { ...prev, receivedBoxes: value } : prev))}
        onReceivedPortionsChange={(value) => setDraft((prev) => (prev ? { ...prev, receivedPortions: value } : prev))}
        onChangeBatch={handleOpenBatchPicker}
        onStepperFocusChange={setStepperFocused}
        onConfirm={() => { void handleConfirm(); }}
      />

      <MovementMobBatchPickerSheet
        open={batchPickerOpen}
        batches={batchPickerRows}
        loading={batchPickerLoading}
        selectedBatchId={draft?.batchId ?? ''}
        onClose={() => setBatchPickerOpen(false)}
        onSelect={(batch) => { void handleBatchSelect(batch); }}
        onRefresh={() => {
          const sku = draftRef.current?.sku;
          if (sku) void loadBatchPickerRows(sku, true);
        }}
      />

      <MovementMobManualBarcodeModal
        isOpen={manualOpen}
        onClose={() => setManualOpen(false)}
        onSubmit={(code) => { void handleScan(code); }}
      />

      <MovementMobCameraOverlay
        open={scan.cameraOpen}
        stream={scan.liveStream}
        onClose={scan.closeCamera}
        onManualBarcode={() => {
          scan.closeCamera();
          setManualOpen(true);
        }}
        onDetected={(code) => {
          scan.closeCamera();
          scan.ingest(code);
        }}
      />

      <MovementMobSubmitSheet
        open={submitOpen}
        sourceName={storageName(sourceId)}
        destName={storageName(destId)}
        aggregates={aggregates}
        submitting={submitting}
        onOpenChange={setSubmitOpen}
        onConfirm={() => { void handleSubmitConfirm(); }}
      />

      <MovementMobConfirmReceiptSheet
        open={receiptOpen}
        deviations={receiptDeviations(lines)}
        confirming={confirmingReceipt}
        onOpenChange={setReceiptOpen}
        onConfirm={() => { void handleConfirmReceipt(); }}
      />

      <PayloadPreviewModal
        isOpen={payloadOpen}
        onClose={() => setPayloadOpen(false)}
        payload={payloadPreview}
        title="Payload відправки в Діловод"
        internalDocNumber={document?.displayNumber}
        isLoading={isLoadingPayload}
      />

      <ResultDrawer
        isOpen={logsOpen}
        onOpenChange={onLogsOpenChange}
        result={logsResult}
        title={document?.displayNumber ? `Логи документа ${document.displayNumber}` : 'Логи документа'}
        type="logs"
      />

      <MovementMobCancelReceiptModal
        isOpen={cancelReceiptOpen}
        displayNumber={document?.displayNumber}
        canceling={cancelingReceipt}
        onClose={() => setCancelReceiptOpen(false)}
        onConfirm={() => { void handleCancelReceipt(); }}
      />

      <MovementMobDeleteConfirmModal
        isOpen={deleteOpen}
        displayNumber={document?.displayNumber}
        deleting={deleting}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => { void handleDeleteDocument(); }}
      />

      <MovementMobSyncDilovodModal
        isOpen={syncOpen}
        displayNumber={document?.displayNumber}
        saving={syncingDilovod}
        onClose={() => setSyncOpen(false)}
        onConfirm={() => { void handleSyncDilovod(); }}
      />

      {undo && (
        <MovementMobUndoBanner
          key={undo.line.key}
          productName={undo.line.productName}
          onUndo={handleUndoDelete}
          onElapsed={dismissUndo}
        />
      )}

      {receiveUndo && !undo && (
        <MovementMobUndoBanner
          key="receive-undo"
          prefix={receiveUndo.prefix ?? 'Прийнято'}
          tone="success"
          productName={receiveUndo.productName}
          onUndo={() => {
            const snapshot = receiveUndo.previous;
            setReceiveUndo(null);
            setLines(snapshot);
            void persistLines(snapshot).catch((err: unknown) => {
              ToastService.show({
                title: 'Не вдалося скасувати',
                description: err instanceof Error ? err.message : undefined,
                color: 'danger',
              });
            });
          }}
          onElapsed={() => setReceiveUndo(null)}
        />
      )}

      <MovementMobProductEditDrawer
        catalogGoodId={productEditGoodId}
        open={Boolean(productEditGoodId)}
        onClose={() => setProductEditGoodId(null)}
        onSaved={handleProductSaved}
      />
    </>
  );
}
