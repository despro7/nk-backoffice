import { useState, useEffect } from 'react';
import { useWarehouseReturns } from '../WarehouseReturns/useWarehouseReturns';
import useWarehouseParams from '../shared/useWarehouseParams';
import useWarehouseSurplus from './useWarehouseSurplus';
import { Tab, Card } from '@heroui/react';
import PageTabs from '@/components/PageTabs';
import ProductSearchPanel from '../WarehouseWriteOff/components/ProductSearchPanel';
import WriteOffItemsPanel from '../WarehouseWriteOff/components/WriteOffItemsPanel';
import ReasonSelector from '../WarehouseWriteOff/components/ReasonSelector';
import ActionsBar from '../WarehouseWriteOff/components/ActionsBar';
import WarehouseDetails from '../shared/WarehouseDetails';
import { WarehouseGoodDocumentHistoryTab } from '../shared/WarehouseGoodDocumentHistoryTab';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { ToastService } from '@/services/ToastService';
import { pluralize } from '@/lib';
import { useRoleAccess } from '@/hooks/useRoleAccess';

const SURPLUS_REASONS = [
  'Інвентаризація (надлишок)',
  'Знайдено на складі',
  'Коригування залишків',
  'Інше',
];

export default function WarehouseSurplus() {
  const returns = useWarehouseReturns();
  const surplus = useWarehouseSurplus({ returns });
  const [disabledSkus, setDisabledSkus] = useState<Record<string, boolean>>({});
  const [pageTab, setPageTab] = useState<'main' | 'history' | 'archive'>('main');
  const { isAdmin } = useRoleAccess();
  const [productSearchReset, setProductSearchReset] = useState(0);
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [comment, setComment] = useState('');
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [sendConfirmLoading, setSendConfirmLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [pendingForceDeleteId, setPendingForceDeleteId] = useState<string | null>(null);

  const { storages, selectedStorage, setSelectedStorage, selectedStorageName } = useWarehouseParams({
    returns,
    externalStorages: surplus.storages,
  });

  useEffect(() => {
    returns.loadAvailableFirms?.();
  }, []);

  const activeItems = (returns.items || []).filter(
    (item: any) => !(Array.isArray(item.availableBatches) && item.availableBatches.length === 0),
  );
  const hasActiveItems = activeItems.length > 0;

  const formatLocalDate = (date: Date): string => surplus.formatLocalDate(date);

  const clearAllInputs = () => {
    returns.resetAllState?.();
    surplus.setProductSearchResults?.([]);
    setDisabledSkus({});
    setProductSearchReset((c) => c + 1);
    surplus.cancelEdit?.();
  };

  const resolveReason = () => (reason === 'Інше' ? (customReason || reason) : reason);

  return (
    <div className="container">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">Оприбуткування надлишків товарів у Dilovod (пошук за назвою, SKU або ШК).</p>
      </div>

      <PageTabs
        className="mb-4"
        selectedKey={pageTab}
        onSelectionChange={(key) => {
          const tab = key as 'main' | 'history' | 'archive';
          setPageTab(tab);
          if (tab === 'history' && surplus.history.length === 0) {
            void surplus.loadHistory(1, surplus.historyPagination?.limit ?? 10, true);
          }
          if (tab === 'archive' && isAdmin() && surplus.archiveRecords.length === 0) {
            void surplus.loadArchive();
          }
        }}
      >
        <Tab key="main" title="Оприбуткування" />
        <Tab key="history" title="Історія" />
        {isAdmin() && <Tab key="archive" title="Архів" />}
      </PageTabs>

      {pageTab === 'main' && (
        <>
          <Card className="p-4 bg-white rounded-xl mb-6">
            <ProductSearchPanel
              writeoff={surplus as any}
              returns={returns}
              resetSignal={productSearchReset}
              variant="surplus"
            />
          </Card>

          <WarehouseDetails
            variant="surplus"
            returns={returns}
            storages={storages.length > 0 ? storages : surplus.storages}
            selectedStorage={selectedStorage}
            setSelectedStorage={setSelectedStorage}
          />

          {surplus.editingRecord && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Редагування запису історії
              {surplus.editingRecord.docNumber ? ` №${surplus.editingRecord.docNumber}` : ` #${surplus.editingRecord.id}`}.
              <button type="button" className="ml-3 underline" onClick={() => surplus.cancelEdit?.()}>Скасувати</button>
            </div>
          )}

          {returns.items && returns.items.length > 0 && (
            <>
              <WriteOffItemsPanel returns={returns} setDisabledSkus={setDisabledSkus} variant="surplus" />
              <ReasonSelector
                title="Причина оприбуткування"
                reasons={SURPLUS_REASONS}
                commentPlaceholder="Коментар до оприбуткування (необов'язково)"
                reason={reason}
                setReason={setReason}
                customReason={customReason}
                setCustomReason={setCustomReason}
                comment={comment}
                setComment={setComment}
              />
            </>
          )}

          <ActionsBar
            sendLabel={surplus.editingRecord ? 'Зберегти зміни' : 'Відправити'}
            onSend={async () => {
              if (!hasActiveItems) {
                ToastService.show({ title: 'Немає товарів для оприбуткування', color: 'warning' });
                return;
              }
              if (!reason.trim()) {
                ToastService.show({ title: 'Оберіть причину оприбуткування', color: 'warning' });
                return;
              }
              if (reason === 'Інше' && !customReason.trim()) {
                ToastService.show({ title: 'Вкажіть додаткову причину', color: 'warning' });
                return;
              }
              if (surplus.editingRecord) {
                try {
                  await surplus.saveEditedWriteOff({
                    items: activeItems,
                    comment,
                    reason: resolveReason(),
                    customReason,
                    firmId: returns.receiveFirmId ?? undefined,
                    storageId: selectedStorage ?? undefined,
                    date: returns.returnDate ? String(returns.returnDate) : formatLocalDate(new Date()),
                  });
                  ToastService.show({ title: 'Зміни збережено', color: 'success' });
                  setPageTab('history');
                } catch (err: any) {
                  ToastService.show({ title: 'Помилка збереження', description: err?.message, color: 'danger' });
                }
                return;
              }
              setShowSendConfirm(true);
            }}
            onCancel={() => setShowClearConfirm(true)}
            disabled={!hasActiveItems}
          />
        </>
      )}

      {pageTab === 'history' && (
        <WarehouseGoodDocumentHistoryTab
          recordType="surplus"
          records={surplus.history}
          loading={surplus.historyLoading}
          pagination={surplus.historyPagination}
          onPageChange={(page) => void surplus.loadHistory(page, surplus.historyPagination?.limit ?? 10)}
          onLimitChange={(limit) => void surplus.loadHistory(1, limit)}
          onRefresh={() => void surplus.loadHistory(
            surplus.historyPagination?.page ?? 1,
            surplus.historyPagination?.limit ?? 10,
            true,
            true,
          )}
          onLoadRecord={async (record) => {
            await surplus.loadHistoryRecordDetails?.(record, true);
          }}
          detailsLoading={surplus.historyDetailsLoading}
          onEditRecord={async (record) => {
            const full = await surplus.ensureHistoryRecordDetails?.(record);
            setReason(full.surplusReason || full.writeOffReason || '');
            setCustomReason(full.customReason || '');
            setComment(full.comment || '');
            if (full.storageId) setSelectedStorage(String(full.storageId));
            surplus.beginEdit(full);
            setPageTab('main');
          }}
          onDeleteRecord={async (recordId) => {
            try {
              const resp = await fetch(`/api/warehouse/surplus/history/${encodeURIComponent(recordId)}`, {
                method: 'DELETE',
                credentials: 'include',
              });
              const json = await resp.json().catch(() => ({}));
              if (resp.ok && json.success) {
                ToastService.show({ title: 'Запис видалено', color: 'success' });
                await surplus.loadHistory(
                  surplus.historyPagination?.page ?? 1,
                  surplus.historyPagination?.limit ?? 10,
                );
                return;
              }
              if (json?.canDeleteLocal) {
                setPendingForceDeleteId(recordId);
                return;
              }
              throw new Error(json?.error || `Delete failed ${resp.status}`);
            } catch (e: unknown) {
              const message = e instanceof Error ? e.message : String(e);
              ToastService.show({ title: 'Помилка видалення', description: message, color: 'danger' });
              throw e;
            }
          }}
        />
      )}

      {pageTab === 'archive' && isAdmin() && (
        <WarehouseGoodDocumentHistoryTab
          recordType="surplus"
          title="Архівні оприбуткування"
          emptyMessage="Архів порожній"
          records={surplus.archiveRecords}
          loading={surplus.archiveLoading}
          pagination={surplus.archivePagination}
          onPageChange={(page) => void surplus.loadArchive(page, surplus.archivePagination?.limit ?? 10)}
          onLimitChange={(limit) => void surplus.loadArchive(1, limit)}
          onRefresh={() => void surplus.loadArchive(
            surplus.archivePagination?.page ?? 1,
            surplus.archivePagination?.limit ?? 10,
          )}
          onLoadRecord={async (record) => {
            await surplus.loadHistoryRecordDetails?.(record, true);
          }}
          detailsLoading={surplus.historyDetailsLoading}
        />
      )}

      <ConfirmModal
        isOpen={!!pendingForceDeleteId}
        title="Видалити локальний запис?"
        message="Dilovod повідомив, що документ не знайдено. Видалити локальний запис історії оприбуткування?"
        confirmText="Видалити локально"
        cancelText="Скасувати"
        confirmColor="danger"
        onConfirm={async () => {
          if (!pendingForceDeleteId) return;
          try {
            const resp = await fetch(`/api/warehouse/surplus/history/${pendingForceDeleteId}?forceLocal=true`, {
              method: 'DELETE',
              credentials: 'include',
            });
            const json = await resp.json().catch(() => ({}));
            if (!resp.ok || !json.success) throw new Error(json?.error);
            ToastService.show({ title: 'Локальний запис видалено', color: 'success' });
            await surplus.loadHistory();
          } catch (err: any) {
            ToastService.show({ title: 'Помилка видалення', description: err?.message, color: 'danger' });
          } finally {
            setPendingForceDeleteId(null);
          }
        }}
        onCancel={() => setPendingForceDeleteId(null)}
      />

      <ConfirmModal
        isOpen={showSendConfirm}
        title="Підтвердіть відправку"
        message={`Оприбуткувати ${activeItems.length} ${pluralize(activeItems.length, 'товар', 'товари', 'товарів')}? Склад: ${selectedStorageName}.`}
        confirmText="Відправити"
        cancelText="Скасувати"
        confirmColor="primary"
        confirmLoading={sendConfirmLoading}
        onConfirm={async () => {
          setSendConfirmLoading(true);
          try {
            const resp = await surplus.requestSend({
              items: activeItems,
              comment,
              reason: resolveReason(),
              customReason,
              firmId: returns.receiveFirmId ?? undefined,
              storageId: selectedStorage ?? undefined,
              date: returns.returnDate ? String(returns.returnDate) : formatLocalDate(new Date()),
            });
            if (resp?.success) {
              ToastService.show({ title: 'Оприбуткування відправлено', color: 'success' });
              setShowSendConfirm(false);
              setShowClearConfirm(true);
            } else {
              ToastService.show({ title: 'Помилка', description: resp?.error || 'Не вдалося відправити', color: 'danger' });
            }
          } catch (err: any) {
            ToastService.show({ title: 'Помилка', description: err?.message, color: 'danger' });
          } finally {
            setSendConfirmLoading(false);
          }
        }}
        onCancel={() => setShowSendConfirm(false)}
      />

      <ConfirmModal
        isOpen={showClearConfirm}
        title="Очистити форму?"
        message="Очистити список товарів після успішного оприбуткування?"
        confirmText="Очистити"
        cancelText="Залишити"
        confirmColor="primary"
        onConfirm={() => {
          clearAllInputs();
          setShowClearConfirm(false);
        }}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}
