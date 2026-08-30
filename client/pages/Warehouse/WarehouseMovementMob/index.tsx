import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActionBubble, ActionBubbleDock, ActionConfirmBubble } from '@/components/action-bubble';
import { useTouchUi } from '@/hooks/useTouchUi';
import MovementMobDocumentList from './components/MovementMobDocumentList';
import MovementMobFilterBar from './components/MovementMobFilterBar';
import { isMovementMobFilterDefault } from './WarehouseMovementMobUtils';
import { useWarehouseMovementMobList } from './useWarehouseMovementMobList';

export default function WarehouseMovementMob() {
  const navigate = useNavigate();
  const list = useWarehouseMovementMobList();
  const touchUi = useTouchUi();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
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
      />
    </div>
  );
}
