import { Tab } from '@heroui/react';
import PageTabs from '@/components/PageTabs';
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useAuth } from '@/contexts/auth-context';
import { useRolePreview } from '@/contexts/role-preview-context';
import { ToastService } from '@/services/ToastService';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { UnsavedChangesModal } from '@/components/modals/UnsavedChangesModal';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { ReserveDraftBanner } from '@/components/reserve-draft';

import { useWarehouseInventory } from './useWarehouseInventory';
import { resolveSessionWarehouseScope } from './inventoryHistoryGroups';
import { InventoryStartScreen } from './components/InventoryStartScreen';
import { InventoryProgressBar } from './components/InventoryProgressBar';
import { InventoryProductList } from './components/InventoryProductList';
import { InventorySummaryTable } from './components/InventorySummaryTable';
import { InventoryActionBar } from './components/InventoryActionBar';
import { InventoryHistoryTab } from './components/InventoryHistoryTab';
import InventoryArchiveTab from './components/InventoryArchiveTab';
import { InventoryCommentModal } from './components/InventoryCommentModal';
import { InventorySessionDetailPanel } from './components/InventorySessionDetailPanel';
import { InventorySessionLoadingState } from './components/InventorySessionLoadingState';

// ---------------------------------------------------------------------------
// WarehouseInventory — головна сторінка інвентаризації малого складу та складу готової продукції (ГП)
// ---------------------------------------------------------------------------

export default function WarehouseInventory() {
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>();
  const { user } = useAuth();
  const { isAdminView: isAdmin } = useRolePreview();
  const inv = useWarehouseInventory(isAdmin);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const currentUserId = user?.id ? String(user.id) : null;
  const loadedScope = inv.sessionWarehouse ?? 'small';
  const latestOwnHistorySessionIdForScope = currentUserId
    ? inv.historySessions.find(
        (s) => String(s.createdBy) === currentUserId && resolveSessionWarehouseScope(s) === loadedScope,
      )?.id ?? null
    : null;
  const canAuthorEditLoadedCompleted = !isAdmin
    && currentUserId !== null
    && (inv.sessionStatus === 'completed' || (inv.sessionStatus === 'revising' && inv.sessionOriginalStatus === 'completed'))
    && inv.sessionId !== null
    && latestOwnHistorySessionIdForScope !== null
    && String(inv.sessionId) === String(latestOwnHistorySessionIdForScope);
  const canEditCompletedSession = isAdmin || canAuthorEditLoadedCompleted;
  const canEditCurrentSession = inv.sessionStatus === 'in_progress' || (inv.sessionStatus === 'completed' && canEditCompletedSession);
  // Treat 'revising' as an editable state similar to 'in_progress'
  const isRevisingEditable = inv.sessionStatus === 'revising';
  const canEditCurrent = isRevisingEditable || canEditCurrentSession;

  const totalDeviations = inv.deviationCount + inv.deviationMaterialsCount;
  // Include deviations from sets
  const totalDeviationsAll = totalDeviations + (inv.deviationSetsCount ?? 0);

  const displaySessionId = inv.sessionId ?? (inv.viewingSession ? Number(inv.viewingSession.id) : null);
  const pageHeading = displaySessionId != null
    ? `Інвентаризація №${displaySessionId}`
    : 'Інвентаризація залишків на складах';

  useEffect(() => {
    document.title = displaySessionId != null
      ? `Інвентаризація №${displaySessionId} | NK Backoffice`
      : 'Інвентаризація залишків | NK Backoffice';
  }, [displaySessionId]);

  const guard = useUnsavedGuard({
    // Вихід не блокуємо: зміни вже лежать у локальному резерві і пропонуються при поверненні.
    isDirty: false,
    onSaveDraft: inv.handleSaveDraft,
  });

  const handleAdminDeleteSession = async (sessionId: string): Promise<void> => {
    // Покажемо confirm modal, фактичне видалення робить handleConfirmDelete
    setDeleteTargetId(sessionId);
    setShowConfirmDelete(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      const res = await fetch(`/api/warehouse/inventory/draft/${deleteTargetId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ToastService.show({ title: 'Сесію видалено', color: 'success' });
      inv.loadHistory();
    } catch {
      ToastService.show({ title: 'Помилка видалення сесії', color: 'danger' });
    } finally {
      setShowConfirmDelete(false);
      setDeleteTargetId(null);
    }
  };

  const handleRefreshSessionBalances = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/warehouse/inventory/${sessionId}/refresh-balances`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // NOTE: Do NOT auto-refresh history here — keep returned report for UI modal.
      return data as { items?: Array<any> } | null;
    } catch (err) {
      ToastService.show({ title: 'Помилка оновлення залишків', color: 'danger' });
      return null;
    }
  };

  return (
    <div className="container">
      <div className="flex flex-col gap-8 pb-12 w-full">

        <h1 className="text-primary font-inter text-2xl lg:text-3xl font-semibold leading-[100%] tracking-[-0.64px] min-h-10 flex items-center px-3 md:px-0">
          <DynamicIcon name="clipboard-list" className="w-6 h-6 mr-3 shrink-0 hidden lg:block" />
          {pageHeading}
        </h1>

        {/* Підзаголовок сторінки */}
        <p className="text-sm text-gray-500">
          Підрахунок фактичних залишків малого складу та складу готової продукції (ГП) для виявлення відхилень від облікових даних.
          Створюйте інвентаризацію, перевіряйте позиції та фіксуйте результати окремо для кожного складу.
          Незбережені правки лишаються в резервній копії на цьому пристрої, тож після виходу або збою можна продовжити з того ж місця. Чернетку на сервері зберігайте окремою дією.
          Завершуйте інвентаризацію, щоб зафіксувати результати та побачити відхилення.
        </p>

        {/* Рядок табів */}
        <div className="flex items-center justify-between gap-4">
          <PageTabs selectedKey={inv.activeTab} onSelectionChange={(key) => {
            const tab = key as 'current' | 'history' | 'archive';
            inv.setActiveTab(tab);
            if (tab === 'history' && inv.historySessions.length === 0) {
              inv.loadHistory();
            }
            if (tab === 'archive' && inv.archiveSessions.length === 0) {
              inv.loadArchive();
            }
          }}>
            <Tab key="current" title="Поточна інвентаризація" />
            <Tab key="history" title="Історія" />
            {isAdmin && <Tab key="archive" title="Архів" />}
          </PageTabs>

        </div>

        {/* ── Вкладка: Поточна інвентаризація ── */}
        {inv.activeTab === 'current' && inv.sessionBootstrapLoading && (
          <InventorySessionLoadingState message={inv.sessionBootstrapMessage ?? 'Завантаження…'} />
        )}

        {inv.activeTab === 'current' && !inv.sessionBootstrapLoading && (
          <>
            {/* Початковий екран — немає активної сесії */}
            {inv.sessionStatus === null && !inv.viewingSession && (
              <InventoryStartScreen
                comment={inv.comment}
                onCommentChange={inv.setComment}
                onStart={inv.handleStartSession}
                pendingDrafts={inv.pendingWarehouseDrafts}
              />
            )}

            {inv.viewingSession && inv.sessionStatus === null && (
              <InventorySessionDetailPanel
                session={inv.viewingSession}
                historySessions={inv.historySessions}
                isAdmin={isAdmin}
                currentUserId={currentUserId}
                setCompositionBySku={inv.setCompositionBySku}
                onEdit={() => inv.handleBeginSessionEdit(inv.viewingSession!)}
                onDelete={handleAdminDeleteSession}
                onRefreshSessionBalances={handleRefreshSessionBalances}
                onHistoryRefresh={inv.loadHistory}
                onClose={inv.closeSessionDetail}
                compactHeader={Boolean(urlSessionId)}
              />
            )}

            {/* Активна або завершена сесія (режим редагування) */}
            {(inv.sessionStatus === 'in_progress' || inv.sessionStatus === 'completed' || inv.sessionStatus === 'revising') && (
              <>
                <InventoryProgressBar
                  totalCheckedAll={inv.totalCheckedAll}
                  totalAll={inv.totalAll}
                  totalProgressPercent={inv.totalProgressPercent}
                  deviationCount={totalDeviationsAll}
                  searchQuery={inv.searchQuery}
                  onSearchChange={inv.setSearchQuery}
                  showOutdated={inv.showOutdated}
                  onShowOutdatedChange={inv.setShowOutdated}
                  categoryOptions={inv.categoryOptions}
                  selectedCategory={inv.selectedCategory}
                  onCategoryChange={inv.setSelectedCategory}
                  sortBy={inv.sortBy}
                  onSortByChange={inv.setSortBy}
                  sortDirection={inv.sortDirection}
                  onSortDirectionChange={inv.setSortDirection}
                  sessionStatus={inv.sessionStatus}
                  sessionWarehouse={inv.sessionWarehouse}
                  sessionDate={inv.sessionDate}
                  onSessionDateChange={inv.handleSessionDateChange}
                  isEditable={inv.sessionStatus === 'completed' && canEditCompletedSession}
                />

                {inv.reserveOffer && (
                  <ReserveDraftBanner
                    savedAt={inv.reserveOffer.savedAt}
                    placeLabel={inv.reserveOffer.placeLabel}
                    onContinue={inv.continueReserveDraft}
                    onDismiss={inv.dismissReserveDraft}
                  />
                )}

                {/* Список готових комплектів */}
                <InventoryProductList
                  title="Монолітні комплекти"
                  icon="boxes"
                  headerColorClass="bg-lime-100"
                  headerTextClass="text-lime-700"
                  checkedCount={inv.checkedSetsCount}
                  totalCount={inv.totalSetsCount}
                  items={inv.filteredSets}
                  loading={inv.setsLoading}
                  error={inv.setsError}
                  searchQuery={inv.searchQuery}
                  openItemIds={inv.openSetIds}
                  onToggle={inv.handleToggleSet}
                  onChange={inv.handleSetChange}
                  onCheck={inv.handleCheckSet}
                  onEnterPress={inv.handleEnterPressSet}
                  onRetry={inv.loadSets}
                  onReset={inv.handleResetItemValues}
                  warehouseScope={inv.sessionWarehouse ?? 'small'}
                  rowKind="set"
                />

                {/* Список страв */}
                {inv.selectedCategory !== 'Коробки' && (
                  <InventoryProductList
                    title="Порційні товари"
                    icon="utensils"
                    headerColorClass="bg-blue-200/80"
                    headerTextClass="text-blue-800"
                    checkedCount={inv.checkedCount}
                    totalCount={inv.totalCount}
                    items={inv.filteredProducts}
                    loading={inv.productsLoading}
                    error={inv.productsError}
                    searchQuery={inv.searchQuery}
                    openItemIds={inv.openProductIds}
                    onToggle={inv.handleToggleProduct}
                    onChange={inv.handleProductChange}
                    onCheck={inv.handleCheckProduct}
                    onEnterPress={inv.handleEnterPressProduct}
                    onRetry={inv.loadProducts}
                    onReset={inv.handleResetItemValues}
                    warehouseScope={inv.sessionWarehouse ?? 'small'}
                    rowKind="product"
                  />
                )}

                {/* Список матеріалів */}
                <InventoryProductList
                  title="Матеріали"
                  icon="box"
                  headerColorClass="bg-amber-100"
                  headerTextClass="text-amber-800"
                  checkedCount={inv.checkedMaterialsCount}
                  totalCount={inv.totalMaterialsCount}
                  items={inv.filteredMaterials}
                  loading={inv.materialsLoading}
                  error={inv.materialsError}
                  searchQuery={inv.searchQuery}
                  openItemIds={inv.openMaterialIds}
                  onToggle={inv.handleToggleMaterial}
                  onChange={inv.handleMaterialChange}
                  onCheck={inv.handleCheckMaterial}
                  onEnterPress={inv.handleEnterPressMaterial}
                  onRetry={inv.loadMaterials}
                  onReset={inv.handleResetItemValues}
                  warehouseScope={inv.sessionWarehouse ?? 'small'}
                  rowKind="material"
                />

                {/* Підсумкова таблиця */}
                <InventorySummaryTable
                  sets={inv.sets}
                  products={inv.products}
                  materials={inv.materials}
                  warehouseScope={inv.sessionWarehouse ?? 'small'}
                />

                {/* Панель дій: для редагованої сесії (in_progress) або для адміна, що редагує completed */}
                {canEditCurrent && (
                  <InventoryActionBar
                    deviationCount={totalDeviationsAll}
                    totalCheckedAll={inv.totalCheckedAll}
                    isSavingDraft={inv.isSavingDraft}
                    comment={inv.comment}
                    onCancel={() => inv.setShowConfirmCancel(true)}
                    onOpenComment={() => { inv.setCommentDraft(inv.comment); inv.setShowCommentModal(true); }}
                    onSaveDraft={inv.handleSaveDraft}
                    onFinish={() => inv.setShowConfirmFinish(true)}
                    isEditingCompleted={(inv.sessionStatus === 'completed' || inv.sessionStatus === 'revising') && canEditCompletedSession}
                    showCloseWithoutSaving={isRevisingEditable || ((inv.sessionStatus === 'completed' || inv.sessionStatus === 'revising') && canEditCompletedSession)}
                    onCloseWithoutSaving={() => inv.setShowConfirmCloseWithoutSaving(true)}
                  />
                )}
              </>
            )}
          </>
        )}

        {/* ── Вкладка: Історія ── */}
        {inv.activeTab === 'history' && (
          <InventoryHistoryTab
            sessions={inv.historySessions}
            loading={inv.historyLoading}
            onRefresh={inv.loadHistory}
            onLoadSession={inv.handleBeginSessionEdit}
            onDeleteSession={handleAdminDeleteSession}
            onRefreshSessionBalances={handleRefreshSessionBalances}
            setCompositionBySku={inv.setCompositionBySku}
          />
        )}
        {inv.activeTab === 'archive' && isAdmin && (
          <InventoryArchiveTab
            sessions={inv.archiveSessions}
            loading={inv.archiveLoading}
            onRefresh={inv.loadArchive}
            onLoadSession={inv.handleBeginSessionEdit}
            onRestoreSession={inv.handleAdminRestoreSession}
            onDeletePermanently={inv.handleAdminDeletePermanently}
            onRefreshSessionBalances={handleRefreshSessionBalances}
            setCompositionBySku={inv.setCompositionBySku}
          />
        )}
      </div>

      {/* Модалка підтвердження завершення */}
      <ConfirmModal
        isOpen={inv.showConfirmFinish}
        title={
          inv.sessionStatus === 'completed' && canEditCompletedSession
            ? (totalDeviationsAll > 0 ? 'Перезавершити і зафіксувати відхилення?' : 'Перезавершити інвентаризацію?')
            : (totalDeviationsAll > 0 ? 'Зафіксувати відхилення?' : 'Завершити інвентаризацію?')
        }
        message={
          inv.sessionStatus === 'completed' && canEditCompletedSession
            ? (totalDeviationsAll > 0
                ? `Ви перезаписуєте завершену сесію. Перевірено ${inv.totalCheckedAll} з ${inv.totalAll} позицій. Знайдено ${totalDeviationsAll} відхилень.`
                : `Ви перезаписуєте завершену сесію. Перевірено ${inv.totalCheckedAll} з ${inv.totalAll} позицій.`)
            : (totalDeviationsAll > 0
                ? `Перевірено ${inv.totalCheckedAll} з ${inv.totalAll} позицій. Знайдено ${totalDeviationsAll} відхилень від системних залишків.`
                : `Перевірено ${inv.totalCheckedAll} з ${inv.totalAll} позицій.`)
        }
        confirmText={
          inv.sessionStatus === 'completed' && canEditCompletedSession
            ? (totalDeviationsAll > 0 ? 'Перезавершити і зафіксувати' : 'Перезавершити')
            : (totalDeviationsAll > 0 ? 'Зафіксувати і завершити' : 'Завершити')
        }
        cancelText="Назад"
        onConfirm={inv.handleFinish}
        onCancel={() => inv.setShowConfirmFinish(false)}
      />

      {/* Модалка підтвердження скасування */}
      <ConfirmModal
        isOpen={inv.showConfirmCancel}
        title="Скасувати інвентаризацію?"
        message="Всі незбережені дані будуть втрачені."
        confirmText="Скасувати інвентаризацію"
        cancelText="Назад"
        onConfirm={inv.handleReset}
        onCancel={() => inv.setShowConfirmCancel(false)}
      />

      <ConfirmModal
        isOpen={inv.showConfirmCloseWithoutSaving}
        title="Закрити без збереження?"
        message="Незбережені зміни і локальну резервну копію буде відкинуто. Документ повернеться до статусу «Завершена»."
        confirmText="Закрити без збереження"
        cancelText="Назад"
        confirmColor="danger"
        onConfirm={async () => {
          inv.setShowConfirmCloseWithoutSaving(false);
          await inv.handleCloseView();
        }}
        onCancel={() => inv.setShowConfirmCloseWithoutSaving(false)}
      />

      {/* Модалка коментаря */}
      <InventoryCommentModal
        isOpen={inv.showCommentModal}
        commentDraft={inv.commentDraft}
        onCommentDraftChange={inv.setCommentDraft}
        onSave={inv.handleSaveComment}
        onClose={() => inv.setShowCommentModal(false)}
      />

      {/* Модалка підтвердження видалення */}
      <ConfirmModal
        isOpen={showConfirmDelete}
        title="Видалити інвентаризацію?"
        message="Ця дія назавжди видалить запис інвентаризації. Продовжити?"
        confirmText="Видалити"
        cancelText="Назад"
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowConfirmDelete(false)}
      />

      {/* Блокування навігації при незбережених змінах */}
      <UnsavedChangesModal
        {...guard.modalProps}
        message="У вас є незбережені зміни інвентаризації. Збережіть чернетку, щоб повернутися пізніше та продовжити, інакше всі зміни буде втрачено."
      />
      {/* Модалка: є непідтверджені позиції при збереженні чернетки */}
      <ConfirmModal
        isOpen={inv.showConfirmSaveUnconfirmed}
        title="Є непідтверджені позиції"
        message="Деякі позиції мають введені значення, але не підтверджені. При збереженні ці непідтверджені позиції буде вилучено з документу. Ви можете повернутися та підтвердити їх, або продовжити, тоді вони будуть видалені."
        confirmText="Зберегти і вилучити непідтверджені"
        cancelText="Повернутись"
        confirmColor="danger"
        onConfirm={inv.handleConfirmUnconfirmedAction}
        onCancel={() => inv.setShowConfirmSaveUnconfirmed(false)}
      />
    </div>
  );
}
