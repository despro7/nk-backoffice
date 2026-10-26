import React, { useCallback, useState } from 'react';
import { Tab } from '@heroui/react';
import PageTabs from '@/components/PageTabs';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import MovementV2EditorPanel from './components/MovementV2EditorPanel';
import MovementV2HistoryTab from './components/MovementV2HistoryTab';
import { WarehouseDocHistoryToolbarFilters } from '../shared/WarehouseDocHistoryToolbarFilters';
import useWarehouseMovementV2 from './useWarehouseMovementV2';
import { useMovementV2SendFlow } from './hooks/useMovementV2SendFlow';
import { useWarehouseDocumentEditDrawer } from '@/features/warehouse-document-edit/context/WarehouseDocumentEditDrawerContext';
import { ToastService } from '@/services/ToastService';

type PageTab = 'main' | 'history' | 'archive';

export default function WarehouseMovementV2Page() {
  const { isAdmin } = useRoleAccess();
  const mov = useWarehouseMovementV2();
  const { open: openDocumentEdit } = useWarehouseDocumentEditDrawer();

  const [pageTab, setPageTab] = useState<PageTab>('main');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const sendFacade = React.useMemo(() => ({
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

  const loadHistoryPage = useCallback((
    page: number,
    limit: number,
    sync = false,
    forceFullList = false,
  ) => {
    void mov.loadHistory(page, limit, sync, forceFullList, mov.historyFilters);
  }, [mov]);

  const openMovementEdit = useCallback((record: { dilovodDocId?: string | null; docNumber?: string | null; internalDocNumber?: string }) => {
    if (!record.dilovodDocId) return;
    openDocumentEdit({
      dilovodDocumentId: record.dilovodDocId,
      documentLabel: record.docNumber || record.internalDocNumber || record.dilovodDocId,
      documentTypeId: 'documents.goodMoving',
    });
  }, [openDocumentEdit]);

  return (
    <div className="container">
      <p className="text-sm text-default-500 mb-6">
        Формування переміщення між складами з підбором партій. Залишки та документ Діловода (`documents.goodMoving`) привʼязані до обраної дати переміщення.
      </p>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <PageTabs
          className="min-w-0"
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
          <WarehouseDocHistoryToolbarFilters
            className="w-full lg:w-auto lg:flex-1 lg:justify-end"
            filters={mov.historyFilters}
            onFiltersChange={(filters) => {
              mov.setHistoryFilters(filters);
              void mov.loadHistory(1, mov.historyPagination.limit, true, false, filters);
            }}
          />
        )}
      </div>

      {pageTab === 'main' && (
        <MovementV2EditorPanel
          mov={mov}
          sendFlow={sendFlow}
          showClearConfirm={showClearConfirm}
          onShowClearConfirm={setShowClearConfirm}
        />
      )}

      {pageTab === 'history' && (
        <MovementV2HistoryTab
          records={mov.history}
          loading={mov.historyLoading}
          pagination={mov.historyPagination}
          showHistoryFilters
          historyFilters={mov.historyFilters}
          onHistoryFiltersChange={(filters) => {
            mov.setHistoryFilters(filters);
            void mov.loadHistory(1, mov.historyPagination.limit, true, false, filters);
          }}
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
          onDeleteRecord={async (recordId) => {
            try {
              await mov.deleteHistoryRecord(recordId);
              ToastService.show({ title: 'Переміщення видалено', color: 'success' });
              loadHistoryPage(
                mov.historyPagination.page,
                mov.historyPagination.limit,
                true,
              );
            } catch (error) {
              ToastService.show({
                title: 'Не вдалося видалити',
                description: error instanceof Error ? error.message : undefined,
                color: 'danger',
              });
              throw error;
            }
          }}
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

    </div>
  );
}
