import { useEffect, useState, useCallback } from 'react';
import { Tab } from '@heroui/react';
import PageTabs from '@/components/PageTabs';
import { UnsavedChangesModal } from '@/components/modals/UnsavedChangesModal';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { useWarehouseMovement } from './useWarehouseMovement';
import { useMovementHistory } from './useMovementHistory';
import { useMovementDrafts } from './useMovementDrafts';
import { MovementTopActions } from './components/MovementTopActions';
import { MovementHistoryTab } from './components/MovementHistoryTab';
import { MovementDraftsTab } from './components/MovementDraftsTab';
import { MovementEditorView } from './components/MovementEditorView';
import { useMovementSendFlow } from './hooks/useMovementSendFlow';
import { useWarehouseDocumentEditDrawer } from '@/features/warehouse-document-edit/context/WarehouseDocumentEditDrawerContext';
import type { GoodMovingDocument } from '@shared/types/movement';

// ---------------------------------------------------------------------------
// WarehouseMovement — головна сторінка переміщення товарів
// ---------------------------------------------------------------------------

export default function WarehouseMovement() {
  const mov = useWarehouseMovement();
  const { getDrafts, deleteDraft } = mov;
  const { open: openDocumentEdit } = useWarehouseDocumentEditDrawer();

  const history = useMovementHistory();
  const draftsManager = useMovementDrafts(getDrafts, deleteDraft);
  const [activeTab, setActiveTab] = useState<'current' | 'drafts' | 'history'>('current');

  const sendFlow = useMovementSendFlow(mov, {
    onFinalized: async () => {
      draftsManager.loadDrafts();
    },
  });

  const guard = useUnsavedGuard({
    isDirty: mov.isDirty,
    onSaveDraft: sendFlow.sendAndFinalize,
  });

  const openMovementInDrawer = useCallback((doc: GoodMovingDocument) => {
    openDocumentEdit({
      dilovodDocumentId: doc.id,
      documentLabel: doc.id__pr || `Переміщення ${doc.number}`,
      documentTypeId: 'documents.goodMoving',
    });
  }, [openDocumentEdit]);

  useEffect(() => {
    if (activeTab === 'history' && history.documents.length === 0) {
      history.loadHistory();
    } else if (activeTab === 'drafts' && draftsManager.drafts.length === 0) {
      draftsManager.loadDrafts();
    }
  }, [activeTab]);

  return (
    <div className="container">
      <div className="flex flex-col gap-8 pb-12 w-full">
        <div className="flex items-center gap-4 justify-between">
          <PageTabs
            selectedKey={activeTab}
            onSelectionChange={(key) => {
              setActiveTab(key as 'current' | 'drafts' | 'history');
            }}
          >
            <Tab key="current" title="Поточні переміщення" />
            <Tab key="drafts" title="Чернетки" />
            <Tab key="history" title="Історія" />
          </PageTabs>

          {activeTab === 'current' && (
            <MovementTopActions
              onRefreshBalances={guard.guardAction(
                () => mov.handleSyncBalances('now', mov.selectedDateTime),
                {
                  message: 'Ви маєте незбережені зміни. Зберегти перед оновленням товарів?',
                  saveText: 'Зберегти і оновити',
                  leaveText: 'Оновити без збереження',
                  cancelText: 'Скасувати',
                  modalSize: 'xl',
                },
              )}
              onSyncFromDilovod={guard.guardAction(mov.handleSyncStockFromDilovod, {
                message: 'Ви маєте незбережені зміни. Зберегти перед синхронізацією з Діловодом?',
                saveText: 'Зберегти і синхронізувати',
                leaveText: 'Синхронізувати без збереження',
                cancelText: 'Скасувати',
                modalSize: '2xl',
              })}
            />
          )}
        </div>

        {activeTab === 'current' && (
          <MovementEditorView mov={mov} sendFlow={sendFlow} />
        )}

        {activeTab === 'drafts' && (
          <MovementDraftsTab
            drafts={draftsManager.drafts}
            loading={draftsManager.loading}
            onRefresh={draftsManager.loadDrafts}
            onLoadDraft={async (draft) => {
              await mov.loadDraftObject(draft, { storage: mov.storage, storageTo: mov.storageTo }, mov.products);
              setActiveTab('current');
            }}
            onDeleteDraft={draftsManager.removeDraft}
          />
        )}

        {activeTab === 'history' && (
          <MovementHistoryTab
            documents={history.documents}
            loading={history.loading}
            onRefresh={history.refresh}
            onLoadDetails={history.loadDetails}
            onRefreshDetails={history.refreshDetails}
            detailsLoading={history.detailsLoading}
            datePreset={history.datePreset}
            selectedMonth={history.selectedMonth}
            onChangeDatePreset={history.changeDatePreset}
            onChangeMonth={history.changeMonth}
            onEditMovement={async (doc) => {
              openMovementInDrawer(doc);
            }}
          />
        )}
      </div>

      <UnsavedChangesModal {...guard.modalProps} />
    </div>
  );
}
