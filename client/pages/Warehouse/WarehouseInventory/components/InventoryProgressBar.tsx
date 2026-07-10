import { useState, useRef, useEffect } from 'react';
import { Chip, Input, Progress, Select, SelectItem, Switch } from '@heroui/react';
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
  showOutdated: boolean;
  onShowOutdatedChange: (value: boolean) => void;
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
  showOutdated, onShowOutdatedChange,
  categoryOptions, selectedCategory, onCategoryChange,
  sortBy, onSortByChange, sortDirection, onSortDirectionChange,
}: InventoryProgressBarProps) => {
  // Визначаємо, чи став ProgressBar "прилиплим" (sticky) до верху вікна.
  // Для цього спостерігаємо за невидимим якорем, що розташований одразу над компонентом.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Якщо якір НЕ видно (прокручений вище вікна) — блок прилип
        setIsStuck(!entry.isIntersecting);
      },
      { rootMargin: '0px', threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

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
    <>
      {/* Невидимий якір для визначення стану "прилипання" */}
      <div ref={sentinelRef} aria-hidden className="h-0" />
      <div className={`group border-gray-200 p-4 sticky top-0 z-50 transition-all duration-300 ease-in-out ${isStuck ? 'rounded-b-xl -m-5 shadow-md pt-3 bg-white/70 backdrop-blur-sm' : 'rounded-xl bg-white border border-gray-200 shadow-sm'}`}>
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
          className={`mb-3 transition-all duration-300 ${isStuck ? 'mb-0' : ''}`}
        />

        {/* Другий рядок (пошук/фільтри): прихований, коли прилип, з'являється при наведенні */}
        <div className={`flex items-center gap-2 overflow-hidden transition-all duration-300 ease-in-out ${isStuck ? 'max-h-0 opacity-0 mt-0 group-hover:max-h-20 group-hover:opacity-100 group-hover:mt-3' : 'max-h-20 opacity-100 mt-3'}`}>
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

          <div className="flex items-center gap-2 mr-4">
            <Switch
              isSelected={showOutdated}
              onValueChange={onShowOutdatedChange}
            />
            <span className="text-sm text-gray-700 leading-4">Показати<br />застарілі</span>
          </div>

          <SortSelect
              sortBy={sortBy}
              sortDirection={sortDirection}
              options={sortOptions}
              onSortByChange={onSortByChange}
              onSortDirectionChange={onSortDirectionChange}
            />
        </div>
      </div>
    </>
  );
};
