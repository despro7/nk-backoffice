import { useNavigate } from 'react-router-dom';
import MovementMobDocumentList from './components/MovementMobDocumentList';
import MovementMobFilterBar from './components/MovementMobFilterBar';
import { useWarehouseMovementMobList } from './useWarehouseMovementMobList';

export default function WarehouseMovementMob() {
  const navigate = useNavigate();
  const list = useWarehouseMovementMobList();

  return (
    <div className="flex flex-col gap-4 px-3 md:px-0">

      <MovementMobFilterBar
        dateRange={list.dateRange}
        datePresetKey={list.datePresetKey}
        onDateRangeChange={list.setDateRange}
        onDatePresetKeyChange={list.setDatePresetKey}
        onReset={list.resetFilters}
        loading={list.loading}
      />

      <MovementMobDocumentList
        cards={list.cards}
        loading={list.loading}
        error={list.error}
        onCardPress={(id) => navigate(`/warehouse/movement-mob/${id}`)}
      />
    </div>
  );
}
