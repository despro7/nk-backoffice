import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useDebug } from '@/contexts/DebugContext';
import { useDilovodDirectories } from '@/contexts/DilovodDirectoriesContext';
import { useApi } from '@/hooks/useApi';
import { playSoundChoice } from '@/lib/soundUtils';
import { ToastService } from '@/services/ToastService';
import type {
  MovementMobEditorMode,
  MovementMobProductLineViewModel,
  MovementMobScanDraft,
} from './WarehouseMovementMobTypes';
import {
  aggregatesFromLines,
  breakdownStockPortions,
  committedPortionsForSku,
  insertMovementMobLineAt,
  lineTotalPortions,
  movementMobLineKey,
  replaceMovementMobLine,
  serializeMobDraftItems,
  toDocumentViewModel,
} from './WarehouseMovementMobUtils';
import {
  createWarehouseMovementDraft,
  fetchBatchFallback,
  fetchMovementMobStocks,
  fetchProductByBarcode,
  updateWarehouseMovementDraft,
} from './movementMobApi';
import { useMovementMobScan } from './useMovementMobScan';
import { useWarehouseMovementMobDocument } from './useWarehouseMovementMobDocument';
import MovementMobCameraOverlay from './components/MovementMobCameraOverlay';
import MovementMobDocumentScreen, { MovementMobDocumentScreenLoading } from './components/MovementMobDocumentScreen';
import MovementMobManualBarcodeModal from './components/MovementMobManualBarcodeModal';
import MovementMobMockBarcodeBar, {
  readMovementMobMock,
  writeMovementMobMock,
} from './components/MovementMobMockBarcodeBar';
import MovementMobScanDrawer from './components/MovementMobScanDrawer';
import MovementMobUndoBanner from './components/MovementMobUndoBanner';
import type { MovementMobStorageOption } from './components/MovementMobWarehouseSelectors';

const DEFAULT_SOURCE_ID = '1100700000001005';
const DEFAULT_DEST_ID = '1100700000001019';

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
  const queryClient = useQueryClient();
  const { apiCall } = useApi();
  const { isDebugMode } = useDebug();
  const dirsCtx = useDilovodDirectories();
  const { document, loading, error } = useWarehouseMovementMobDocument(documentId);

  const [sourceId, setSourceId] = useState(DEFAULT_SOURCE_ID);
  const [destId, setDestId] = useState(DEFAULT_DEST_ID);
  const [lines, setLines] = useState<MovementMobProductLineViewModel[]>([]);
  const [draft, setDraft] = useState<MovementMobScanDraft | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [stepperFocused, setStepperFocused] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [undo, setUndo] = useState<{ line: MovementMobProductLineViewModel; index: number } | null>(null);
  const [enterLineKey, setEnterLineKey] = useState<string | null>(null);
  const [mockEnabled, setMockEnabled] = useState(() => useMockBarcodeProp ?? readMovementMobMock().enabled);
  const [mockCode, setMockCode] = useState(() => mockBarcodeProp ?? readMovementMobMock().code);

  const persistedIdRef = useRef<number | null>(documentId);
  const syncedDocIdRef = useRef<number | null>(null);
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

  const storageName = useCallback((id: string) => {
    return storages.find((item) => item.id === id)?.name ?? id;
  }, [storages]);

  useEffect(() => {
    if (!document) return;
    if (syncedDocIdRef.current === document.id) return;
    syncedDocIdRef.current = document.id;
    persistedIdRef.current = document.id;
    setSourceId(document.sourceStorageId);
    setDestId(document.destStorageId);
    setLines(document.lines);
  }, [document]);

  const editorMode: MovementMobEditorMode = useMemo(() => {
    if (document?.mode === 'view') return 'view';
    if (lines.length === 0) return 'empty';
    return 'formation';
  }, [document?.mode, lines.length]);

  const aggregates = useMemo(() => aggregatesFromLines(lines), [lines]);
  const chronology = document?.chronology ?? [];
  const otherCommittedPortions = draft
    ? committedPortionsForSku(lines, draft.sku, movementMobLineKey(draft.sku, draft.batchId, draft.batchNumber))
    : 0;

  const notifyNotFound = useCallback((code: string) => {
    playSoundChoice('error', 'error');
    ToastService.show({
      title: 'Товар не знайдено',
      description: `Штрих-код ${code}`,
      color: 'danger',
    });
  }, []);

  const handleScan = useCallback(async (code: string) => {
    if (documentId != null && document?.mode === 'view') return;
    const openDraft = draftRef.current;

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
      if (!batchId) {
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

      if (openDraft) {
        if (sameScanTarget(openDraft, product.sku, batchId, batchNumber)) {
          setDraft((prev) => {
            if (!prev) return prev;
            if (product.barcodeKind === 'box') {
              return { ...prev, barcode: product.barcode, barcodeKind: product.barcodeKind, boxes: prev.boxes + 1 };
            }
            return { ...prev, barcode: product.barcode, barcodeKind: product.barcodeKind, portions: prev.portions + 1 };
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
      setDraft({
        sku: product.sku,
        name: product.name,
        weight: product.weight,
        portionsPerBox,
        barcode: product.barcode,
        barcodeKind: product.barcodeKind,
        batchId,
        batchNumber,
        boxes: (existing?.boxQuantity ?? 0) + (product.barcodeKind === 'box' ? 1 : 0),
        portions: (existing?.portionQuantity ?? 0) + (product.barcodeKind === 'box' ? 0 : 1),
        sourceStock: breakdownStockPortions(stocks.sourcePortions, portionsPerBox),
        destStock: breakdownStockPortions(stocks.destPortions, portionsPerBox),
      });
      setDrawerOpen(true);
    } catch {
      notifyNotFound(code);
    } finally {
      lookupBusyRef.current = false;
    }
  }, [apiCall, document?.mode, documentId, notifyNotFound]);

  const scan = useMovementMobScan({
    enabled: documentId == null || document?.mode === 'formation',
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
      const viewModel = toDocumentViewModel(created, Object.fromEntries(
        nextLines.map((line) => [line.sku, { weight: line.weight, portionsPerBox: line.portionsPerBox }]),
      ));
      queryClient.setQueryData(['warehouse-movement-mob-document', created.id], viewModel);
      await queryClient.invalidateQueries({ queryKey: ['warehouse-movement-mob-list'] });
      navigate(`/warehouse/movement-mob/${created.id}`, { replace: true });
      return;
    }

    await updateWarehouseMovementDraft(apiCall, existingId, items);
    await queryClient.invalidateQueries({ queryKey: ['warehouse-movement-mob-document', existingId] });
    await queryClient.invalidateQueries({ queryKey: ['warehouse-movement-mob-list'] });
  }, [apiCall, navigate, queryClient]);

  const handleConfirm = useCallback(async () => {
    const current = draftRef.current;
    if (!current || confirming) return;
    const total = lineTotalPortions(current.boxes, current.portions, current.portionsPerBox);
    if (total <= 0) return;

    playSoundChoice('success', 'success');
    setConfirming(true);
    try {
      const incoming: MovementMobProductLineViewModel = {
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
      };
      const nextLines = replaceMovementMobLine(lines, incoming);
      setLines(nextLines);
      setDrawerOpen(false);
      setDraft(null);
      setStepperFocused(false);
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
  }, [confirming, lines, persistLines]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setDraft(null);
    setStepperFocused(false);
  }, []);

  const handleEditLine = useCallback(async (line: MovementMobProductLineViewModel) => {
    if (lookupBusyRef.current) return;
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
        boxes: line.boxQuantity,
        portions: line.portionQuantity,
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
  }, [apiCall]);

  const handleDeleteLine = useCallback(async (line: MovementMobProductLineViewModel) => {
    playSoundChoice('droplet', 'error');
    const previous = linesRef.current;
    const index = previous.findIndex((item) => item.key === line.key);
    const nextLines = previous.filter((item) => item.key !== line.key);
    setLines(nextLines);
    setUndo({ line, index: Math.max(0, index) });
    try {
      await persistLines(nextLines);
    } catch (err) {
      setLines(previous);
      setUndo(null);
      ToastService.show({
        title: 'Не вдалося видалити позицію',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    }
  }, [persistLines]);

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
    ToastService.show({
      title: 'Скоро',
      description: 'Відправка без Dilovod (підтвердження отримання) буде в наступному етапі',
      color: 'primary',
    });
  };

  const handleCaptureChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    void scan.handleCaptureFile(file);
  };

  if (documentId != null && loading && !document) {
    return <MovementMobDocumentScreenLoading />;
  }

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
        onEditLine={handleEditLine}
        onDeleteLine={handleDeleteLine}
        enterLineKey={enterLineKey}
        onSend={handleSend}
        warehousesLocked={documentId != null || Boolean(persistedIdRef.current)}
      />

      <MovementMobScanDrawer
        isOpen={drawerOpen}
        draft={draft}
        sourceLabel={storageName(sourceId)}
        destLabel={storageName(destId)}
        otherCommittedPortions={otherCommittedPortions}
        confirming={confirming}
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

      {undo && (
        <MovementMobUndoBanner
          key={undo.line.key}
          productName={undo.line.productName}
          onUndo={handleUndoDelete}
          onElapsed={dismissUndo}
        />
      )}
    </>
  );
}
