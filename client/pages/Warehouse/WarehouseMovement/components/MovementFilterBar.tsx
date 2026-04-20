import { Input, Select, SelectItem, Spinner } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { SortSelect } from '../../shared/SortSelect';
import type { SortOption } from '../../shared/SortSelect';
import { DateTimePicker } from '@/components/DateTimePicker';

// ---------------------------------------------------------------------------
// MovementFilterBar — рядок фільтрації та пошуку
// ---------------------------------------------------------------------------

interface MovementFilterBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  isRefreshingBatches?: boolean;
  sortBy?: 'name' | 'sku' | 'stock';
  onSortByChange?: (value: 'name' | 'sku' | 'stock') => void;
  sortDirection?: 'asc' | 'desc';
  onSortDirectionChange?: (value: 'asc' | 'desc') => void;
  /** Режим дати для відображення залишків: на дату переміщення або на поточну дату */
  stockDateMode?: 'movement' | 'now';
  onStockDateModeChange?: (mode: 'movement' | 'now') => void;
  /** true поки виконується запит на оновлення залишків stockData */
  isRefreshingStock?: boolean;
}

export const MovementFilterBar = ({
  searchQuery,
  onSearchChange,
  selectedDate,
  onDateChange,
  isRefreshingBatches = false,
  sortBy = 'name',
  onSortByChange,
  sortDirection = 'asc',
  onSortDirectionChange,
  stockDateMode = 'now',
  onStockDateModeChange,
  isRefreshingStock = false,
}: MovementFilterBarProps) => {
  const sortOptions: SortOption<'name' | 'sku' | 'stock'>[] = [
    { key: 'name_asc',  label: 'За назвою [↓]' },
    { key: 'name_desc', label: 'За назвою [↑]' },
    { key: 'sku_asc',   label: 'За артикулами [↓]' },
    { key: 'sku_desc',  label: 'За артикулами [↑]' },
    { key: 'stock_asc', label: 'За залишками [↓]' },
    { key: 'stock_desc',label: 'За залишками [↑]' },
  ];

  // Конвертуємо DateValue назад у JS Date
  const handleDateTimeChange = (date: Date) => {
    onDateChange(date);
  };

  return (
    <div className="mt-4 flex items-center gap-4 justify-between">
      {/* Сортування */}
      {onSortByChange && onSortDirectionChange && (
        <SortSelect
          options={sortOptions}
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSortByChange={onSortByChange}
          onSortDirectionChange={onSortDirectionChange}
          className="max-w-[200px]"
          classNames={{
            trigger: "hover:bg-white! transition-colors duration-200 rounded-[14px]",
          }}
        />
      )}
      
      {/* Пошук */}
      <Input
        aria-label="Пошук товарів"
        placeholder="Пошук за назвою або артикулом..."
        size="lg"
        isClearable={true}
        value={searchQuery}
        onValueChange={onSearchChange}
        startContent={<DynamicIcon name="search" className="w-4 h-4 text-gray-400" />}
        classNames={{
          base: "max-w-90 mr-auto",
          inputWrapper: "hover:bg-white! focus-within:bg-white!",
        }}
      />

      {/* Фільтр "Залишки на дату" */}
      {onStockDateModeChange && (
        <div className="flex items-center gap-2 shrink-0">
          <Select
            label="Відображати залишки"
            labelPlacement="inside"
            size="sm"
            selectedKeys={[stockDateMode]}
            onSelectionChange={(keys) => {
              const val = Array.from(keys)[0] as 'movement' | 'now';
              if (val) onStockDateModeChange(val);
            }}
            disallowEmptySelection
            isDisabled={isRefreshingStock}
            classNames={{
              base: "w-[210px]",
              trigger: "hover:bg-white! transition-colors duration-200 rounded-[14px]",
            }}
          >
            <SelectItem key="now">На поточну дату</SelectItem>
            <SelectItem key="movement">На дату переміщення</SelectItem>
          </Select>
          {/* Індикатор завантаження залишків */}
          <div className="w-5 flex items-center justify-center">
            {isRefreshingStock
              ? <Spinner size="sm" color="primary" />
              : <DynamicIcon name="check" className="w-4 h-4 text-success-500 opacity-70" />
            }
          </div>
        </div>
      )}

      {/* Календар з вибором дати та часу */}
      <DateTimePicker
        value={selectedDate}
        onChange={handleDateTimeChange}
        label="Дата і час переміщення"
        isDisabled={isRefreshingBatches}
        isLoading={isRefreshingBatches}
      />
    </div>
  );
};
