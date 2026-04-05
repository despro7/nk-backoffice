import { Input } from '@heroui/react';
import { Chip, Progress } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

// ---------------------------------------------------------------------------
// InventoryProgressBar — прогрес + чіп відхилень + поле пошуку
// ---------------------------------------------------------------------------

interface InventoryProgressBarProps {
  totalCheckedAll: number;
  totalAll: number;
  totalProgressPercent: number;
  deviationCount: number;
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

export const InventoryProgressBar = ({
  totalCheckedAll, totalAll, totalProgressPercent, deviationCount,
  searchQuery, onSearchChange,
}: InventoryProgressBarProps) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
    <div className="flex items-center justify-between mb-2 h-6">
      <span className="text-sm font-medium text-gray-700">
        Перевірено: <strong>{totalCheckedAll}</strong> / {totalAll} позицій
      </span>
      <div className="flex items-center gap-3">
        {deviationCount > 0 && (
          <Chip
            size="sm"
            color="danger"
            variant="flat"
            startContent={<DynamicIcon name="alert-triangle" className="w-3 h-3 ml-1" />}
          >
            {deviationCount} відхилень
          </Chip>
        )}
        <span className="text-sm font-semibold text-gray-700">{totalProgressPercent}%</span>
      </div>
    </div>

    <Progress
      aria-label="Прогрес інвентаризації"
      value={totalProgressPercent}
      color={totalProgressPercent === 100 ? 'success' : 'primary'}
      size="sm"
      className="mb-3"
    />

    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Пошук позиції..."
        value={searchQuery}
        onValueChange={onSearchChange}
        size="lg"
        className="flex-1 min-w-[200px]"
        startContent={<DynamicIcon name="search" className="w-4 h-4 text-gray-400" />}
        isClearable
        onClear={() => onSearchChange('')}
      />
    </div>
  </div>
);
