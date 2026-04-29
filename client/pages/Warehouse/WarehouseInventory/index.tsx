import { Button, Tabs, Tab } from '@heroui/react';
import { useState } from 'react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatDate } from '@/lib/formatUtils';
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

  const totalDeviations = inv.deviationCount + inv.deviationMaterialsCount;

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

  return (
    <div className="container">
      <div className="flex flex-col gap-4 pb-12 w-full">

        {/* Підзаголовок сторінки */}
        <p className="text-sm text-gray-500">
          Підрахунок фактичних залишків малого складу на {formatDate(inv.sessionDate ? new Date(inv.sessionDate).toISOString() : new Date().toISOString())}
        </p>

        {/* Рядок табів */}
        <div className="flex items-center justify-between gap-4">
          <Tabs
            selectedKey={inv.activeTab}
            onSelectionChange={(key) => {
              const tab = key as 'current' | 'history';
              inv.setActiveTab(tab);
              if (tab === 'history' && inv.historySessions.length === 0) {
                inv.loadHistory();
              }
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
            <Tab key="current" title="Поточна інвентаризація" />
            <Tab key="history" title="Історія" />
          </Tabs>

          <InventorySessionMeta
            sessionStatus={inv.sessionStatus}
            sessionDate={inv.sessionDate}
            onSessionDateChange={inv.handleSessionDateChange}
            isEditable={inv.sessionStatus === 'completed' && isAdmin}
          />
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
            {(inv.sessionStatus === 'in_progress' || inv.sessionStatus === 'completed') && (
              <>
                <InventoryProgressBar
                  totalCheckedAll={inv.totalCheckedAll}
                  totalAll={inv.totalAll}
                  totalProgressPercent={inv.totalProgressPercent}
                  deviationCount={totalDeviations}
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

                {/* Список страв */}
                {inv.selectedCategory !== 'Коробки' && (
                  <InventoryProductList
                    title="Страви"
                    icon="utensils"
                    headerColorClass="bg-blue-50"
                    headerTextClass="text-blue-900"
                    checkedCount={inv.checkedCount}
                    totalCount={inv.totalCount}
                    items={inv.filteredProducts}
                    loading={inv.productsLoading}
                    error={inv.productsError}
                    searchQuery={inv.searchQuery}
                    openItemId={inv.openProductId}
                    onToggle={inv.handleToggleProduct}
                    onChange={inv.handleProductChange}
                    onCheck={inv.handleCheckProduct}
                    onEnterPress={inv.handleEnterPressProduct}
                    onRetry={inv.loadProducts}
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
                  openItemId={inv.openMaterialId}
                  onToggle={inv.handleToggleMaterial}
                  onChange={inv.handleMaterialChange}
                  onCheck={inv.handleCheckMaterial}
                  onEnterPress={inv.handleEnterPressMaterial}
                  onRetry={inv.loadMaterials}
                />

                {/* Підсумкова таблиця */}
                <InventorySummaryTable
                  products={inv.products}
                  materials={inv.materials}
                />

                {/* Панель дій: для редагованої сесії (in_progress) або для адміна, що редагує completed */}
                {inv.isEditable && (
                  <InventoryActionBar
                    deviationCount={totalDeviations}
                    totalCheckedAll={inv.totalCheckedAll}
                    isSavingDraft={inv.isSavingDraft}
                    comment={inv.comment}
                    onCancel={() => inv.setShowConfirmCancel(true)}
                    onOpenComment={() => { inv.setCommentDraft(inv.comment); inv.setShowCommentModal(true); }}
                    onSaveDraft={inv.handleSaveDraft}
                    onFinish={() => inv.setShowConfirmFinish(true)}
                    isEditingCompleted={inv.sessionStatus === 'completed' && isAdmin}
                  />
                )}

                {/* Кнопка нової інвентаризації після завершення */}
                {inv.sessionStatus === 'completed' && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex justify-end">
                    <Button
                      color="primary"
                      variant="flat"
                      onPress={inv.handleReset}
                      startContent={<DynamicIcon name="plus" className="w-4 h-4" />}
                    >
                      Нова інвентаризація
                    </Button>
                  </div>
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
          />
        )}
      </div>

      {/* Модалка підтвердження завершення */}
      <ConfirmModal
        isOpen={inv.showConfirmFinish}
        title={
          inv.sessionStatus === 'completed' && isAdmin
            ? (totalDeviations > 0 ? 'Перезавершити і зафіксувати відхилення?' : 'Перезавершити інвентаризацію?')
            : (totalDeviations > 0 ? 'Зафіксувати відхилення?' : 'Завершити інвентаризацію?')
        }
        message={
          inv.sessionStatus === 'completed' && isAdmin
            ? (totalDeviations > 0
                ? `Ви перезаписуєте завершену сесію. Перевірено ${inv.totalCheckedAll} з ${inv.totalAll} позицій. Знайдено ${totalDeviations} відхилень.`
                : `Ви перезаписуєте завершену сесію. Перевірено ${inv.totalCheckedAll} з ${inv.totalAll} позицій.`)
            : (totalDeviations > 0
                ? `Перевірено ${inv.totalCheckedAll} з ${inv.totalAll} позицій. Знайдено ${totalDeviations} відхилень від системних залишків.`
                : `Перевірено ${inv.totalCheckedAll} з ${inv.totalAll} позицій.`)
        }
        confirmText={
          inv.sessionStatus === 'completed' && isAdmin
            ? (totalDeviations > 0 ? 'Перезавершити і зафіксувати' : 'Перезавершити')
            : (totalDeviations > 0 ? 'Зафіксувати і завершити' : 'Завершити')
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
    </div>
  );
}
