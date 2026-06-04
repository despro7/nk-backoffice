import React from 'react';
import { Tab, Card } from '@heroui/react';
import PageTabs from '@/components/PageTabs';
import useReleaseSets from './useReleaseSets';
import SetSearchPanel from './components/SetSearchPanel';
import ReleaseItemsPanel from './components/ReleaseItemsPanel';
import ReleaseHistoryTab from './components/ReleaseHistoryTab';
import WarehouseDetails from '../shared/WarehouseDetails';
import ActionsBar from './components/ActionsBar';
import { useDebug } from '@/contexts/DebugContext';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PayloadPreviewModal } from '@/components/modals/PayloadPreviewModal';
import { ToastService } from '@/services/ToastService';

export default function ReleaseSetsPage() {
  const { isDebugMode } = useDebug();
  const { isAdmin } = useRoleAccess();
  const rs = useReleaseSets();
  const [pageTab, setPageTab] = React.useState<'main'|'history'>('main');
  const [showPayloadPreview, setShowPayloadPreview] = React.useState(false);
  const [payloadPreview, setPayloadPreview] = React.useState<Record<string, any> | null>(null);
  const [isLoadingPayload, setIsLoadingPayload] = React.useState(false);

  const handleShowPayloadPreview = async () => {
    setIsLoadingPayload(true);
    try {
      const resp = await rs.buildPreview();
      if (resp) {
        setPayloadPreview(resp);
        setShowPayloadPreview(true);
        return;
      }
      throw new Error('Не вдалось сформувати preview');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Помилка при формуванні preview';
      ToastService.show({ title: 'Помилка preview', description: message, color: 'danger' });
      setPayloadPreview(null);
      setShowPayloadPreview(false);
    } finally {
      setIsLoadingPayload(false);
    }
  };

  return (
    <div className="container">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">Інтерфейс для випуску наборів (фіксує snapshot компонентів).</p>
      </div>

      <PageTabs selectedKey={pageTab} onSelectionChange={(k) => setPageTab(k as any)}>
        <Tab key="main" title="Випуск" />
        <Tab key="history" title="Історія" />
      </PageTabs>

      {pageTab === 'main' && (
        <>
          <div className="text-base font-semibold text-gray-700 mt-1 mb-2">Пошук наборів</div>
          <Card className="p-4 bg-white rounded-xl mb-6">
            <SetSearchPanel onSelect={(s) => rs.addSet(s)} existingItems={rs.items} />
          </Card>
        
          <WarehouseDetails returns={rs.returns} storages={rs.storages} selectedStorage={rs.selectedStorage} setSelectedStorage={rs.setSelectedStorage} />

          {rs.items.length > 0 && (
            <ReleaseItemsPanel items={rs.items} onChange={rs.updateItem} onRemove={rs.removeItem} selectedStorage={rs.selectedStorageName ?? rs.selectedStorage} returns={rs.returns} />
          )}

          <ActionsBar
            onPreview={isDebugMode && isAdmin() ? handleShowPayloadPreview : undefined}
            onSend={rs.requestSend}
            onCancel={rs.clearAll}
            disabled={rs.items.length === 0}
          />
        </>
      )}

      {pageTab === 'history' && (
        <ReleaseHistoryTab records={rs.history} loading={rs.historyLoading} onRefresh={rs.loadHistory} onDelete={rs.deleteRecord} />
      )}

      <PayloadPreviewModal
        isOpen={showPayloadPreview}
        onClose={() => setShowPayloadPreview(false)}
        payload={payloadPreview}
        title="Перегляд Payload випуску"
        isLoading={isLoadingPayload}
      />
    </div>
  );
}
