import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Input, Spinner, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { StockBadge } from '@/components/StockBadge';
import {
  isWarehouseProductArchived,
  type WarehouseProductSearchFilters,
  type WarehouseProductSearchHit,
  type WarehouseProductSearchMetaField,
} from '@shared/types/warehouseProductSearch';
import {
  useWarehouseProductSearch,
  type WarehouseProductStockBreakdown,
} from './useWarehouseProductSearch';
import { formatDate } from '@/lib/formatUtils';

interface Props {
  onSelect: (item: WarehouseProductSearchHit) => void;
  excludeSkus?: string[];
  storageId?: string | null;
  filters?: WarehouseProductSearchFilters;
  stockAsOfDate?: Date | null;
  visibleMeta?: WarehouseProductSearchMetaField[];
  placeholder?: string;
  disabled?: boolean;
}

const DEFAULT_META: WarehouseProductSearchMetaField[] = ['sku', 'folder', 'stock', 'updatedAt'];

function formatStockQty(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return String(Math.round(value));
}

function hasNoUsableStock(stock: WarehouseProductStockBreakdown | undefined, loaded: boolean): boolean {
  if (!loaded) return false;
  if (!stock) return true;
  return stock.gp <= 0 && stock.ms <= 0;
}

function SearchResultStockMeta({
  stock,
  loaded,
  balancesAsOfFallback,
}: {
  stock?: WarehouseProductStockBreakdown;
  loaded: boolean;
  balancesAsOfFallback?: string | null;
}) {
  if (!loaded) {
    return <span className="text-gray-400">…</span>;
  }
  const balancesRaw = stock?.balancesAsOf ?? balancesAsOfFallback;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-0.5 gap-y-0.5">
      <StockBadge variant="gp" size="9px" className="mx-0.5 grayscale brightness-150" />
      <span className="font-semibold tabular-nums text-gray-500">{formatStockQty(stock?.gp)}</span>
      <span className="text-gray-300 mx-1"></span>
      <StockBadge variant="ms" size="9px" className="mx-0.5 grayscale" />
      <span className="font-semibold tabular-nums text-gray-500">{formatStockQty(stock?.ms)}</span>
    </span>
  );
}

export default function WarehouseProductSearch({
  onSelect,
  excludeSkus = [],
  storageId,
  filters,
  stockAsOfDate,
  visibleMeta = DEFAULT_META,
  placeholder = 'Пошук за назвою, SKU, штрихкодом або партією',
  disabled = false,
}: Props) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [stockMap, setStockMap] = useState<Record<string, WarehouseProductStockBreakdown>>({});
  const [stockLoaded, setStockLoaded] = useState(false);
  const [stockBalancesAsOf, setStockBalancesAsOf] = useState<string | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const scrollActiveOnKeyboardRef = useRef(false);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [stockRefreshKey, setStockRefreshKey] = useState(0);
  const [stockRefreshing, setStockRefreshing] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const { results, loading, minLength, enrichStockBreakdown, refresh, isRefreshing } = useWarehouseProductSearch({
    query,
    excludeSkus,
    filters,
    storageId,
    stockAsOfDate,
  });

  useEffect(() => {
    setActiveIndex(0);
  }, [results]);

  const loadStocksForResults = useCallback(async (hits: WarehouseProductSearchHit[]) => {
    const skus = hits.map((r) => r.sku).filter(Boolean);
    if (skus.length === 0 || !visibleMeta.includes('stock')) {
      setStockMap({});
      setStockLoaded(false);
      setStockBalancesAsOf(null);
      return;
    }
    setStockRefreshing(true);
    setStockLoaded(false);
    try {
      const map = await enrichStockBreakdown(skus);
      setStockMap(map);
      const sample = Object.values(map)[0];
      setStockBalancesAsOf(sample?.balancesAsOf ?? stockAsOfDate?.toISOString() ?? null);
      setStockLoaded(true);
    } finally {
      setStockRefreshing(false);
    }
  }, [visibleMeta, enrichStockBreakdown, stockAsOfDate]);

  useEffect(() => {
    void loadStocksForResults(results);
  }, [results, loadStocksForResults, stockRefreshKey]);

  useEffect(() => {
    if (!scrollActiveOnKeyboardRef.current) return;
    scrollActiveOnKeyboardRef.current = false;
    const el = optionRefs.current.get(activeIndex);
    el?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [activeIndex]);

  const pick = useCallback((hit: WarehouseProductSearchHit) => {
    const stock = stockMap[hit.sku];
    const totalStock = stock ? stock.gp + stock.ms : hit.stockAtStorage ?? null;
    onSelect({
      ...hit,
      stockAtStorage: totalStock,
    });
    setQuery('');
    setActiveIndex(0);
    setListOpen(false);
  }, [onSelect, stockMap]);

  const canShowList = query.trim().length >= minLength;
  const showList = listOpen && canShowList;

  useEffect(() => {
    if (!showList) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (anchorRef.current?.contains(target)) return;
      if (listboxRef.current?.contains(target)) return;
      setListOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showList]);

  const handleRefresh = useCallback(async () => {
    await refresh(query);
    setStockRefreshKey((key) => key + 1);
    if (canShowList) setListOpen(true);
  }, [refresh, query, canShowList]);

  const updateDropdownRect = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setDropdownRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!showList) {
      setDropdownRect(null);
      return;
    }
    updateDropdownRect();
    window.addEventListener('scroll', updateDropdownRect, true);
    window.addEventListener('resize', updateDropdownRect);
    return () => {
      window.removeEventListener('scroll', updateDropdownRect, true);
      window.removeEventListener('resize', updateDropdownRect);
    };
  }, [showList, results.length, loading, updateDropdownRect]);

  const listbox = showList && dropdownRect ? (
    <div
      ref={listboxRef}
      role="listbox"
      style={{
        position: 'fixed',
        top: dropdownRect.top,
        left: dropdownRect.left,
        width: dropdownRect.width,
        zIndex: 9999,
      }}
      className="max-h-80 p-2 overflow-auto rounded-lg bg-white shadow-medium scrollbar-thin-transparent"
    >
      {loading && results.length === 0 && (
        <div className="flex items-center gap-2 px-3 py-4 text-sm text-gray-500">
          <Spinner size="sm" /> Пошук…
        </div>
      )}
      {!loading && results.length === 0 && (
        <div className="px-3 py-4 text-sm text-gray-500">Нічого не знайдено</div>
      )}
      {results.map((hit, index) => {
        const active = index === activeIndex;
        const stock = stockMap[hit.sku];
        const faded = visibleMeta.includes('stock') && hasNoUsableStock(stock, stockLoaded);
        const archived = isWarehouseProductArchived(hit);
        return (
          <button
            key={`${hit.sku}-${hit.batchId ?? index}`}
            ref={(node) => {
              if (node) optionRefs.current.set(index, node);
              else optionRefs.current.delete(index);
            }}
            type="button"
            role="option"
            aria-selected={active}
            className={`w-full text-left px-3 py-2.5 rounded-md transition-opacity ${
              faded ? 'opacity-60' : ''
            } ${active ? 'bg-primary/10' : 'hover:bg-gray-50'}`}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => pick(hit)}
          >
            <div className="flex items-start gap-2">
              <div className="text-sm font-medium text-gray-900 min-w-0">{hit.name}</div>
              {archived && (
                <Tooltip content="Архівний товар" placement="top" delay={200} color="secondary">
                  <span className="inline-flex shrink-0 mt-1" aria-label="Архівний товар">
                    <DynamicIcon name="archive" size={14} className="text-warning" />
                  </span>
                </Tooltip>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
              {visibleMeta.includes('sku') && <span>SKU: {hit.sku}</span>}
              {visibleMeta.includes('folder') && hit.parentName && (
                <span className="inline-flex items-center gap-1 min-w-0">
                  <DynamicIcon name="folder" size={12} className="text-gray-400 shrink-0" />
                  <span className="truncate">{hit.parentName}</span>
                </span>
              )}
              {visibleMeta.includes('stock') && (
                <SearchResultStockMeta
                  stock={stock}
                  loaded={stockLoaded}
                  balancesAsOfFallback={stockBalancesAsOf}
                />
              )}
              {visibleMeta.includes('batch') && hit.batchLabel && (
                <span className="inline-flex items-center gap-1">
                  <DynamicIcon name="package" size={12} className="text-gray-400 shrink-0" />
                  {hit.batchLabel}
                </span>
              )}
              {visibleMeta.includes('updatedAt') && hit.updatedAt && (
                <Tooltip
                  content={`Товар оновлено: ${formatDate(hit.updatedAt)}`}
                  placement="top"
                  delay={200}
                  color="secondary"
                >
                  <span className="inline-flex gap-1 items-center text-gray-400" aria-label={`Товар оновлено: ${formatDate(hit.updatedAt)}`}>
                    <DynamicIcon name="calendar-clock" size={13} />
                    {formatDate(hit.updatedAt)}
                  </span>
                </Tooltip>
              )}
            </div>
          </button>
        );
      })}
    </div>
  ) : null;

  const refreshBusy = isRefreshing || stockRefreshing;

  const endSlotIconClass =
    'inline-flex shrink-0 items-center justify-center p-0 text-default-400 hover:text-default-600 disabled:cursor-not-allowed disabled:opacity-40';

  const inputEndContent = (query.trim() || canShowList) ? (
    <div className="flex items-center gap-2">
      {canShowList && (
        <Tooltip content="Оновити результати пошуку" placement="top" delay={200} color="secondary">
          <button
            type="button"
            aria-label="Оновити результати пошуку"
            disabled={disabled || refreshBusy}
            className={endSlotIconClass}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void handleRefresh();
            }}
          >
            {refreshBusy ? (
              <Spinner size="sm" color="default" classNames={{ wrapper: 'w-4 h-4' }} />
            ) : (
              <DynamicIcon name="refresh-cw" size={16} strokeWidth={2} />
            )}
          </button>
        </Tooltip>
      )}
      {query.trim() !== '' && (
        <Tooltip content="Очистити поле" placement="top" delay={200} color="secondary">
          <button
            type="button"
            aria-label="Очистити поле"
            disabled={disabled}
            className={endSlotIconClass}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setQuery('');
              setListOpen(false);
            }}
          >
            <DynamicIcon name="circle-x" size={16} strokeWidth={2} />
          </button>
        </Tooltip>
      )}
    </div>
  ) : null;

  return (
    <div ref={anchorRef} className="relative w-full">
      <Input
        value={query}
        onValueChange={(value) => {
          setQuery(value);
          setListOpen(true);
        }}
        onFocus={() => {
          if (canShowList) setListOpen(true);
        }}
        placeholder={placeholder}
        size="lg"
        isDisabled={disabled}
        startContent={<DynamicIcon name="search" className="text-gray-400" size={18} />}
        endContent={inputEndContent}
        classNames={{
          inputWrapper: 'rounded-lg border border-gray-200 bg-default-100 data-[hover=true]:bg-default-200/75',
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setListOpen(false);
            setQuery('');
            return;
          }
          if (!showList || results.length === 0) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            scrollActiveOnKeyboardRef.current = true;
            setActiveIndex((i) => Math.min(results.length - 1, i + 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            scrollActiveOnKeyboardRef.current = true;
            setActiveIndex((i) => Math.max(0, i - 1));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            const hit = results[activeIndex];
            if (hit) pick(hit);
          }
        }}
      />

      {listbox && createPortal(listbox, document.body)}
    </div>
  );
}
