import { useRef, useEffect, useState, useMemo, useCallback, type ReactNode } from 'react';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { useDebug } from '@/contexts/debug-context';
import { useDilovodDirectories } from '@/contexts/DilovodDirectoriesContext';
import { PayloadPreviewModal } from '@/components/modals/PayloadPreviewModal';
import { MovementStartScreen } from './MovementStartScreen';
import { MovementFilterBar } from './MovementFilterBar';
import { MovementActionBar } from './MovementActionBar';
import { MovementProductRow } from './MovementProductRow';
import { MovementProductList } from './MovementProductList';
import { MovementSummaryTable } from './MovementSummaryTable';
import { EmptyBatchesWarningModal } from './EmptyBatchesWarningModal';
import MovementDirectionSelector from './MovementDirectionSelector';
import type { UseWarehouseMovementReturn } from '../useWarehouseMovement';
import { useMovementSendFlow } from '../hooks/useMovementSendFlow';

interface MovementEditorViewProps {
  mov: UseWarehouseMovementReturn;
  onFinalized?: () => void | Promise<void>;
  sendFlow?: ReturnType<typeof useMovementSendFlow>;
  topActions?: ReactNode;
  modalOverlayZClassName?: string;
  showStartScreen?: boolean;
}

export function MovementEditorView({
  mov,
  onFinalized,
  sendFlow: sendFlowProp,
  topActions,
  modalOverlayZClassName,
  showStartScreen = true,
}: MovementEditorViewProps) {
  const { isAdmin } = useRoleAccess();
  const { isDebugMode } = useDebug();
  const dirsCtx = useDilovodDirectories();

  const internalSendFlow = useMovementSendFlow(mov, { onFinalized });
  const sendFlow = sendFlowProp ?? internalSendFlow;

  const movementStorages = useMemo(() => {
    const src = Array.isArray(dirsCtx.directories?.storages) ? dirsCtx.directories!.storages : [];
    return (src || []).map((s: { id: string; code?: string; name?: string }) => ({
      id: String(s.id),
      code: s.code ?? '',
      name: s.name ?? '',
    }));
  }, [dirsCtx.directories]);

  const sourceStorageName = useMemo(() => {
    const s = movementStorages.find((st) => String(st.id) === String(mov.storage));
    return s ? s.name : '';
  }, [movementStorages, mov.storage]);

  const destStorageName = useMemo(() => {
    const s = movementStorages.find((st) => String(st.id) === String(mov.storageTo));
    return s ? s.name : '';
  }, [movementStorages, mov.storageTo]);

  const accordionRef = useRef<HTMLDivElement>(null);
  const summaryItems = mov.summaryItems;

  const [sortBy, setSortBy] = useState<'name' | 'sku' | 'stock'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [stockDateMode, setStockDateMode] = useState<'movement' | 'now'>('now');

  const handleStockDateModeChange = useCallback((mode: 'movement' | 'now') => {
    setStockDateMode(mode);
    const asOfDate = mode === 'movement' ? mov.selectedDateTime : undefined;
    mov.refreshStockData(mov.products, asOfDate, mov.storage, mov.storageTo);
    if (mov.selectedProductIds.size > 0) {
      mov.refreshBatchQuantities(mov.products, mov.selectedProductIds, asOfDate, mov.storage);
    }
  }, [mov]);

  const prevSessionStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const status = mov.sessionStatus;
    if (status === 'active' && prevSessionStatusRef.current !== 'active') {
      setStockDateMode('movement');
      const asOfDate = mov.selectedDateTime;
      mov.refreshStockData(mov.products, asOfDate, mov.storage, mov.storageTo);
    }
    prevSessionStatusRef.current = status;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mov.sessionStatus]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (accordionRef.current && accordionRef.current.contains(target)) {
        if (target instanceof Element && target.closest('[tabindex="0"]')) {
          return;
        }
      }
      mov.setActiveField(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mov]);

  const sortedFilteredSets = useMemo(() => {
    const items = [...mov.filteredProducts].filter((p) => p.isSet);
    const dir = sortDirection === 'asc' ? 1 : -1;
    return items.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'uk') * dir;
      if (sortBy === 'sku') return a.sku.localeCompare(b.sku, 'uk') * dir;
      if (sortBy === 'stock') {
        const stockA = a.stockData.mainStock + a.stockData.smallStock;
        const stockB = b.stockData.mainStock + b.stockData.smallStock;
        return (stockA - stockB) * dir;
      }
      return 0;
    });
  }, [mov.filteredProducts, sortBy, sortDirection]);

  const sortedFilteredProducts = useMemo(() => {
    const items = [...mov.filteredProducts].filter((p) => !p.isSet);
    const dir = sortDirection === 'asc' ? 1 : -1;
    return items.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'uk') * dir;
      if (sortBy === 'sku') return a.sku.localeCompare(b.sku, 'uk') * dir;
      if (sortBy === 'stock') {
        const stockA = a.stockData.mainStock + a.stockData.smallStock;
        const stockB = b.stockData.mainStock + b.stockData.smallStock;
        return (stockA - stockB) * dir;
      }
      return 0;
    });
  }, [mov.filteredProducts, sortBy, sortDirection]);

  const selectedSetsCount = useMemo(
    () => sortedFilteredSets.filter((p) => mov.selectedProductIds.has(p.id)).length,
    [sortedFilteredSets, mov.selectedProductIds],
  );

  const selectedProductsCount = useMemo(
    () => sortedFilteredProducts.filter((p) => mov.selectedProductIds.has(p.id)).length,
    [sortedFilteredProducts, mov.selectedProductIds],
  );

  return (
    <div className="flex flex-col gap-8 pb-12 w-full">
      {topActions ? <div className="flex justify-end">{topActions}</div> : null}

      {showStartScreen && !mov.savedDraft && mov.products.length === 0 && !mov.isLoading && (
        <MovementStartScreen
          onLoadProducts={mov.loadProducts}
          isLoadingProducts={mov.productsLoading}
        />
      )}

      {mov.products.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h2 className="text-2xl font-bold text-gray-800">
              {!mov.savedDraft
                ? 'Накладна на переміщення'
                : `Накладна на переміщення №${mov.savedDraft.docNumber || mov.savedDraft.internalDocNumber}`}
            </h2>
            {mov.savedDraft && (
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
                  mov.savedDraft.status === 'finalized'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    mov.savedDraft.status === 'finalized' ? 'bg-green-500' : 'bg-gray-400'
                  }`}
                />
                {mov.savedDraft.status === 'finalized' ? 'Завершено' : 'Чернетка'}
              </span>
            )}
          </div>
          <p className="text-gray-600">
            {!mov.savedDraft
              ? 'Заповніть товари з партіями та натисніть «Зберегти та відправити» — документ одразу відправиться в Діловод і закриється.'
              : mov.savedDraft.status === 'finalized'
                ? 'Переміщення завершено. Документ заблоковано для редагування.'
                : 'Чернетку збережено (попередній перегляд). Відправте в Діловод, щоб закрити документ.'}
          </p>
        </div>
      )}

      {mov.products.length > 0 && (
        <MovementDirectionSelector
          storages={movementStorages}
          storage={mov.storage}
          storageTo={mov.storageTo}
          onStorageChange={mov.setStorage}
          onStorageToChange={mov.setStorageTo}
          isDisabled={mov.savedDraft?.status === 'finalized'}
        />
      )}

      {mov.products.length > 0 && (
        <MovementFilterBar
          searchQuery={mov.searchQuery}
          onSearchChange={mov.setSearchQuery}
          selectedDate={mov.selectedDateTime}
          onDateChange={(date) => mov.handleDateChange(date, stockDateMode)}
          isRefreshingBatches={mov.isRefreshingBatches}
          isRefreshingStock={mov.isRefreshingStock}
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSortByChange={setSortBy}
          onSortDirectionChange={setSortDirection}
          stockDateMode={stockDateMode}
          onStockDateModeChange={handleStockDateModeChange}
        />
      )}

      {mov.products.length > 0 && (
        <div ref={accordionRef} className="flex flex-col gap-4">
          {sortedFilteredSets.length > 0 && (
            <MovementProductList
              title="Комплекти"
              icon="boxes"
              headerColorClass="bg-emerald-50"
              headerTextClass="text-emerald-900"
              checkedCount={selectedSetsCount}
              totalCount={sortedFilteredSets.length}
              items={sortedFilteredSets}
              loading={mov.productsLoading}
              error={mov.productsError}
              onRetry={mov.loadProducts}
              hasSearch={mov.searchQuery.length > 0}
            >
              <div>
                {sortedFilteredSets.map((p) => (
                  <MovementProductRow
                    key={p.id}
                    product={p}
                    isOpen={mov.selectedProductIds.has(p.id)}
                    onToggle={mov.handleToggleProduct}
                    onChange={mov.handleProductChange}
                    activeField={
                      mov.activeField?.productId === p.id ? mov.activeField.field : null
                    }
                    selectedDateTime={mov.selectedDateTime}
                    sourceStorage={mov.storage}
                    sourceStorageName={sourceStorageName}
                    destStorage={mov.storageTo}
                    destStorageName={destStorageName}
                    isRefreshingStock={mov.isRefreshingStock}
                  />
                ))}
              </div>
            </MovementProductList>
          )}

          {sortedFilteredProducts.length > 0 && (
            <MovementProductList
              title="Товари"
              icon="utensils"
              headerColorClass="bg-blue-50"
              headerTextClass="text-blue-900"
              checkedCount={selectedProductsCount}
              totalCount={sortedFilteredProducts.length}
              items={sortedFilteredProducts}
              loading={mov.productsLoading}
              error={mov.productsError}
              onRetry={mov.loadProducts}
              hasSearch={mov.searchQuery.length > 0}
            >
              <div>
                {sortedFilteredProducts.map((p) => (
                  <MovementProductRow
                    key={p.id}
                    product={p}
                    isOpen={mov.selectedProductIds.has(p.id)}
                    onToggle={mov.handleToggleProduct}
                    onChange={mov.handleProductChange}
                    activeField={
                      mov.activeField?.productId === p.id ? mov.activeField.field : null
                    }
                    selectedDateTime={mov.selectedDateTime}
                    sourceStorage={mov.storage}
                    sourceStorageName={sourceStorageName}
                    destStorage={mov.storageTo}
                    destStorageName={destStorageName}
                    isRefreshingStock={mov.isRefreshingStock}
                  />
                ))}
              </div>
            </MovementProductList>
          )}
        </div>
      )}

      {summaryItems.length > 0 && (
        <MovementSummaryTable
          items={summaryItems}
          notes={mov.notes}
          setNotes={mov.setNotes}
        />
      )}

      {mov.products.length > 0 && (
        <MovementActionBar
          selectedCount={mov.selectedProductIds.size}
          isDirty={mov.isDirty}
          isSavingDraft={mov.isSaving}
          isSending={sendFlow.isSendingToDilovod}
          hasDraft={mov.savedDraft !== null}
          draftStatus={mov.savedDraft?.status ?? null}
          onCancel={() => mov.setShowConfirmCancel(true)}
          onSaveAndSend={() => void sendFlow.sendAndFinalize()}
          isAdmin={isAdmin()}
          isDebugMode={isDebugMode}
          onShowPayload={() => void sendFlow.handleShowPayload()}
          isLoadingPayload={sendFlow.isLoadingPayload}
        />
      )}

      <PayloadPreviewModal
        isOpen={sendFlow.showPayloadPreview}
        onClose={() => sendFlow.setShowPayloadPreview(false)}
        payload={sendFlow.payloadPreview}
        summaryItems={mov.summaryItems}
        internalDocNumber={mov.savedDraft?.internalDocNumber}
        isLoading={sendFlow.isLoadingPayload}
        isSending={sendFlow.isSendingToDilovod}
        onSend={() => void sendFlow.sendAndFinalize()}
        overlayZClassName={modalOverlayZClassName}
      />

      <ConfirmModal
        isOpen={mov.showConfirmCancel}
        title="Скасувати переміщення?"
        message="Усі введені дані будуть втрачені. Ви впевнені?"
        onConfirm={async () => {
          await mov.handleReset();
          mov.setShowConfirmCancel(false);
        }}
        onCancel={() => mov.setShowConfirmCancel(false)}
        confirmText="Скасувати"
        cancelText="Назад"
        overlayZClassName={modalOverlayZClassName}
      />

      <EmptyBatchesWarningModal
        isOpen={sendFlow.emptyBatchesModal !== null}
        items={sendFlow.emptyBatchesModal?.items ?? []}
        onReview={() => sendFlow.setEmptyBatchesModal(null)}
        onAutoClean={sendFlow.autoCleanAndSend}
        isPending={sendFlow.isSendingToDilovod}
      />
    </div>
  );
}
