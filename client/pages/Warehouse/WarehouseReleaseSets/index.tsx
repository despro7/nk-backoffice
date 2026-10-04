import React from 'react';
import { Tabs, Tab, Card, Button, Switch } from '@heroui/react';
import PageTabs from '@/components/PageTabs';
import useReleaseSets from './useReleaseSets';
import SetSearchPanel from './components/SetSearchPanel';
import ReleaseItemsPanel from './components/ReleaseItemsPanel';
import ReleaseHistoryTab from './components/ReleaseHistoryTab';
import WarehouseDetails from '../shared/WarehouseDetails';
import ActionsBar from './components/ActionsBar';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { useDebug } from '@/contexts/debug-context';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PayloadPreviewModal } from '@/components/modals/PayloadPreviewModal';
import { ToastService } from '@/services/ToastService';
import ReleaseSendConfirmModal from './components/ReleaseSendConfirmModal';
import {
  buildCorrectionUnkitSummary,
  buildKitSendSummary,
  formatCorrectionBatchDateLabel,
  type ReleaseConfirmMode,
} from './releaseConfirmCopy';
import type { KitOutputBatchInfo, ReleaseSendSummary } from '@shared/types/warehouseRelease';

type PendingSimpleConfirm =
  | { type: 'correctionOn' }
  | { type: 'correctionOff' }
  | { type: 'operationChange'; nextKey: 'goodKit' | 'goodUnKit' }
  | { type: 'fillBatches'; sku: string };

export default function ReleaseSetsPage() {
  const { isDebugMode } = useDebug();
  const { isAdmin } = useRoleAccess();
  const rs = useReleaseSets();
  const [operDate, setOperDate] = React.useState<string | null>(null);
  const [pageTab, setPageTab] = React.useState<'main' | 'history' | 'archive'>('main');
  const [showPayloadPreview, setShowPayloadPreview] = React.useState(false);
  const [payloadPreview, setPayloadPreview] = React.useState<Record<string, any> | null>(null);
  const [isLoadingPayload, setIsLoadingPayload] = React.useState(false);
  const [showSendConfirm, setShowSendConfirm] = React.useState(false);
  const [isSendingRelease, setIsSendingRelease] = React.useState(false);
  const [sendResult, setSendResult] = React.useState<Record<string, any> | null>(null);
  const [sendSnapshot, setSendSnapshot] = React.useState<any | null>(null);
  const [pendingForceDeleteId, setPendingForceDeleteId] = React.useState<string | null>(null);
  const [isForceDeleting, setIsForceDeleting] = React.useState(false);
  const [showClearConfirm, setShowClearConfirm] = React.useState(false);
  const [pendingSimpleConfirm, setPendingSimpleConfirm] = React.useState<PendingSimpleConfirm | null>(null);
  const [isSimpleConfirmBusy, setIsSimpleConfirmBusy] = React.useState(false);
  const [searchResetSignal, setSearchResetSignal] = React.useState(0);
  const [kitOutputBatchPreview, setKitOutputBatchPreview] = React.useState<KitOutputBatchInfo | null>(null);
  const [isKitBatchPreviewLoading, setIsKitBatchPreviewLoading] = React.useState(false);

  React.useEffect(() => {
    if (!rs.suggestedOperDate) return;
    setOperDate(rs.suggestedOperDate);
  }, [rs.suggestedOperDate]);

  const releaseReturns = React.useMemo(() => ({
    ...rs.returns,
    operDate,
    setOperDate: (value: string | null) => {
      setOperDate(value);
      rs.returns?.setReturnDate?.(value);
    },
  }), [rs.returns, operDate]);

  const isUnKitOperation = rs.operationKey === 'goodUnKit';
  const operationItemsLabel = rs.correctionMode
    ? (isUnKitOperation ? 'Крок 2: розукомплектування після перерахунку' : 'Крок 1: збір партій у інвентаризаційний набір')
    : (isUnKitOperation ? 'Набори для розукомплектування' : 'Набори для комплектування');
  const operationTotalLabel = isUnKitOperation ? 'до повернення на' : 'до списання з';
  const operationEmptyLabel = isUnKitOperation ? 'Немає компонентів для повернення' : 'Немає компонентів для списання';
  const sendButtonLabel = isUnKitOperation ? 'Створити розукомплектування' : 'Створити комплектування';
  const payloadPreviewTitle = isUnKitOperation ? 'Перегляд Payload розукомплектування' : 'Перегляд Payload комплектування';
  const releaseDateLabel = isUnKitOperation ? 'Дата розукомплектування' : 'Дата комплектування';

  const selectedSet = sendSnapshot ?? rs.items[0] ?? null;
  const selectedReleaseDate = operDate ?? rs.returns?.returnDate ?? null;

  const sendMode: ReleaseConfirmMode = rs.correctionMode
    ? (isUnKitOperation ? 'correctionUnkit' : 'correctionKit')
    : (isUnKitOperation ? 'unkit' : 'kit');

  const sendSummary = React.useMemo<ReleaseSendSummary | null>(() => {
    if (!selectedSet) return null;

    const components = rs.previewComponents.map((component) => ({
      sku: component.sku,
      name: component.name,
      quantity: Number(component.quantity ?? 0),
      allocatedQuantity: Number(component.allocatedQuantity ?? 0),
      batches: rs.componentBatches.find((allocation) => allocation.sku === component.sku)?.batches ?? component.batches ?? [],
    }));

    if (sendMode === 'correctionUnkit') {
      return buildCorrectionUnkitSummary({
        setSku: selectedSet.setSku,
        setName: selectedSet.name,
        quantity: Number(selectedSet.quantity ?? 0),
        storageId: rs.selectedStorage,
        storageName: rs.selectedStorageName,
        operDate: selectedReleaseDate,
        remark: rs.buildSetRemark?.(selectedSet) ?? null,
        components,
        expectedTotal: rs.correctionUnkitDiff.expected,
        countedTotal: rs.correctionUnkitDiff.counted,
        surplusBatchName: rs.correctionUnkitDiff.surplus > 0 ? formatCorrectionBatchDateLabel() : null,
      });
    }

    return buildKitSendSummary({
      setSku: selectedSet.setSku,
      setName: selectedSet.name,
      quantity: Number(selectedSet.quantity ?? 0),
      storageId: rs.selectedStorage,
      storageName: rs.selectedStorageName,
      operDate: selectedReleaseDate,
      remark: rs.buildSetRemark?.(selectedSet) ?? null,
      components,
      kitOutputBatch: kitOutputBatchPreview,
    });
  }, [
    selectedSet,
    rs.previewComponents,
    rs.componentBatches,
    rs.selectedStorage,
    rs.selectedStorageName,
    selectedReleaseDate,
    rs.correctionUnkitDiff,
    sendMode,
    rs.buildSetRemark,
    kitOutputBatchPreview,
  ]);

  const sendWarnings = React.useMemo(() => {
    const warnings: string[] = [];
    for (const component of rs.previewComponents) {
      const allocated = Number(component.allocatedQuantity ?? 0);
      const required = Number(component.quantity ?? 0);
      if (allocated > 0 && Math.abs(allocated - required) > 0.0001) {
        warnings.push(`${component.sku}: обрано ${allocated} / потрібно ${required}`);
      }
      if (allocated === 0) {
        warnings.push(`${component.sku}: партії не вказані`);
      }
    }
    return warnings;
  }, [rs.previewComponents]);

  const sendDisabled = !rs.areComponentBatchesComplete
    || (sendMode === 'correctionUnkit' && rs.correctionUnkitDiff.shortage > 0)
    || (sendMode === 'kit' && isKitBatchPreviewLoading);

  const hasUnsavedData = rs.items.length > 0
    || rs.componentBatches.length > 0
    || Boolean(rs.returns?.comment)
    || Boolean(selectedReleaseDate);

  const resetTransientUi = () => {
    setShowPayloadPreview(false);
    setPayloadPreview(null);
    setIsLoadingPayload(false);
    setShowSendConfirm(false);
    setSendResult(null);
    setSendSnapshot(null);
    setPendingForceDeleteId(null);
    setIsForceDeleting(false);
  };

  const handleOperationChange = (key: string) => {
    const nextKey = key === 'goodUnKit' ? 'goodUnKit' : 'goodKit';
    if (nextKey === rs.operationKey) return;

    if (hasUnsavedData) {
      setPendingSimpleConfirm({ type: 'operationChange', nextKey });
      return;
    }

    rs.setOperationKey(nextKey);
    setOperDate(null);
    resetTransientUi();
  };

  const handleCorrectionSwitch = (enabled: boolean) => {
    if (enabled === rs.correctionMode) return;

    if (enabled) {
      setPendingSimpleConfirm({ type: 'correctionOn' });
      return;
    }

    if (hasUnsavedData) {
      setPendingSimpleConfirm({ type: 'correctionOff' });
      return;
    }

    rs.setCorrectionMode(false);
    setSearchResetSignal((value) => value + 1);
  };

  const handleProductSelect = (product: any) => {
    if (rs.correctionMode && rs.operationKey === 'goodKit') {
      void rs.selectCorrectionProduct(product).catch((error) => {
        const message = error instanceof Error ? error.message : 'Невідома помилка';
        ToastService.show({ title: 'Помилка', description: message, color: 'danger' });
      });
      return;
    }
    void rs.addSet(product);
  };

  const handleOpenSendConfirm = () => {
    if (rs.items.length === 0) return;
    setSendSnapshot(rs.items[0]);
    setSendResult(null);
    setKitOutputBatchPreview(null);
    setShowSendConfirm(true);

    if (sendMode === 'kit') {
      setIsKitBatchPreviewLoading(true);
      void rs.previewKitOutputBatch()
        .then((preview) => setKitOutputBatchPreview(preview))
        .catch(() => setKitOutputBatchPreview(null))
        .finally(() => setIsKitBatchPreviewLoading(false));
    }
  };

  const handleConfirmSend = async () => {
    setIsSendingRelease(true);
    try {
      const createSurplus = sendMode === 'correctionUnkit' && rs.correctionUnkitDiff.surplus > 0;
      const result = await rs.requestSend({
        createSurplusBatch: createSurplus,
        surplusQuantity: createSurplus ? rs.correctionUnkitDiff.surplus : undefined,
        surplusGoodId: createSurplus ? rs.correctionSourceGoodId : null,
      });
      setSendResult(result ?? null);
      if (result?.success) {
        const snapshot = sendSnapshot ?? rs.items[0] ?? null;
        const isCorrectionKitStep = rs.correctionMode && rs.operationKey === 'goodKit';

        if (isCorrectionKitStep && snapshot) {
          const shiftedDate = rs.transitionToCorrectionUnkitStep(snapshot, operDate ?? rs.returns?.returnDate);
          if (shiftedDate) {
            setOperDate(shiftedDate);
          } else if (!operDate && rs.returns?.returnDate) {
            setOperDate(rs.returns.returnDate);
          }
          ToastService.show({
            title: 'Комплектування створено',
            description: 'Перейдіть до кроку 2 — розукомплектування.',
            color: 'success',
          });
          setShowSendConfirm(false);
          setSendResult(null);
          setSendSnapshot(null);
        } else {
          setSendSnapshot(snapshot);
        }
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

  const handleConfirmClearAll = () => {
    setShowClearConfirm(false);
    rs.clearAll();
    setOperDate(null);
    resetTransientUi();
  };

  const handleSimpleConfirm = async () => {
    if (!pendingSimpleConfirm) return;
    setIsSimpleConfirmBusy(true);

    try {
      switch (pendingSimpleConfirm.type) {
        case 'correctionOn':
          rs.setCorrectionMode(true);
          rs.setOperationKey('goodKit');
          setSearchResetSignal((value) => value + 1);
          break;
        case 'correctionOff':
          rs.resetCorrectionState();
          setOperDate(null);
          setSearchResetSignal((value) => value + 1);
          resetTransientUi();
          break;
        case 'operationChange':
          rs.setOperationKey(pendingSimpleConfirm.nextKey);
          rs.clearAll();
          setOperDate(null);
          resetTransientUi();
          break;
        case 'fillBatches': {
          const result = await rs.applyFillBatches(pendingSimpleConfirm.sku);
          ToastService.show({
            title: 'Партії додано',
            description: `Підставлено ${result.batchCount} партій (${result.totalQuantity} порцій)`,
            color: 'success',
          });
          break;
        }
        default:
          break;
      }
      setPendingSimpleConfirm(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Невідома помилка';
      ToastService.show({ title: 'Помилка', description: message, color: 'danger' });
    } finally {
      setIsSimpleConfirmBusy(false);
    }
  };

  const simpleConfirmCopy = React.useMemo(() => {
    if (!pendingSimpleConfirm) return null;

    switch (pendingSimpleConfirm.type) {
      case 'correctionOn':
        return {
          title: 'Увімкнути коригування партійного обліку?',
          message: 'Спочатку буде комплектування: усі партії зберуться в технічний набір `{sku}_rebatch`. Потім крок 2 — розукомплектування з розкладкою по порахованих партіях.',
          confirmText: 'Увімкнути',
        };
      case 'correctionOff':
        return {
          title: 'Вийти з режиму коригування?',
          message: 'Поточні дані форми буде очищено.',
          confirmText: 'Вийти',
        };
      case 'operationChange':
        return {
          title: 'Змінити тип операції?',
          message: 'Введені набори та партії буде скинуто.',
          confirmText: 'Змінити',
        };
      case 'fillBatches': {
        const storageName = rs.selectedStorageName ?? rs.selectedStorage ?? '—';
        const productName =
          rs.previewComponents.find((component) => component.sku === pendingSimpleConfirm.sku)?.name
          ?? rs.previewComponents[0]?.name
          ?? rs.items[0]?.name
          ?? pendingSimpleConfirm.sku;
        return {
          title: 'Додати всі партії з залишком?',
          message: (
            <p>
              Буде підставлено всі партії товару{' '}
              <span className="font-semibold">{productName}</span>
              {' '}<span className="text-xs text-gray-600 bg-amber-200/50 px-1 py-0.5 rounded">{productName !== pendingSimpleConfirm.sku ? ` SKU: ${pendingSimpleConfirm.sku}` : null}</span>
              {' '}зі складу <span className="font-semibold">{`«${storageName}»`}</span>
              {' '}(найбільші залишки першими).
              Ви зможете відредагувати їх перед відправкою.
            </p>
          ),
          confirmText: 'Додати',
        };
      }
      default:
        return null;
    }
  }, [pendingSimpleConfirm, rs.items, rs.previewComponents, rs.selectedStorage, rs.selectedStorageName]);

  const correctionSourceSku = rs.correctionSourceSku ?? rs.previewComponents[0]?.sku ?? null;

  return (
    <div className="container">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">
          Інтерфейс для комплектування готових наборів та їх розукомплектування. При комплектуванні наборів зі складу списується відповідна кількість компонентів набору. При розукомплектуванні наборів компоненти повертаються на склад.
        </p>
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <PageTabs className="flex-1" selectedKey={pageTab} onSelectionChange={(key) => {
          const tab = key as 'main' | 'history' | 'archive';
          setPageTab(tab);
          if (tab === 'history' && rs.history.length === 0) {
            void rs.loadHistory();
          }
          if (tab === 'archive' && rs.archiveSessions.length === 0) {
            void rs.loadArchive();
          }
        }}>
          <Tab key="main" title="Комплектація" />
          <Tab key="history" title="Історія" />
          {isAdmin() && <Tab key="archive" title="Архів" />}
        </PageTabs>

        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
          <Switch
            size="sm"
            isSelected={rs.correctionMode}
            onValueChange={handleCorrectionSwitch}
            classNames={{
              wrapper: 'group-data-[selected=true]:bg-blue-500!',
            }}
          >
            Коригування партійного обліку
          </Switch>
        </div>
      </div>

      {pageTab === 'main' && (
        <>
          <div className="text-base font-semibold text-gray-700 mt-1 mb-2">{operationItemsLabel}</div>
          <Card className="p-4 bg-white rounded-xl mb-6">
            <Tabs
              aria-label="Тип операції"
              size="lg"
              fullWidth
              selectedKey={rs.operationKey}
              onSelectionChange={handleOperationChange}
              classNames={{
                base: 'mb-6',
                cursor: rs.correctionMode ? 'bg-blue-500' : 'bg-white',
                tab: 'h-12 font-medium group [&>div]:flex [&>div]:items-center [&>div]:gap-1',
                tabContent: rs.correctionMode
                  ? 'group-data-[selected=true]:text-white text-blue-800 [&_svg]:group-data-[selected=true]:text-white'
                  : undefined,
                tabList: rs.correctionMode ? 'bg-blue-100' : undefined,
              }}
            >
              <Tab key="goodKit" title={<><DynamicIcon name="package" size={20} strokeWidth={1.5} />Комплектування</>} />
              <Tab key="goodUnKit" title={<><DynamicIcon name="package-open" size={20} strokeWidth={1.5} />Розукомплектування</>} />
            </Tabs>

            <SetSearchPanel
              onSelect={handleProductSelect}
              onItemChange={rs.updateItem}
              onItemRemove={rs.removeItem}
              existingItems={rs.items}
              resetSignal={searchResetSignal}
              operationKey={rs.operationKey}
              correctionMode={rs.correctionMode}
              selectedStorage={rs.selectedStorage}
              defaultSmallStorageId={rs.defaultSmallStorageId}
              showAvailableQuantity={isUnKitOperation}
            />

          </Card>

          <WarehouseDetails
            returns={releaseReturns}
            storages={rs.storages}
            selectedStorage={rs.selectedStorage}
            setSelectedStorage={rs.setSelectedStorage}
            dateStateKey="operDate"
            dateLabel={releaseDateLabel}
          />

          {rs.items.length > 0 && (
            <ReleaseItemsPanel
              items={rs.items}
              selectedStorage={rs.selectedStorage}
              selectedStorageName={rs.selectedStorageName}
              smallStorageId={rs.defaultSmallStorageId}
              returns={releaseReturns}
              summaryLabel={operationTotalLabel}
              emptyMessage={operationEmptyLabel}
              operationKey={rs.operationKey}
              componentBatches={rs.componentBatches}
              onComponentBatchesChange={rs.setComponentBatches}
              previewComponents={rs.previewComponents}
              lastKitPrefillInfo={rs.lastKitPrefillInfo}
              correctionMode={rs.correctionMode}
              correctionStep={rs.correctionStep}
              onFillAllBatches={
                rs.correctionMode && rs.correctionStep === 1 && correctionSourceSku
                  ? () => setPendingSimpleConfirm({ type: 'fillBatches', sku: correctionSourceSku })
                  : undefined
              }
            />
          )}

          <ActionsBar
            onPreview={isDebugMode && isAdmin() ? handleShowPayloadPreview : undefined}
            onSend={handleOpenSendConfirm}
            onCancel={rs.items.length > 0 ? () => setShowClearConfirm(true) : undefined}
            sendLabel={sendButtonLabel}
            sendDisabled={rs.items.length === 0 || sendDisabled}
            previewDisabled={rs.items.length === 0}
          />
        </>
      )}

      {pageTab === 'history' && (
        <ReleaseHistoryTab
          records={rs.history}
          loading={rs.historyLoading}
          pagination={rs.historyPagination}
          onPageChange={(page) => void rs.loadHistory(page, rs.historyPagination.limit)}
          onLimitChange={(limit) => void rs.loadHistory(1, limit)}
          onRefresh={() => void rs.loadHistory(rs.historyPagination.page, rs.historyPagination.limit)}
          onDelete={async (recordId: number) => {
            try {
              const result = await rs.deleteRecord(recordId);
              if (result.ok && result.json?.success) {
                ToastService.show({ title: 'Запис видалено', color: 'success' });
                await rs.loadHistory(rs.historyPagination.page, rs.historyPagination.limit);
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
          pagination={rs.archivePagination}
          onPageChange={(page) => void rs.loadArchive(page, rs.archivePagination.limit)}
          onLimitChange={(limit) => void rs.loadArchive(1, limit)}
          onRefresh={() => void rs.loadArchive(rs.archivePagination.page, rs.archivePagination.limit)}
        />
      )}

      <ConfirmModal
        isOpen={Boolean(pendingSimpleConfirm && simpleConfirmCopy)}
        title={simpleConfirmCopy?.title ?? ''}
        message={simpleConfirmCopy?.message ?? ''}
        confirmText={simpleConfirmCopy?.confirmText ?? 'Підтвердити'}
        cancelText="Скасувати"
        confirmColor="primary"
        confirmLoading={isSimpleConfirmBusy}
        onConfirm={() => void handleSimpleConfirm()}
        onCancel={() => setPendingSimpleConfirm(null)}
      />

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
            await rs.loadHistory(rs.historyPagination.page, rs.historyPagination.limit);
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

      <ConfirmModal
        isOpen={showClearConfirm}
        title="Скасувати поточний випуск?"
        message={isUnKitOperation
          ? `Усі вибрані набори, партії та введені дані для розукомплектування буде очищено.${rs.componentBatches.length > 0 ? ' Обрані партії також буде скинуто.' : ''}`
          : `Усі вибрані набори, партії та введені дані для комплектування буде очищено.${rs.componentBatches.length > 0 ? ' Обрані партії також буде скинуто.' : ''}`}
        confirmText="Скасувати випуск"
        cancelText="Залишити"
        confirmColor="danger"
        onConfirm={handleConfirmClearAll}
        onCancel={() => setShowClearConfirm(false)}
      />

      <PayloadPreviewModal
        isOpen={showPayloadPreview}
        onClose={() => setShowPayloadPreview(false)}
        payload={payloadPreview}
        title={payloadPreviewTitle}
        isLoading={isLoadingPayload}
      />

      <ReleaseSendConfirmModal
        isOpen={showSendConfirm}
        mode={sendMode}
        summary={sendSummary}
        warnings={sendWarnings}
        isSubmitting={isSendingRelease}
        result={sendResult}
        sendDisabled={sendDisabled}
        kitBatchPreviewLoading={isKitBatchPreviewLoading}
        sendLabel={sendButtonLabel}
        onConfirm={() => void handleConfirmSend()}
        onClose={() => {
          if (isSendingRelease) return;
          setShowSendConfirm(false);
          setSendResult(null);
          setSendSnapshot(null);
        }}
      />
    </div>
  );
}
