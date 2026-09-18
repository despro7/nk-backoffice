import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useDisclosure } from '@heroui/react';
import { useDebug } from '@/contexts/DebugContext';
import { useDilovodDirectories } from '@/contexts/DilovodDirectoriesContext';
import { useAuth } from '@/contexts/AuthContext';
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
  breakdownStockPortions,
  packageRatioToPortionsPerBox,
  canReceiverEditAfterConfirm,
  canSenderEditAfterSubmit,
  committedPortionsForSku,
  insertMovementMobLineAt,
  isSentMovementLine,
  lineTotalPortions,
  movementMobLineKey,
  receiptDeviations,
  replaceMovementMobLine,
  resolveWarehouseAcceptedState,
  serializeMobDraftItems,
  toDocumentViewModel,
} from './WarehouseMovementMobUtils';
import {
  confirmReceipt,
  createWarehouseMovementDraft,
  deleteMovement,
  fetchBatchFallback,
  fetchConfirmReceiptPayload,
  fetchMovementLogs,
  fetchMovementMobStocks,
  fetchProductByBarcode,
  resolveBatchNameForProduct,
  saveReceipt,
  submitMovement,
  syncMovementToDilovod,
  updateWarehouseMovementDraft,
} from './movementMobApi';
import { useMovementMobScan } from './useMovementMobScan';
import { invalidateMovementMobLineEnrichment } from './useMovementMobLinesEnrichment';
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
import MovementMobDeleteConfirmModal from './components/MovementMobDeleteConfirmModal';
import MovementMobSyncDilovodModal from './components/MovementMobSyncDilovodModal';
import MovementMobProductEditDrawer, {
  type MovementMobProductSavedPayload,
} from './components/MovementMobProductEditDrawer';
import MovementMobUndoBanner from './components/MovementMobUndoBanner';
import type { MovementMobStorageOption } from './components/MovementMobWarehouseSelectors';

interface MovementMobEditorPageProps {
  documentId: number | null;
  useMockBarcode?: boolean;
  mockBarcode?: string;
}

function sameScanTarget(draft: MovementMobScanDraft, sku: string, batchId: string, batchNumber: string): boolean {
  return movementMobLineKey(draft.sku, draft.batchId, draft.batchNumber)
    === movementMobLineKey(sku, batchId, batchNumber);
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
  const [productEditGoodId, setProductEditGoodId] = useState<string | null>(null);
  const [enterLineKey, setEnterLineKey] = useState<string | null>(null);
  const [mockEnabled, setMockEnabled] = useState(() => useMockBarcodeProp ?? readMovementMobMock().enabled);
  const [mockCode, setMockCode] = useState(() => mockBarcodeProp ?? readMovementMobMock().code);

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
  const editingReceived = (adminCanEdit && isWarehouseAccepted && adminQtySide === 'received') || canReceiverEdit;
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

  const aggregates = useMemo(() => aggregatesFromLines(lines), [lines]);
  const receivedAggregates = useMemo(() => aggregatesFromReceivedLines(lines), [lines]);
  const chronology = document?.chronology ?? [];
  const otherCommittedPortions = draft
    ? committedPortionsForSku(
      lines,
      draft.sku,
      movementMobLineKey(draft.sku, draft.batchId, draft.batchNumber),
      editingReceived ? 'received' : 'sent',
    )
    : 0;
  const draftSentTotalPortions = useMemo(() => {
    if (!draft) return null;
    const receiving = ((canReceive || canReceiverEdit) && !adminCanEdit) || editingReceived;
    if (!receiving) return null;
    const line = lines.find(
      (item) => item.key === movementMobLineKey(draft.sku, draft.batchId, draft.batchNumber),
    );
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
    const receiving = canReceive || canReceiverEdit || editingReceived;

    if (lookupBusyRef.current && !openDraft) return;
    lookupBusyRef.current = true;

    try {
      const product = await fetchProductByBarcode(apiCall, code);
      if (!product) {
        notifyNotFound(code);
        return;
      }

      let batchId = product.batchId ?? '';
      let batchNumber = product.batchNumber ?? '';
      if (!isUsableDilovodBatchId(batchId)) {
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

      if (receiving && !adminCanEdit && !isSentMovementLine(linesRef.current, product.sku, batchId, batchNumber)) {
        playSoundChoice('error', 'error');
        ToastService.show({
          title: 'Товар не у відправленні',
          description: `SKU ${product.sku}: ${product.name} не входить до цього переміщення`,
          color: 'danger',
        });
        return;
      }

      if (openDraft) {
        if (sameScanTarget(openDraft, product.sku, batchId, batchNumber)) {
          const delta = mobScanStepperDelta(mobScanStepperMode, product.barcodeKind);
          setDraft((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              barcode: product.barcode,
              barcodeKind: product.barcodeKind,
              boxes: prev.boxes + delta.boxes,
              portions: prev.portions + delta.portions,
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

      const stocks = await fetchMovementMobStocks(
        apiCall,
        product.sku,
        sourceIdRef.current,
        destIdRef.current,
      );
      const portionsPerBox = product.portionsPerBox && product.portionsPerBox > 0 ? product.portionsPerBox : 0;
      const lineKey = movementMobLineKey(product.sku, batchId, batchNumber);
      const existing = linesRef.current.find((line) => line.key === lineKey);
      const baseBoxes = receiving ? (existing?.receivedBoxQuantity ?? 0) : (existing?.boxQuantity ?? 0);
      const basePortions = receiving ? (existing?.receivedPortionQuantity ?? 0) : (existing?.portionQuantity ?? 0);
      const scanDelta = mobScanStepperDelta(mobScanStepperMode, product.barcodeKind);
      setDraft({
        sku: product.sku,
        name: product.name,
        weight: product.weight,
        portionsPerBox,
        barcode: product.barcode,
        barcodeKind: product.barcodeKind,
        batchId,
        batchNumber,
        boxes: baseBoxes + scanDelta.boxes,
        portions: basePortions + scanDelta.portions,
        sourceStock: breakdownStockPortions(stocks.sourcePortions, portionsPerBox),
        destStock: breakdownStockPortions(stocks.destPortions, portionsPerBox),
      });
      setDrawerOpen(true);
    } catch {
      notifyNotFound(code);
    } finally {
      lookupBusyRef.current = false;
    }
  }, [adminCanEdit, apiCall, canReceive, canReceiverEdit, document?.mode, documentId, editingReceived, mobScanStepperMode, notifyNotFound, senderEditWindowActive]);

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
    const total = lineTotalPortions(current.boxes, current.portions, current.portionsPerBox);
    if (total <= 0) return;

    playSoundChoice('success', 'success');
    setConfirming(true);
    try {
      const previous = linesRef.current;
      const existing = previous.find(
        (line) => line.key === movementMobLineKey(current.sku, current.batchId, current.batchNumber),
      );
      const receiving = ((canReceive || canReceiverEdit) && !adminCanEdit) || editingReceived;
      const incoming: MovementMobProductLineViewModel = receiving
        ? {
          key: movementMobLineKey(current.sku, current.batchId, current.batchNumber),
          sku: current.sku,
          productName: current.name,
          batchId: current.batchId,
          batchNumber: current.batchNumber || '—',
          boxQuantity: existing?.boxQuantity ?? 0,
          portionQuantity: existing?.portionQuantity ?? 0,
          totalPortions: existing?.totalPortions ?? 0,
          weight: current.weight,
          portionsPerBox: current.portionsPerBox || null,
          barcode: current.barcode,
          barcodeKind: current.barcodeKind,
          receivedBoxQuantity: current.boxes,
          receivedPortionQuantity: current.portions,
          receivedTotalPortions: total,
        }
        : {
          key: movementMobLineKey(current.sku, current.batchId, current.batchNumber),
          sku: current.sku,
          productName: current.name,
          batchId: current.batchId,
          batchNumber: current.batchNumber || '—',
          boxQuantity: current.boxes,
          portionQuantity: current.portions,
          totalPortions: total,
          weight: current.weight,
          portionsPerBox: current.portionsPerBox || null,
          barcode: current.barcode,
          barcodeKind: current.barcodeKind,
          receivedBoxQuantity: existing?.receivedBoxQuantity ?? 0,
          receivedPortionQuantity: existing?.receivedPortionQuantity ?? 0,
          receivedTotalPortions: existing?.receivedTotalPortions ?? 0,
        };
      const nextLines = replaceMovementMobLine(previous, incoming);
      setLines(nextLines);
      setDrawerOpen(false);
      setDraft(null);
      setStepperFocused(false);
      if (receiving) {
        setReceiveUndo({ previous, productName: incoming.productName, prefix: 'Прийнято' });
        setUndo(null);
      }
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
  }, [adminCanEdit, canReceive, canReceiverEdit, confirming, editingReceived, persistLines]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setDraft(null);
    setStepperFocused(false);
  }, []);

  const handleEditLine = useCallback(async (line: MovementMobProductLineViewModel) => {
    if ((!canEditDraft && !canReceive && !canReceiverEdit) || lookupBusyRef.current) return;
    playSoundChoice('tick', 'pending');
    lookupBusyRef.current = true;
    try {
      const stocks = await fetchMovementMobStocks(
        apiCall,
        line.sku,
        sourceIdRef.current,
        destIdRef.current,
      );
      const portionsPerBox = line.portionsPerBox && line.portionsPerBox > 0 ? line.portionsPerBox : 0;
      setDraft({
        sku: line.sku,
        name: line.productName,
        weight: line.weight,
        portionsPerBox,
        barcode: line.barcode ?? '',
        barcodeKind: line.barcodeKind ?? 'portion',
        batchId: line.batchId,
        batchNumber: line.batchNumber === '—' ? '' : line.batchNumber,
        boxes: (canReceive || canReceiverEdit || editingReceived) ? line.receivedBoxQuantity : line.boxQuantity,
        portions: (canReceive || canReceiverEdit || editingReceived) ? line.receivedPortionQuantity : line.portionQuantity,
        sourceStock: breakdownStockPortions(stocks.sourcePortions, portionsPerBox),
        destStock: breakdownStockPortions(stocks.destPortions, portionsPerBox),
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
  }, [apiCall, canEditDraft, canReceive, canReceiverEdit, editingReceived]);

  const handleDeleteLine = useCallback(async (line: MovementMobProductLineViewModel) => {
    if (document?.mode === 'receiving' && !adminCanEdit) return;
    playSoundChoice('droplet', 'error');
    const previous = linesRef.current;
    const index = previous.findIndex((item) => item.key === line.key);

    const zeroReceived = isWarehouseAccepted && adminCanEdit && adminQtySide === 'received'
      && (line.totalPortions > 0 || line.boxQuantity > 0 || line.portionQuantity > 0);
    const zeroSent = isWarehouseAccepted && adminCanEdit && adminQtySide === 'sent'
      && (line.receivedTotalPortions > 0 || line.receivedBoxQuantity > 0 || line.receivedPortionQuantity > 0);

    let nextLines: MovementMobProductLineViewModel[];
    if (zeroReceived) {
      nextLines = replaceMovementMobLine(previous, {
        ...line,
        receivedBoxQuantity: 0,
        receivedPortionQuantity: 0,
        receivedTotalPortions: 0,
      });
      setReceiveUndo({ previous, productName: line.productName, prefix: 'Змінено' });
      setUndo(null);
    } else if (zeroSent) {
      nextLines = replaceMovementMobLine(previous, {
        ...line,
        boxQuantity: 0,
        portionQuantity: 0,
        totalPortions: 0,
      });
      setReceiveUndo({ previous, productName: line.productName, prefix: 'Змінено' });
      setUndo(null);
    } else {
      nextLines = previous.filter((item) => item.key !== line.key);
      setUndo({ line, index: Math.max(0, index) });
    }

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
  }, [adminCanEdit, adminQtySide, document?.mode, isWarehouseAccepted, persistLines]);

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
    setSubmitOpen(true);
  };

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
        lines={lines}
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
      />

      <MovementMobScanDrawer
        isOpen={drawerOpen}
        draft={draft}
        sourceLabel={storageName(sourceId)}
        destLabel={storageName(destId)}
        otherCommittedPortions={otherCommittedPortions}
        sentTotalPortions={draftSentTotalPortions}
        confirming={confirming}
        qtySideHint={
          adminCanEdit && isWarehouseAccepted
            ? (adminQtySide === 'received' ? 'Редагування отриманої кількості' : 'Редагування відправленої кількості')
            : undefined
        }
        onClose={closeDrawer}
        onBoxesChange={(value) => setDraft((prev) => (prev ? { ...prev, boxes: value } : prev))}
        onPortionsChange={(value) => setDraft((prev) => (prev ? { ...prev, portions: value } : prev))}
        onStepperFocusChange={setStepperFocused}
        onConfirm={() => { void handleConfirm(); }}
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
