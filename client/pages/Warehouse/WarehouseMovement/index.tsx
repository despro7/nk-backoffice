import { useRef, useEffect, useState, useMemo } from 'react';
import { Tabs, Tab } from '@heroui/react';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { UnsavedChangesModal } from '@/components/modals/UnsavedChangesModal';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { useAuth } from '@/contexts/AuthContext';
import { hasAccess, ROLES } from '@shared/constants/roles';
import { LoggingService } from '@/services/LoggingService';
import { ToastService } from '@/services/ToastService';
import { useWarehouseMovement } from './useWarehouseMovement';
import { useMovementHistory } from './useMovementHistory';
import { useMovementDrafts } from './useMovementDrafts';
import { MovementStartScreen } from './components/MovementStartScreen';
import { MovementTopActions } from './components/MovementTopActions';
import { MovementFilterBar } from './components/MovementFilterBar';
import { MovementActionBar } from './components/MovementActionBar';
import { MovementProductRow } from './components/MovementProductRow';
import { MovementProductList } from './components/MovementProductList';
import { MovementSummaryTable } from './components/MovementSummaryTable';
import { MovementHistoryTab } from './components/MovementHistoryTab';
import { MovementDraftsTab } from './components/MovementDraftsTab';
import { PayloadPreviewModal } from './components/PayloadPreviewModal';
import { useDebug } from '@/contexts/DebugContext';
import type { DilovodMovementPayload } from '@shared/types/movement';

// ---------------------------------------------------------------------------
// WarehouseMovement — головна сторінка переміщення товарів
// ---------------------------------------------------------------------------

export default function WarehouseMovement() {
  const mov = useWarehouseMovement();

  const { getDrafts, deleteDraft } = mov;

  const { user } = useAuth();
  const { isDebugMode } = useDebug();
  const isAdmin = user?.role ? hasAccess(user.role, undefined, ROLES.ADMIN) : false;

  const accordionRef = useRef<HTMLDivElement>(null);

  const guard = useUnsavedGuard({
    isDirty: mov.isDirty,
    onSaveDraft: mov.handleSaveDraft,
  });

  // Закрити поле при клику поза інтерфейсом
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
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [mov]);

  const summaryItems = mov.summaryItems;

  // Сортування списку товарів (лише відображення, не впливає на логіку хука)
  const [sortBy, setSortBy] = useState<'name' | 'sku' | 'stock'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const sortedFilteredProducts = useMemo(() => {
    const items = [...mov.filteredProducts];
    const dir = sortDirection === 'asc' ? 1 : -1;
    return items.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'uk') * dir;
      if (sortBy === 'sku')  return a.sku.localeCompare(b.sku, 'uk') * dir;
      if (sortBy === 'stock') {
        const stockA = a.stockData.mainStock + a.stockData.smallStock;
        const stockB = b.stockData.mainStock + b.stockData.smallStock;
        return (stockA - stockB) * dir;
      }
      return 0;
    });
  }, [mov.filteredProducts, sortBy, sortDirection]);

  // Хук для історії переміщень
  const history = useMovementHistory();
  // Хук для чернеток
  const draftsManager = useMovementDrafts(getDrafts, deleteDraft);
  const [activeTab, setActiveTab] = useState<'current' | 'drafts' | 'history'>('current');

  // Стан для модалі перегляду payload
  const [showPayloadPreview, setShowPayloadPreview] = useState(false);
  const [payloadPreview, setPayloadPreview] = useState<DilovodMovementPayload | null>(null);
  const [isLoadingPayload, setIsLoadingPayload] = useState(false);
  const [isSendingToDialovod, setIsSendingToDilovod] = useState(false);
  // Модалка підтвердження фінальної відправки
  const [showConfirmFinalize, setShowConfirmFinalize] = useState(false);

  // --------------------------------------------------------------------------
  // Спільна логіка відправки до Діловода
  // --------------------------------------------------------------------------
  const sendToDialovod = async (isFinal: boolean) => {
    let draft = mov.savedDraft;
    // Завжди зберігаємо актуальний стан перед відправкою
    // (для нового документа — створює, для існуючого draft/active — оновлює items)
    draft = await mov.handleSaveDraft();
    if (!draft) return;

    setIsSendingToDilovod(true);
    try {
      const response = await fetch('/api/warehouse/movements/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          draftId: draft.id,
          summaryItems: mov.summaryItems,
          movementDate: mov.selectedDateTime.toISOString(),
          dryRun: false,
          isFinal,
        }),
      });
      const data = await response.json();
      if (data.success) {
        const docLabel = data.docNumber ?? data.dilovodDocId ?? '—';
        if (isFinal) {
          ToastService.show({ 
            title: 'Переміщення завершено!',
            description: `Документ ${docLabel} успішно завершено`,
            color: 'success',
            hideIcon: false
          });
          setShowPayloadPreview(false);
          // Після фінальної — повністю скидаємо стан сторінки (як "Скасувати")
          await mov.handleReset();
          draftsManager.loadDrafts();
        } else {
          ToastService.show({ 
            title: 'Відправлено в Діловод!',
            color: 'success',
            description: `Документ ${docLabel} залишається активним для редагування`,
            hideIcon: false
          });
          setShowPayloadPreview(false);
          // Після проміжної — лише оновлюємо статус і дату в savedDraft (без перезавантаження).
          // Використовуємо локальну `draft` (результат handleSaveDraft), а не mov.savedDraft,
          // бо React-стан ще не рефрешнувся всередині async-замикання.
          mov.setSavedDraft({
            ...draft,
            status: 'active',
            lastSentToDilovodAt: data.lastSentToDilovodAt ?? new Date().toISOString(),
            ...(data.dilovodDocId && { dilovodDocId: data.dilovodDocId }),
            ...(data.docNumber && { docNumber: data.docNumber }),
          });
        }
      } else {
        // data.error містить деталізоване повідомлення (назви товарів, артикули).
        // Нормалізуємо для відображення в Toast: прибираємо "- " маркери, замінюємо \n на " | "
        const errorDescription = data.error
          ? data.error.replace(/\n-\s*/g, ' | ').replace(/\n/g, ' ').trim()
          : undefined;
        ToastService.show({
          title: data.errorTitle ?? 'Помилка при відправці до Діловода',
          description: errorDescription,
          color: 'danger',
          hideIcon: false,
          icon: 'alert-triangle',
        });
        LoggingService.log('[WarehouseMovement] Діловод відповів з помилкою:', data);
      }
    } catch (err) {
      LoggingService.log('[WarehouseMovement] sendToDialovod error:', err);
      ToastService.show({ title: 'Помилка при відправці до Діловода', color: 'danger' });
    } finally {
      setIsSendingToDilovod(false);
    }
  };

  /** Проміжна відправка (isFinal=false) — статус → 'active', документ залишається відкритим */
  const handleSendIntermediate = () => sendToDialovod(false);

  /** Фінальна відправка (isFinal=true) — показуємо підтвердження перед відправкою */
  const handleSendFinal = () => setShowConfirmFinalize(true);
  /** Dry-run: завантажити payload із сервера та відкрити модалку (тільки адмін) */
  const handleShowPayload = async () => {
    // Якщо чернетки ще немає в БД (id=0 або відсутня) — спочатку зберегти
    let draft = mov.savedDraft;
    if (!draft || draft.id === 0) {
      draft = await mov.handleSaveDraft();
      if (!draft) return; // збереження не вдалось — зупинити
    }

    setIsLoadingPayload(true);
    try {
      const response = await fetch('/api/warehouse/movements/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          draftId: draft.id,
          summaryItems: mov.summaryItems,
          movementDate: mov.selectedDateTime.toISOString(),
          dryRun: true,
        }),
      });
      const data = await response.json();
      if (data.success && data.payload) {
        setPayloadPreview(data.payload);
        setShowPayloadPreview(true);
      } else {
        // Якщо є помилки валідації — показуємо їх списком
        const description = Array.isArray(data.details) && data.details.length > 0
          ? data.details.join(' | ')
          : undefined;
        ToastService.show({ title: data.error ?? 'Не вдалось отримати payload', description, color: 'danger' });
      }
    } catch (err) {
      LoggingService.log('[WarehouseMovement] handleShowPayload error:', err);
      ToastService.show({ title: 'Помилка при завантаженні payload', color: 'danger' });
    } finally {
      setIsLoadingPayload(false);
    }
  };

  // Завантажуємо дані при переключенні табів — тільки якщо даних ще немає
  useEffect(() => {
    if (activeTab === 'history' && history.documents.length === 0) {
      history.loadHistory();
    } else if (activeTab === 'drafts' && draftsManager.drafts.length === 0) {
      draftsManager.loadDrafts();
    }
  }, [activeTab]);

  return (
    <div className="container">
      {/* Основна колона */}
      <div className="flex flex-col gap-8 pb-12 w-full">
        {/* Таби: Поточні переміщення / Чернетки / Історія */}
        <div className="flex items-center gap-4 justify-between">
          <Tabs
            selectedKey={activeTab}
            onSelectionChange={(key) => {
              const tab = key as 'current' | 'drafts' | 'history';
              setActiveTab(tab);
            }}
            variant="solid"
            color="default"
            size="lg"
            classNames={{
              tabList: "gap-2 p-[6px] bg-gray-100 rounded-lg",
              cursor: "bg-secondary text-white shadow-sm rounded-md",
              tab: "px-3 py-1.5 text-sm font-normal data-[hover-unselected=true]:opacity-100 text-neutral-500",
              tabContent: "group-data-[selected=true]:text-white text-neutral-400",
            }}
          >
            <Tab key="current" title="Поточні переміщення" />
            <Tab key="drafts" title="Чернетки" />
            <Tab key="history" title="Історія" />
          </Tabs>

          {/* Верхня панель дій */}
          {mov.products.length > 0 && activeTab === 'current' && (
            <MovementTopActions
              onRefreshBalances={guard.guardAction(mov.handleSyncBalances, { 
                message: 'Ви маєте незбережені зміни. Зберегти перед оновленням товарів?',
                saveText: 'Зберегти і оновити',
                leaveText: 'Оновити без збереження',
                cancelText: 'Скасувати',
                modalSize: 'xl',

              })}
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

        {/* Початковий екран */}
        {activeTab === 'current' && !mov.savedDraft && mov.products.length === 0 && !mov.productsLoading && (
          <MovementStartScreen
            onLoadProducts={mov.loadProducts}
            isLoadingProducts={mov.productsLoading}
          />
        )}

        {/* Header: Заголовок накладної */}
        {activeTab === 'current' && mov.products.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h2 className="text-2xl font-bold text-gray-800">
                {!mov.savedDraft
                  ? 'Накладна на переміщення (чернетка)'
                  : `Накладна на переміщення №${mov.savedDraft.docNumber || mov.savedDraft.internalDocNumber}`}
              </h2>
              {/* Бейдж статусу */}
              {mov.savedDraft && (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
                  mov.savedDraft.status === 'finalized'
                    ? 'bg-green-100 text-green-800'
                    : mov.savedDraft.status === 'active'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    mov.savedDraft.status === 'finalized' ? 'bg-green-500'
                    : mov.savedDraft.status === 'active' ? 'bg-amber-500'
                    : 'bg-gray-400'
                  }`} />
                  {mov.savedDraft.status === 'finalized' ? 'Завершено'
                    : mov.savedDraft.status === 'active'
                    ? `Активна · ${mov.savedDraft.lastSentToDilovodAt
                        ? new Date(mov.savedDraft.lastSentToDilovodAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
                        : 'відправлено'}`
                    : 'Чернетка'}
                </span>
              )}
            </div>
            <p className="text-gray-600">
              {!mov.savedDraft
                ? 'Після збереження документ ще не буде відправлений. Відправте його коли буде готово.'
                : mov.savedDraft.status === 'finalized'
                ? 'Переміщення завершено. Документ заблоковано для редагування.'
                : mov.savedDraft.status === 'active'
                ? 'Документ відправлено в Діловод. Можна додавати товари і відправляти повторно. На прикінці дня завершіть переміщення.'
                : 'Чернетку збережено. Відправте в Діловод або завершіть переміщення.'}
            </p>
          </div>
        )}

        {/* Фільтр і пошук */}
        {mov.products.length > 0 && activeTab === 'current' && (
          <MovementFilterBar
            searchQuery={mov.searchQuery}
            onSearchChange={mov.setSearchQuery}
            selectedDate={mov.selectedDateTime}
            onDateChange={mov.handleDateChange}
            isRefreshingBatches={mov.isRefreshingBatches}
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSortByChange={setSortBy}
            onSortDirectionChange={setSortDirection}
          />
        )}

        {/* Список товарів */}
        {mov.products.length > 0 && activeTab === 'current' && (
          <MovementProductList
            items={sortedFilteredProducts}
            loading={mov.productsLoading}
            error={mov.productsError}
            onRetry={mov.loadProducts}
            hasSearch={mov.searchQuery.length > 0}
          >
            <div ref={accordionRef}>
              {sortedFilteredProducts.map(p => (
                <MovementProductRow
                  key={p.id}
                  product={p}
                  isOpen={mov.selectedProductIds.has(p.id)}
                  onToggle={mov.handleToggleProduct}
                  onChange={mov.handleProductChange}
                  activeField={
                    mov.activeField?.productId === p.id
                      ? mov.activeField.field
                      : null
                  }
                  selectedDateTime={mov.selectedDateTime}
                />
              ))}
            </div>
          </MovementProductList>
        )}

        {/* Підсумкова таблиця */}
        {summaryItems.length > 0 && activeTab === 'current' && (
          <MovementSummaryTable
            items={summaryItems}
            notes={mov.notes}
            setNotes={mov.setNotes}
          />
        )}

        {/* Footer: Панель дій */}
        {mov.products.length > 0 && activeTab === 'current' && (
          <MovementActionBar
            selectedCount={mov.selectedProductIds.size}
            isDirty={mov.isDirty}
            isSavingDraft={mov.isSaving}
            isSending={isSendingToDialovod}
            hasDraft={mov.savedDraft !== null}
            draftStatus={mov.savedDraft?.status ?? null}
            onCancel={() => mov.setShowConfirmCancel(true)}
            onSaveDraft={mov.handleSaveDraft}
            onSendIntermediate={handleSendIntermediate}
            onSendFinal={handleSendFinal}
            isAdmin={isAdmin}
            isDebugMode={isDebugMode}
            onShowPayload={handleShowPayload}
            isLoadingPayload={isLoadingPayload}
          />
        )}

        {/* Вміст вкладки "Чернетки" */}
        {activeTab === 'drafts' && (
          <MovementDraftsTab
            drafts={draftsManager.drafts}
            loading={draftsManager.loading}
            onRefresh={draftsManager.loadDrafts}
            onLoadDraft={async (draft) => {
              await mov.loadDraftObject(draft);
              setActiveTab('current');
            }}
            onDeleteDraft={draftsManager.removeDraft}
          />
        )}

        {/* Вміст вкладки "Історія" */}
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
              await mov.loadMovementFromHistory(doc);
              setActiveTab('current');
            }}
          />
        )}
      </div>

      {/* Модалка перегляду Payload перед відправкою (тільки адмін) */}
      <PayloadPreviewModal
        isOpen={showPayloadPreview}
        onClose={() => setShowPayloadPreview(false)}
        payload={payloadPreview}
        summaryItems={mov.summaryItems}
        internalDocNumber={mov.savedDraft?.internalDocNumber}
        isLoading={isLoadingPayload}
        isSending={isSendingToDialovod}
        onSend={handleSendIntermediate}
      />

      {/* Модалка підтвердження фінальної відправки */}
      <ConfirmModal
        isOpen={showConfirmFinalize}
        title="Завершити переміщення?"
        message="Після завершення накладну не можна буде редагувати. Впевнені?"
        onConfirm={async () => {
          setShowConfirmFinalize(false);
          await sendToDialovod(true);
        }}
        onCancel={() => setShowConfirmFinalize(false)}
        confirmText="Завершити"
        cancelText="Скасувати"
      />

      {/* Модалка підтвердження скасування */}
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
      />

      {/* Модалка незбережених змін (leave guard) */}
      <UnsavedChangesModal {...guard.modalProps} />
    </div>
  );
}
