import { Chip, Input, Progress, Select, SelectItem } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { SortSelect } from '../../shared/SortSelect';
import type { SortOption } from '../../shared/SortSelect';

// ---------------------------------------------------------------------------
// InventoryProgressBar — прогрес + чіп відхилень + поле пошуку + сортування
// ---------------------------------------------------------------------------

interface InventoryProgressBarProps {
  totalCheckedAll: number;
  totalAll: number;
  totalProgressPercent: number;
  deviationCount: number;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  categoryOptions: string[];
  selectedCategory: string;
  onCategoryChange: (value: string) => void;
  sortBy: 'name' | 'sku' | 'balance' | 'deviation';
  onSortByChange: (value: 'name' | 'sku' | 'balance' | 'deviation') => void;
  sortDirection: 'asc' | 'desc';
  onSortDirectionChange: (value: 'asc' | 'desc') => void;
}

export const InventoryProgressBar = ({
  totalCheckedAll, totalAll, totalProgressPercent, deviationCount,
  searchQuery, onSearchChange,
  categoryOptions, selectedCategory, onCategoryChange,
  sortBy, onSortByChange, sortDirection, onSortDirectionChange,
}: InventoryProgressBarProps) => {
  const sortOptions: SortOption<'name' | 'sku' | 'balance' | 'deviation'>[] = [
    { key: 'name_asc',       label: 'За назвою [↓]' },
    { key: 'name_desc',      label: 'За назвою [↑]' },
    { key: 'sku_asc',        label: 'За артикулами [↓]' },
    { key: 'sku_desc',       label: 'За артикулами [↑]' },
    { key: 'balance_asc',    label: 'За залишками [↓]' },
    { key: 'balance_desc',   label: 'За залишками [↑]' },
    { key: 'deviation_asc',  label: 'За відхиленнями [↓]' },
    { key: 'deviation_desc', label: 'За відхиленнями [↑]' },
  ];

  return (
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

      <div className="flex items-center gap-2">
        <Select
          aria-label="Категорія"
          size="lg"
          variant="flat"
          color="default"
          selectedKeys={[selectedCategory]}
          onSelectionChange={(keys) => {
            const selected = Array.from(keys)[0]?.toString() ?? 'Усі категорії';
            onCategoryChange(selected);
          }}
          className="flex-1 min-w-[200px]"
        >
          {categoryOptions.map((category) => (
            <SelectItem key={category} textValue={category}>
              {category}
            </SelectItem>
          ))}
        </Select>

        <Input
          placeholder="Пошук позиції..."
          value={searchQuery}
          onValueChange={onSearchChange}
          size="lg"
          className="min-w-[200px]"
          startContent={<DynamicIcon name="search" className="w-4 h-4 text-gray-400" />}
          isClearable
          onClear={() => onSearchChange('')}
        />

        <SortSelect
            sortBy={sortBy}
            sortDirection={sortDirection}
            options={sortOptions}
            onSortByChange={onSortByChange}
            onSortDirectionChange={onSortDirectionChange}
          />
      </div>
    </div>
  );
};
