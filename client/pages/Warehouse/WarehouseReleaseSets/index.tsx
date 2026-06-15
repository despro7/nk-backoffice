import React from 'react';
import { Tab, Card, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from '@heroui/react';
import PageTabs from '@/components/PageTabs';
import useReleaseSets from './useReleaseSets';
import SetSearchPanel from './components/SetSearchPanel';
import ReleaseItemsPanel from './components/ReleaseItemsPanel';
import ReleaseHistoryTab from './components/ReleaseHistoryTab';
import WarehouseDetails from '../shared/WarehouseDetails';
import ActionsBar from './components/ActionsBar';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { useDebug } from '@/contexts/DebugContext';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PayloadPreviewModal } from '@/components/modals/PayloadPreviewModal';
import { ToastService } from '@/services/ToastService';

export default function ReleaseSetsPage() {
  const { isDebugMode } = useDebug();
  const { isAdmin } = useRoleAccess();
  const rs = useReleaseSets();
  const [pageTab, setPageTab] = React.useState<'main'|'history'|'archive'>('main');
  const [showPayloadPreview, setShowPayloadPreview] = React.useState(false);
  const [payloadPreview, setPayloadPreview] = React.useState<Record<string, any> | null>(null);
  const [isLoadingPayload, setIsLoadingPayload] = React.useState(false);
  const [showSendConfirm, setShowSendConfirm] = React.useState(false);
  const [isSendingRelease, setIsSendingRelease] = React.useState(false);
  const [sendResult, setSendResult] = React.useState<Record<string, any> | null>(null);
  const [sendSnapshot, setSendSnapshot] = React.useState<any | null>(null);
  const [pendingForceDeleteId, setPendingForceDeleteId] = React.useState<string | null>(null);
  const [isForceDeleting, setIsForceDeleting] = React.useState(false);

  const selectedSet = sendSnapshot ?? rs.items[0] ?? null;
  const selectedSetRemark = selectedSet ? (rs.buildSetRemark?.(selectedSet) ?? null) : null;
  const selectedSetQuantity = Number(selectedSet?.quantity ?? 0);
  const selectedSetComponentCount = Array.isArray(selectedSet?.componentsSnapshot) ? selectedSet.componentsSnapshot.length : 0;

  const handleOpenSendConfirm = () => {
    if (rs.items.length === 0) {
      return;
    }

    setSendSnapshot(rs.items[0]);
    setSendResult(null);
    setShowSendConfirm(true);
  };

  const handleConfirmSend = async () => {
    setIsSendingRelease(true);
    try {
      const result = await rs.requestSend();
      setSendResult(result ?? null);
      if (result?.success) {
        setSendSnapshot((current) => current ?? rs.items[0] ?? null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Невідома помилка';
      setSendResult({ success: false, error: message });
    } finally {
      setIsSendingRelease(false);
    }
  };

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

      <PageTabs selectedKey={pageTab} onSelectionChange={(k) => {
        const tab = k as 'main' | 'history' | 'archive';
        setPageTab(tab);
        if (tab === 'history' && rs.history.length === 0) {
          void rs.loadHistory();
        }
        if (tab === 'archive' && rs.archiveSessions.length === 0) {
          void rs.loadArchive();
        }
      }}>
        <Tab key="main" title="Випуск" />
        <Tab key="history" title="Історія" />
        {isAdmin() && <Tab key="archive" title="Архів" />}
      </PageTabs>

      {pageTab === 'main' && (
        <>
          <div className="text-base font-semibold text-gray-700 mt-1 mb-2">Пошук наборів</div>
          <Card className="p-4 bg-white rounded-xl mb-6">
            <SetSearchPanel onSelect={(s) => rs.addSet(s)} existingItems={rs.items} />
          </Card>
        
          <WarehouseDetails returns={rs.returns} storages={rs.storages} selectedStorage={rs.selectedStorage} setSelectedStorage={rs.setSelectedStorage} />

          {rs.items.length > 0 && (
            <ReleaseItemsPanel
              items={rs.items}
              onChange={rs.updateItem}
              onRemove={rs.removeItem}
              selectedStorage={rs.selectedStorageName ?? rs.selectedStorage}
              smallStorageId={rs.defaultSmallStorageId}
              returns={rs.returns}
            />
          )}

          <ActionsBar
            onPreview={isDebugMode && isAdmin() ? handleShowPayloadPreview : undefined}
            onSend={handleOpenSendConfirm}
            onCancel={rs.clearAll}
            disabled={rs.items.length === 0}
          />
        </>
      )}

      {pageTab === 'history' && (
        <ReleaseHistoryTab
          records={rs.history}
          loading={rs.historyLoading}
          onRefresh={rs.loadHistory}
          onDelete={async (recordId: number) => {
            try {
              const result = await rs.deleteRecord(recordId);
              if (result.ok && result.json?.success) {
                ToastService.show({ title: 'Запис видалено', color: 'success' });
                await rs.loadHistory();
                return;
              }

              if (result.json?.canDeleteLocal) {
                setPendingForceDeleteId(String(recordId));
                return;
              }

              throw new Error(result.json?.error || `Delete failed ${result.status}`);
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Невідома помилка';
              ToastService.show({ title: 'Помилка видалення', description: message, color: 'danger' });
            }
          }}
        />
      )}

      {pageTab === 'archive' && isAdmin() && (
        <ReleaseHistoryTab
          title="Архівні випуски"
          emptyMessage="Немає видалених випусків"
          records={rs.archiveSessions}
          loading={rs.archiveLoading}
          onRefresh={rs.loadArchive}
        />
      )}

      <ConfirmModal
        isOpen={!!pendingForceDeleteId}
        title="Видалити локальний запис?"
        message="Діловод повідомив, що документ не знайдено. Позначити локальний запис історії як deleted?"
        confirmText="Позначити як deleted"
        cancelText="Скасувати"
        confirmColor="danger"
        confirmLoading={isForceDeleting}
        onConfirm={async () => {
          if (!pendingForceDeleteId) return;
          setIsForceDeleting(true);
          try {
            const result = await rs.deleteRecord(Number(pendingForceDeleteId), true);
            if (!result.ok || !result.json?.success) {
              throw new Error(result.json?.error || `Delete failed ${result.status}`);
            }
            ToastService.show({ title: 'Запис позначено як deleted', color: 'success' });
            await rs.loadHistory();
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Невідома помилка';
            ToastService.show({ title: 'Не вдалося видалити локальний запис', description: message, color: 'danger' });
          } finally {
            setIsForceDeleting(false);
            setPendingForceDeleteId(null);
          }
        }}
        onCancel={() => setPendingForceDeleteId(null)}
      />

      <PayloadPreviewModal
        isOpen={showPayloadPreview}
        onClose={() => setShowPayloadPreview(false)}
        payload={payloadPreview}
        title="Перегляд Payload випуску"
        isLoading={isLoadingPayload}
      />

      <Modal
        isOpen={showSendConfirm}
        onClose={() => {
          if (isSendingRelease) {
            return;
          }
          setShowSendConfirm(false);
          setSendResult(null);
          setSendSnapshot(null);
        }}
        size="lg"
        backdrop="blur"
        scrollBehavior="inside"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="text-xl font-semibold">Підтвердження випуску</div>
                <div className="text-sm font-normal text-gray-500">Перевірте короткий підсумок перед відправкою.</div>
              </ModalHeader>

              <ModalBody className="gap-4">
                {selectedSet ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 space-y-2">
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-500">Набір</span>
                      <span className="font-semibold text-gray-900 text-right">{selectedSet.name || selectedSet.title || selectedSet.setSku || selectedSet.sku}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-500">Кількість</span>
                      <span className="font-semibold text-gray-900">{selectedSetQuantity} шт.</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-500">Компонентів у наборі</span>
                      <span className="font-semibold text-gray-900">{selectedSetComponentCount}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-500">Склад</span>
                      <span className="font-semibold text-gray-900 text-right">{rs.selectedStorageName ?? rs.selectedStorage ?? '—'}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-500">Примітка</span>
                      <span className="font-semibold text-gray-900 text-right">{selectedSetRemark ?? '—'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
                    Немає набору для підтвердження.
                  </div>
                )}

                {sendResult && (
                  <div
                    className={`rounded-xl border p-4 text-sm ${sendResult.success ? 'border-lime-500/50 bg-lime-200 text-lime-800' : 'border-red-300/75 bg-red-200/80 text-red-900'}`}
                  >
                    <div className="text-lg font-semibold mb-2">
                      {sendResult.success ? 'Відправка успішно виконана!' : 'Відправка не вдалася'}
                    </div>
                    <div className="space-y-1">
                      <div className="opacity-80">Оновлення залишків: {sendResult.stockSyncTriggered ? 'запущено' : 'не запущено'}</div>
                      {sendResult.error && <div>Помилка: {sendResult.error}</div>}
                      {sendResult.errorFallback && <div>Деталі: {sendResult.errorFallback}</div>}
                    </div>
                  </div>
                )}
              </ModalBody>

              <ModalFooter className="gap-2">
                <Button
                  variant="light"
                  color="default"
                  onPress={() => {
                    if (isSendingRelease) {
                      return;
                    }
                    onClose();
                    setSendResult(null);
                    setSendSnapshot(null);
                  }}
                  isDisabled={isSendingRelease}
                >
                  {sendResult?.success ? 'Закрити' : 'Скасувати'}
                </Button>
                {!sendResult?.success && (
                  <Button
                    color="primary"
                    onPress={handleConfirmSend}
                    isLoading={isSendingRelease}
                    isDisabled={isSendingRelease || !selectedSet}
                  >
                    Відправити
                  </Button>
                )}
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
