import type { DateValue } from '@internationalized/date';
import { Button, Input, DatePicker, Spinner, Select, SelectItem } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { I18nProvider } from '@react-aria/i18n';
import { getLocalTimeZone, now, today, parseZonedDateTime } from '@internationalized/date';
import { SortSelect } from '../../shared/SortSelect';
import type { SortOption } from '../../shared/SortSelect';

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

  // Конвертуємо JS Date в ZonedDateTime для DatePicker
  const toZonedDateTime = (date: Date): DateValue => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const tzOffset = getLocalTimeZone();
    return parseZonedDateTime(`${year}-${month}-${day}T${hours}:${minutes}:00[${tzOffset}]`);
  };

  // Конвертуємо DateValue назад у JS Date
  const fromDateValue = (dateValue: DateValue): Date => {
    const year = dateValue.year;
    const month = dateValue.month - 1;
    const day = dateValue.day;
    const hours = 'hour' in dateValue ? dateValue.hour : 0;
    const minutes = 'minute' in dateValue ? dateValue.minute : 0;
    return new Date(year, month, day, hours, minutes);
  };

  const handleDateTimeChange = (dateValue: DateValue | null) => {
    if (dateValue) {
      const newDate = fromDateValue(dateValue);
      onDateChange(newDate);
    }
  };

   const PRESET_TIMES = [
      { label: '9:00', hour: 9, minute: 0 },
      { label: '16:00', hour: 16, minute: 0 },
      { label: 'Зараз', hour: null, minute: null }, // null = поточний час
    ];

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
            aria-label="Залишки на дату"
            label="Залишки на дату"
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

      {/* Календар з вибором дати та часу, кнопка "Сьогодні" всередині попапу */}
      <div className="flex items-end gap-2">
        <I18nProvider locale="uk-UA">
          <DatePicker
            showMonthAndYearPickers
            value={toZonedDateTime(selectedDate)}
            onChange={handleDateTimeChange}
            granularity="minute"
            hideTimeZone
            hourCycle={24}
            shouldForceLeadingZeros
            label="Дата і час переміщення"
            labelPlacement="outside-left"
            selectorButtonPlacement="start"
            size="lg"
            isDisabled={isRefreshingBatches}
            maxValue={now(getLocalTimeZone())}
            classNames={{
              base: "w-fit",
              inputWrapper: "hover:bg-white focus-within:bg-white!",
              segment: "rounded focus:bg-neutral-300/80",
              label: "text-[13px] text-gray-500 max-w-26 leading-tight text-right pr-1",
            }}
            endContent={
              isRefreshingBatches
                ? <Spinner size="sm" color="primary" />
                : undefined
            }
            CalendarBottomContent={
                <div className="px-3 pb-3 flex items-center gap-1">
                  {PRESET_TIMES.map(({ label, hour, minute }) => (
                    <Button
                      key={label}
                      size="sm"
                      variant="flat"
                      className={`h-auto px-2 py-1.5 min-w-0 flex-auto`}
                      onPress={() => {
                        const h = hour ?? new Date().getHours();
                        const m = minute ?? new Date().getMinutes();
                        onDateChange(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), h, m));
                      }}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
            }
          />
        </I18nProvider>
      </div>
    </div>
  );
};
