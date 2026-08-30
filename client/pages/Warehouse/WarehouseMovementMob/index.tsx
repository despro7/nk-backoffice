import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActionBubble, ActionBubbleDock, ActionConfirmBubble } from '@/components/action-bubble';
import { useTouchUi } from '@/hooks/useTouchUi';
import { PERMISSIONS } from '@shared/constants/permissions';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { useApi } from '@/hooks/useApi';
import { ToastService } from '@/services/ToastService';
import MovementMobDocumentList from './components/MovementMobDocumentList';
import MovementMobFilterBar from './components/MovementMobFilterBar';
import MovementMobDeleteConfirmModal from './components/MovementMobDeleteConfirmModal';
import { isMovementMobFilterDefault } from './WarehouseMovementMobUtils';
import { useWarehouseMovementMobList } from './useWarehouseMovementMobList';
import { deleteMovement } from './movementMobApi';

export default function WarehouseMovementMob() {
  const navigate = useNavigate();
  const { apiCall } = useApi();
  const { hasPermission } = useRoleAccess();
  const canOverrideEdit = hasPermission(PERMISSIONS.ACTION_WAREHOUSE_MOVEMENT_EDIT);
  const canOverrideDelete = hasPermission(PERMISSIONS.ACTION_WAREHOUSE_MOVEMENT_DELETE);
  const list = useWarehouseMovementMobList();
  const touchUi = useTouchUi();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; displayNumber: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const filtersAreDefault = isMovementMobFilterDefault(list.dateRange, list.datePresetKey);

  const filterBar = (
    <MovementMobFilterBar
      dateRange={list.dateRange}
      datePresetKey={list.datePresetKey}
      onDateRangeChange={list.setDateRange}
      onDatePresetKeyChange={list.setDatePresetKey}
      onReset={list.resetFilters}
      loading={list.loading}
    />
  );

  return (
    <div className="flex flex-col gap-4 px-3 md:px-0">
      {touchUi ? (
        <ActionBubbleDock>
          <ActionConfirmBubble
            id="create"
            colorPreset="orange"
            icon="plus"
            iconSize={26}
            labelSize={16}
            hideIconWhenOpen={false}
            confirmLabel="Нове переміщення"
            ariaLabel="Нове переміщення"
            isOpen={createOpen}
            onOpenChange={setCreateOpen}
            onConfirm={() => {
              setCreateOpen(false);
              navigate('/warehouse/movement-mob/new');
            }}
          />
          <ActionBubble
            id="filters"
            colorPreset="sky"
            icon="filter"
            title="Фільтри"
            ariaLabel="Фільтри переміщень"
            isOpen={filtersOpen}
            onOpenChange={setFiltersOpen}
            badge={!filtersAreDefault}
            panelWidth="min(24rem, calc(100vw - 5rem))"
            panelClassName="max-w-67"
            panelBodyClassName="p-3"
          >
            {filterBar}
          </ActionBubble>
        </ActionBubbleDock>
      ) : (
        filterBar
      )}

      <MovementMobDocumentList
        cards={list.cards}
        loading={list.loading}
        error={list.error}
        onCardPress={(id) => navigate(`/warehouse/movement-mob/${id}`)}
        showAdminActions={canOverrideEdit || canOverrideDelete}
        onAdminEdit={canOverrideEdit
          ? (id) => navigate(`/warehouse/movement-mob/${id}`, { state: { adminEdit: true } })
          : undefined}
        onAdminDelete={canOverrideDelete
          ? (id) => {
            const card = list.cards.find((item) => item.id === id);
            setDeleteTarget({ id, displayNumber: card?.displayNumber ?? String(id) });
          }
          : undefined}
      />

      <MovementMobDeleteConfirmModal
        isOpen={deleteTarget != null}
        displayNumber={deleteTarget?.displayNumber}
        deleting={deleting}
        onClose={() => { if (!deleting) setDeleteTarget(null); }}
        onConfirm={() => {
          if (!deleteTarget) return;
          const id = deleteTarget.id;
          setDeleting(true);
          void deleteMovement(apiCall, id)
            .then(async () => {
              ToastService.show({
                title: 'Документ видалено',
                color: 'success',
              });
              setDeleteTarget(null);
              await list.refetch();
            })
            .catch((err: unknown) => {
              ToastService.show({
                title: 'Не вдалося видалити',
                description: err instanceof Error ? err.message : undefined,
                color: 'danger',
              });
            })
            .finally(() => setDeleting(false));
        }}
      />
    </div>
  );
}
