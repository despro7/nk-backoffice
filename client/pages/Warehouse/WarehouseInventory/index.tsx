import { Tab } from '@heroui/react';
import PageTabs from '@/components/PageTabs';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@shared/constants/roles';
import { ToastService } from '@/services/ToastService';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { UnsavedChangesModal } from '@/components/modals/UnsavedChangesModal';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

import { useWarehouseInventory } from './useWarehouseInventory';
import { InventoryStartScreen } from './components/InventoryStartScreen';
import { InventoryProgressBar } from './components/InventoryProgressBar';
import { InventoryProductList } from './components/InventoryProductList';
import { InventorySummaryTable } from './components/InventorySummaryTable';
import { InventoryActionBar } from './components/InventoryActionBar';
import { InventorySessionMeta } from './components/InventorySessionMeta';
import { InventoryHistoryTab } from './components/InventoryHistoryTab';
import InventoryArchiveTab from './components/InventoryArchiveTab';
import { InventoryCommentModal } from './components/InventoryCommentModal';

// ---------------------------------------------------------------------------
// WarehouseInventory — головна сторінка інвентаризації малого складу
// ---------------------------------------------------------------------------

export default function WarehouseInventory() {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const inv = useWarehouseInventory(isAdmin);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const currentUserId = user?.id ? String(user.id) : null;
  const latestOwnHistorySessionId = currentUserId
    ? inv.historySessions.find((s) => String(s.createdBy) === currentUserId)?.id ?? null
    : null;
  const canAuthorEditLoadedCompleted = !isAdmin
    && currentUserId !== null
    && (inv.sessionStatus === 'completed' || (inv.sessionStatus === 'revising' && inv.sessionOriginalStatus === 'completed'))
    && inv.sessionId !== null
    && latestOwnHistorySessionId !== null
    && String(inv.sessionId) === String(latestOwnHistorySessionId);
  const canEditCompletedSession = isAdmin || canAuthorEditLoadedCompleted;
  const canEditCurrentSession = inv.sessionStatus === 'in_progress' || (inv.sessionStatus === 'completed' && canEditCompletedSession);
  // Treat 'revising' as an editable state similar to 'in_progress'
  const isRevisingEditable = inv.sessionStatus === 'revising';
  const canEditCurrent = isRevisingEditable || canEditCurrentSession;

  const totalDeviations = inv.deviationCount + inv.deviationMaterialsCount;
  // Include deviations from sets
  const totalDeviationsAll = totalDeviations + (inv.deviationSetsCount ?? 0);

  const guard = useUnsavedGuard({
    isDirty: inv.isDirty,
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
      <div className="flex flex-col gap-4 pb-12 w-full">

        {/* Підзаголовок сторінки */}
        <p className="text-sm text-gray-500">
          Підрахунок фактичних залишків малого складу для виявлення відхилень від облікових даних. 
          Створюйте інвентаризацію, перевіряйте позиції та фіксуйте результати. 
          Усі незбережені зміни зберігаються як чернетка, щоб ви могли повернутися пізніше та продовжити роботу. 
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

          {inv.activeTab === 'current' && (
            <InventorySessionMeta
              sessionStatus={inv.sessionStatus}
              sessionDate={inv.sessionDate}
              onSessionDateChange={inv.handleSessionDateChange}
              isEditable={inv.sessionStatus === 'completed' && canEditCompletedSession}
            />
          )}
        </div>

        {/* ── Вкладка: Поточна інвентаризація ── */}
        {inv.activeTab === 'current' && (
          <>
            {/* Початковий екран — немає активної сесії */}
            {inv.sessionStatus === null && (
              <InventoryStartScreen
                comment={inv.comment}
                onCommentChange={inv.setComment}
                onStart={inv.handleStartSession}
              />
            )}

            {/* Активна або завершена сесія */}
            {(inv.sessionStatus === 'in_progress' || inv.sessionStatus === 'completed' || inv.sessionStatus === 'revising') && (
              <>
                <InventoryProgressBar
                  totalCheckedAll={inv.totalCheckedAll}
                  totalAll={inv.totalAll}
                  totalProgressPercent={inv.totalProgressPercent}
                  deviationCount={totalDeviationsAll}
                  searchQuery={inv.searchQuery}
                  onSearchChange={inv.setSearchQuery}
                  categoryOptions={inv.categoryOptions}
                  selectedCategory={inv.selectedCategory}
                  onCategoryChange={inv.setSelectedCategory}
                  sortBy={inv.sortBy}
                  onSortByChange={inv.setSortBy}
                  sortDirection={inv.sortDirection}
                  onSortDirectionChange={inv.setSortDirection}
                />

                {/* Список готових комплектів */}
                <InventoryProductList
                  title="Комплекти"
                  icon="boxes"
                  headerColorClass="bg-emerald-50"
                  headerTextClass="text-emerald-900"
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
                />

                {/* Список страв */}
                {inv.selectedCategory !== 'Коробки' && (
                  <InventoryProductList
                    title="Товари"
                    icon="utensils"
                    headerColorClass="bg-blue-50"
                    headerTextClass="text-blue-900"
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
                  />
                )}

                {/* Список матеріалів */}
                <InventoryProductList
                  title="Матеріали"
                  icon="box"
                  headerColorClass="bg-amber-50"
                  headerTextClass="text-amber-900"
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
                />

                {/* Підсумкова таблиця */}
                <InventorySummaryTable
                  sets={inv.sets}
                  products={inv.products}
                  materials={inv.materials}
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
            onLoadSession={inv.handleAdminLoadSession}
            onDeleteSession={handleAdminDeleteSession}
            onRefreshSessionBalances={handleRefreshSessionBalances}
          />
        )}
        {inv.activeTab === 'archive' && isAdmin && (
          <InventoryArchiveTab
            sessions={inv.archiveSessions}
            loading={inv.archiveLoading}
            onRefresh={inv.loadArchive}
            onLoadSession={inv.handleAdminLoadSession}
            onRestoreSession={inv.handleAdminRestoreSession}
            onDeletePermanently={inv.handleAdminDeletePermanently}
            onRefreshSessionBalances={handleRefreshSessionBalances}
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
