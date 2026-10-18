import { useState, useRef, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { Chip, Input, Progress, Select, SelectItem, Switch } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { DateTimePicker } from '@/components/DateTimePicker';
import { StockBadge } from '@/components/StockBadge';
import { SortSelect } from '../../shared/SortSelect';
import type { SortOption } from '../../shared/SortSelect';
import type { InventoryStatus, InventoryWarehouseScope } from '../WarehouseInventoryTypes';

// ---------------------------------------------------------------------------
// InventoryProgressBar — прогрес + чіп відхилень + поле пошуку + сортування
// ---------------------------------------------------------------------------

type InventorySortBy = 'name' | 'sku' | 'balance' | 'deviation';

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
  sortBy: InventorySortBy;
  onSortByChange: (value: InventorySortBy) => void;
  sortDirection: 'asc' | 'desc';
  onSortDirectionChange: (value: 'asc' | 'desc') => void;
  sessionStatus: InventoryStatus | null;
  sessionWarehouse?: InventoryWarehouseScope | null;
  sessionDate?: string | null;
  onSessionDateChange?: (date: Date) => void;
  isEditable?: boolean;
}

const SORT_OPTIONS: SortOption<InventorySortBy>[] = [
  { key: 'name_asc',       label: 'За назвою [↓]' },
  { key: 'name_desc',      label: 'За назвою [↑]' },
  { key: 'sku_asc',        label: 'За артикулами [↓]' },
  { key: 'sku_desc',       label: 'За артикулами [↑]' },
  { key: 'balance_asc',    label: 'За залишками [↓]' },
  { key: 'balance_desc',   label: 'За залишками [↑]' },
  { key: 'deviation_asc',  label: 'За відхиленнями [↓]' },
  { key: 'deviation_desc', label: 'За відхиленнями [↑]' },
];

/** Горизонтальний виступ компактної панелі за межі основного блоку (як `-mx-5`). */
const COMPACT_BLEED_PX = 20;
/** На скільки px нижній край основного блоку має піти за верх viewport, щоб показати компактну панель. */
const COMPACT_SHOW_OFFSET_PX = 80;

const COMPACT_ROW_COLLAPSED = 'max-h-0 opacity-0 mt-0 group-hover:max-h-20 group-hover:opacity-100 group-hover:mt-3';
const COMPACT_ROW_EXPANDED = 'max-h-20 opacity-100 mt-3';

interface PanelContentProps extends InventoryProgressBarProps {
  /** Компактний режим: другий рядок згорнутий і розгортається при наведенні на панель. */
  compact: boolean;
}

const PanelContent = ({
  totalCheckedAll, totalAll, totalProgressPercent, deviationCount,
  searchQuery, onSearchChange,
  showOutdated, onShowOutdatedChange,
  categoryOptions, selectedCategory, onCategoryChange,
  sortBy, onSortByChange, sortDirection, onSortDirectionChange,
  sessionStatus, sessionWarehouse, sessionDate, onSessionDateChange, isEditable = false,
  compact,
}: PanelContentProps) => {
  const sessionDateObj = sessionDate ? new Date(sessionDate) : new Date();
  // Випадаючі списки рендеряться в портал, тож курсор над ними вже не «над панеллю» —
  // поки список відкритий, другий рядок примусово розгорнутий.
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const isRowPinned = isCategoryOpen || isSortOpen || isDatePickerOpen || isSearchFocused;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-gray-700">
            Перевірено: <strong>{totalCheckedAll}</strong> / {totalAll} позицій
          </span>
          <span className="text-sm font-semibold text-gray-700 ml-2 pl-4 border-l border-gray-200">{totalProgressPercent}%</span>
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
        </div>
        <div className="flex flex-wrap items-center">
          <div className="flex items-center gap-1.5 shrink-0 pr-4 mr-4 border-r border-gray-200">
            {sessionStatus === null && (
              <Chip size="sm" color="default" variant="flat" className="bg-gray-300 px-1.5 h-7" startContent={<DynamicIcon name="file" className="w-3 h-3 ml-1 mr-0.5" />}>
                Чернетка
              </Chip>
            )}
            {sessionStatus === 'in_progress' && (
              <Chip size="sm" color="warning" variant="flat" className="bg-orange-100 px-1.5 h-7" startContent={<DynamicIcon name="loader-2" className="w-3 h-3 ml-1 mr-0.5 animate-spin" />}>
                В процесі
              </Chip>
            )}
            {sessionStatus === 'revising' && (
              <Chip size="sm" color="secondary" variant="flat" className="bg-violet-200 px-1.5 h-7" startContent={<DynamicIcon name="loader" className="w-3 h-3 ml-1 mr-0.5 animate-[spin_2s_linear_infinite]" />}>
                На доопрацюванні
              </Chip>
            )}
            {sessionStatus === 'completed' && (
              <Chip size="sm" color="success" variant="flat" className="bg-green-500/30 text-green-800/90 px-1.5 h-7" startContent={<DynamicIcon name="circle-check" className="w-3 h-3 ml-1 mr-0.5" />}>
                Завершена
              </Chip>
            )}
          </div>
          {sessionWarehouse && (
            <div className="flex items-center gap-2 text-[13px] text-gray-500 shrink-0 pr-4 mr-4 border-r border-gray-200">
              <span>Склад:</span>
              <StockBadge variant={sessionWarehouse === 'gp' ? 'gp' : 'ms'} size="9px" />
            </div>
          )}
          {onSessionDateChange && (sessionStatus !== 'completed' || isEditable) && (
            <DateTimePicker
              value={sessionDateObj}
              onChange={onSessionDateChange}
              onOpenChange={setIsDatePickerOpen}
              label="Дата інв."
              labelStyle="w-full"
              size="sm"
            />
          )}
        </div>
      </div>

      <Progress
        aria-label="Прогрес інвентаризації"
        value={totalProgressPercent}
        color={totalProgressPercent === 100 ? 'success' : 'primary'}
        size="sm"
        className={compact ? 'mb-0' : 'mb-3'}
        classNames={{
          indicator: 'bg-gray-500',
        }}
      />

      {/* Другий рядок (пошук/фільтри): у компактній панелі з'являється при наведенні */}
      <div className={`flex items-center gap-2 ${compact ? `overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-in-out ${isRowPinned ? COMPACT_ROW_EXPANDED : COMPACT_ROW_COLLAPSED}` : 'mt-3'}`}>
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
          onOpenChange={setIsCategoryOpen}
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
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
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
          options={SORT_OPTIONS}
          onSortByChange={onSortByChange}
          onSortDirectionChange={onSortDirectionChange}
          onOpenChange={setIsSortOpen}
        />
      </div>
    </>
  );
};

export const InventoryProgressBar = (props: InventoryProgressBarProps) => {
  // Основний блок завжди статичний. Коли він повністю виходить за верх viewport,
  // зверху виїжджає його компактна fixed-копія — верстка сторінки при цьому не змінюється.
  const blockRef = useRef<HTMLDivElement>(null);
  const [showCompact, setShowCompact] = useState(false);
  const [compactRect, setCompactRect] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const block = blockRef.current;
    if (!block) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowCompact(!entry.isIntersecting && entry.boundingClientRect.bottom <= -COMPACT_SHOW_OFFSET_PX);
      },
      { threshold: 0, rootMargin: `${COMPACT_SHOW_OFFSET_PX}px 0px 0px 0px` },
    );
    observer.observe(block);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const block = blockRef.current;
    if (!block) return;
    const measure = () => {
      const rect = block.getBoundingClientRect();
      setCompactRect({ left: rect.left - COMPACT_BLEED_PX, width: rect.width + COMPACT_BLEED_PX * 2 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(block);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const compactStyle: CSSProperties | undefined = compactRect
    ? { left: compactRect.left, width: compactRect.width }
    : undefined;

  return (
    <>
      <div ref={blockRef} className="p-4 bg-white rounded-xl shadow-lg">
        <PanelContent {...props} compact={false} />
      </div>

      <div
        aria-hidden={!showCompact}
        style={compactStyle}
        className={`group fixed top-0 z-50 px-4 pt-3 pb-4 bg-white/70 backdrop-blur-sm rounded-b-xl shadow-md transition-[translate,opacity,visibility] duration-300 ease-in-out ${showCompact ? 'translate-y-0 opacity-100 visible' : '-translate-y-[calc(100%+12px)] opacity-0 invisible'}`}
      >
        <PanelContent {...props} compact />
      </div>
    </>
  );
};
