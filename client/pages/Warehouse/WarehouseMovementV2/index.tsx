import React, { useCallback, useMemo, useState } from 'react';
import { Tab } from '@heroui/react';
import type { DateRange } from '@react-types/datepicker';
import PageTabs from '@/components/PageTabs';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { PayloadPreviewModal } from '@/components/modals/PayloadPreviewModal';
import { useDebug } from '@/contexts/debug-context';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { useDilovodDirectories } from '@/contexts/DilovodDirectoriesContext';
import ActionsBar from '../WarehouseReleaseSets/components/ActionsBar';
import MovementDirectionDetails from './components/MovementDirectionDetails';
import MovementRegisterPanel from './components/MovementRegisterPanel';
import MovementSummaryPanel from './components/MovementSummaryPanel';
import MovementV2HistoryTab from './components/MovementV2HistoryTab';
import MovementV2HistoryFilterBar from './components/MovementV2HistoryFilterBar';
import useWarehouseMovementV2 from './useWarehouseMovementV2';
import { useMovementV2SendFlow } from './hooks/useMovementV2SendFlow';
import { useWarehouseDocumentEditDrawer } from '@/features/warehouse-document-edit/context/WarehouseDocumentEditDrawerContext';
import { getStorageDisplayName } from '@shared/utils/directoryUtils';
import {
  getDefaultMovementV2HistoryDateRange,
  movementV2HistoryRangeToIso,
  MOVEMENT_V2_HISTORY_DEFAULT_PRESET,
} from './movementV2HistoryDateUtils';
import { findPresetKeyForRange } from '../WarehouseMovementMob/WarehouseMovementMobUtils';
import { createStandardDatePresets } from '@/lib/dateReportingUtils';

type PageTab = 'main' | 'history' | 'archive';

export default function WarehouseMovementV2Page() {
  const { isDebugMode } = useDebug();
  const { isAdmin } = useRoleAccess();
  const dirsCtx = useDilovodDirectories();
  const mov = useWarehouseMovementV2();
  const { open: openDocumentEdit } = useWarehouseDocumentEditDrawer();

  const [pageTab, setPageTab] = useState<PageTab>('main');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [historyDateRange, setHistoryDateRange] = useState<DateRange | null>(
    () => getDefaultMovementV2HistoryDateRange(),
  );
  const [historyDatePresetKey, setHistoryDatePresetKey] = useState<string | null>(
    MOVEMENT_V2_HISTORY_DEFAULT_PRESET,
  );

  const sendFacade = useMemo(() => ({
    storage: mov.storage,
    storageTo: mov.storageTo,
    selectedDateTime: mov.movementDateTime,
    summaryItems: mov.summaryItems,
    savedDraft: mov.savedDraft,
    handleSaveDraft: mov.handleSaveDraft,
  }), [mov]);

  const sendFlow = useMovementV2SendFlow(sendFacade, {
    onFinalized: () => {
      mov.clearAll();
    },
  });

  const movementStorages = useMemo(() => {
    const src = Array.isArray(dirsCtx.directories?.storages) ? dirsCtx.directories!.storages : [];
    return src.map((s: { id: string; name?: string; code?: string }) => ({
      id: String(s.id),
      code: s.code ?? '',
      name: s.name ?? '',
    }));
  }, [dirsCtx.directories]);

  const sourceStorageName = useMemo(
    () => getStorageDisplayName(mov.storage, undefined, dirsCtx.directories) ?? mov.storage,
    [mov.storage, dirsCtx.directories],
  );

  const historyRangeIso = useMemo(
    () => movementV2HistoryRangeToIso(historyDateRange),
    [historyDateRange],
  );

  const loadHistoryPage = useCallback((
    page: number,
    limit: number,
    sync = false,
    forceFullList = false,
  ) => {
    void mov.loadHistory(page, limit, sync, forceFullList, historyRangeIso);
  }, [historyRangeIso, mov]);

  const resetHistoryFilters = useCallback(() => {
    const defaultRange = getDefaultMovementV2HistoryDateRange();
    setHistoryDateRange(defaultRange);
    setHistoryDatePresetKey(MOVEMENT_V2_HISTORY_DEFAULT_PRESET);
    void mov.loadHistory(
      1,
      mov.historyPagination.limit,
      true,
      false,
      movementV2HistoryRangeToIso(defaultRange),
    );
  }, [mov]);

  const openMovementEdit = useCallback((record: { dilovodDocId?: string | null; docNumber?: string | null; internalDocNumber?: string }) => {
    if (!record.dilovodDocId) return;
    openDocumentEdit({
      dilovodDocumentId: record.dilovodDocId,
      documentLabel: record.docNumber || record.internalDocNumber || record.dilovodDocId,
      documentTypeId: 'documents.goodMoving',
    });
  }, [openDocumentEdit]);

  const datePresets = useMemo(() => createStandardDatePresets(), []);

  const applyHistoryDateRange = useCallback((range: DateRange | null, presetKey: string | null) => {
    setHistoryDateRange(range);
    setHistoryDatePresetKey(presetKey);
    void mov.loadHistory(1, mov.historyPagination.limit, true, false, movementV2HistoryRangeToIso(range));
  }, [mov]);

  return (
    <div className="container">
      <p className="text-sm text-default-500 mb-6">
        Формування переміщення між складами з підбором партій. Залишки та документ Діловода (`documents.goodMoving`) привʼязані до обраної дати переміщення.
      </p>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <PageTabs
          className="flex-1 min-w-0"
          selectedKey={pageTab}
          onSelectionChange={(key) => {
            const tab = key as PageTab;
            setPageTab(tab);
            if (tab === 'history' && mov.history.length === 0) {
              loadHistoryPage(1, mov.historyPagination.limit, true);
            }
            if (tab === 'archive' && mov.archiveSessions.length === 0) {
              void mov.loadArchive();
            }
          }}
        >
          <Tab key="main" title="Переміщення" />
          <Tab key="history" title="Історія" />
          {isAdmin() && <Tab key="archive" title="Архів" />}
        </PageTabs>

        {pageTab === 'history' && (
          <MovementV2HistoryFilterBar
            dateRange={historyDateRange}
            datePresetKey={historyDatePresetKey}
            loading={mov.historyLoading}
            onDateRangeChange={(range) => {
              const presetKey = range
                ? findPresetKeyForRange(range, datePresets) ?? 'custom'
                : null;
              applyHistoryDateRange(range, presetKey);
            }}
            onDatePresetKeyChange={(key) => setHistoryDatePresetKey(key)}
            onReset={resetHistoryFilters}
          />
        )}
      </div>

      {pageTab === 'main' && (
        <>
          <MovementDirectionDetails
            storages={movementStorages}
            storage={mov.storage}
            storageTo={mov.storageTo}
            onStorageChange={mov.setStorage}
            onStorageToChange={mov.setStorageTo}
            movementDateTime={mov.movementDateTime}
            onMovementDateTimeChange={mov.setMovementDateTime}
          />

          <MovementRegisterPanel
            lines={mov.lines}
            storageId={mov.storage}
            storageName={sourceStorageName}
            movementDateTime={mov.movementDateTime}
            onAdd={(hit) => void mov.addProductFromSearch(hit)}
            onBatchesChange={mov.updateLineBatches}
            onPortionsPerBoxChange={mov.updateLinePortionsPerBox}
            onRemoveLine={mov.removeLine}
          />

          <MovementSummaryPanel
            items={mov.summaryItems}
            sourceStorageId={mov.storage}
            destStorageId={mov.storageTo}
          />

          <ActionsBar
            onPreview={isDebugMode && isAdmin() ? () => void sendFlow.handleShowPayload() : undefined}
            onSend={() => void sendFlow.sendAndFinalize()}
            onCancel={mov.lines.length > 0 ? () => setShowClearConfirm(true) : undefined}
            sendLabel="Створити переміщення"
            sendLoading={sendFlow.isSendingToDilovod || mov.isSaving}
            sendDisabled={mov.summaryItems.length === 0 || sendFlow.isSendingToDilovod || mov.isSaving}
            previewDisabled={mov.summaryItems.length === 0}
          />
        </>
      )}

      {pageTab === 'history' && (
        <MovementV2HistoryTab
          records={mov.history}
          loading={mov.historyLoading}
          pagination={mov.historyPagination}
          onPageChange={(page) => loadHistoryPage(page, mov.historyPagination.limit)}
          onLimitChange={(limit) => loadHistoryPage(1, limit)}
          onRefresh={() => loadHistoryPage(
            mov.historyPagination.page,
            mov.historyPagination.limit,
            true,
            true,
          )}
          onLoadRecord={async (record) => {
            await mov.loadHistoryRecordDetails(record, true);
          }}
          detailsLoading={mov.historyDetailsLoading}
          onEdit={openMovementEdit}
        />
      )}

      {pageTab === 'archive' && isAdmin() && (
        <MovementV2HistoryTab
          variant="archive"
          title="Архівні переміщення"
          emptyMessage="Немає видалених переміщень"
          records={mov.archiveSessions}
          loading={mov.archiveLoading}
          pagination={mov.archivePagination}
          onPageChange={(page) => void mov.loadArchive(page, mov.archivePagination.limit)}
          onLimitChange={(limit) => void mov.loadArchive(1, limit)}
          onRefresh={() => void mov.loadArchive(mov.archivePagination.page, mov.archivePagination.limit)}
        />
      )}

      <ConfirmModal
        isOpen={showClearConfirm}
        title="Очистити реєстр?"
        message="Усі позиції та незбережені зміни будуть видалені з форми."
        confirmText="Очистити"
        cancelText="Скасувати"
        confirmColor="danger"
        onConfirm={() => {
          mov.clearAll();
          setShowClearConfirm(false);
        }}
        onCancel={() => setShowClearConfirm(false)}
      />

      <PayloadPreviewModal
        isOpen={sendFlow.showPayloadPreview}
        onClose={() => sendFlow.setShowPayloadPreview(false)}
        payload={sendFlow.payloadPreview}
        title="Перегляд Payload переміщення (goodMoving)"
        isLoading={sendFlow.isLoadingPayload}
      />
    </div>
  );
}
