import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableColumn,
  TableRow,
  TableCell,
  Spinner,
  Select,
  SelectItem,
  Chip,
  Tooltip,
} from '@heroui/react';
import { getValueColor } from "../lib/utils";
import type { SortDescriptor } from '@heroui/react';
import { MonthSwitcher } from '@/components/MonthSwitcher';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/contexts/AuthContext';

// ---------------------------------------------------------------------------
// Типи
// ---------------------------------------------------------------------------

type GroupBy = 'day' | 'calendarWeek' | 'week4';

interface PeriodMeta {
  key: string;
  label: string;
}

interface SalesDynamicsRow {
  sku: string;
  productName: string;
  periods: Record<string, number>;
  totalSold: number;
}

/** Рядок для відображення — включає залишок на початок місяця,
 *  щоб HeroUI Table бачив нові об'єкти після завантаження залишків. */
type DisplayRow = SalesDynamicsRow & {
  /** undefined = ще завантажується; null = немає даних; number = залишок */
  _stock: number | null | undefined;
};

interface SalesDynamicsResponse {
  success: boolean;
  data: {
    rows: SalesDynamicsRow[];
    periods: PeriodMeta[];
  };
  metadata: {
    year: number;
    month: number;
    groupBy: GroupBy;
    totalOrders: number;
    ordersWithCache: number;
    generatedAt: string;
  };
}

interface StockSnapshotResponse {
  success: boolean;
  asOfDate: string | null;
  stocks: Record<string, { mainStock: number; smallStock: number }>;
}

// ---------------------------------------------------------------------------
// Константи
// ---------------------------------------------------------------------------

const GROUP_BY_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: 'week4',        label: '4 рівні тижні' },
  { key: 'calendarWeek', label: 'Календарні тижні' },
  { key: 'day',          label: 'По днях' },
];

// Порогові значення для кольорового кодування % реалізації
const COLOR_THRESHOLDS = [
  { min: 100, color: 'success'  as const, bg: 'bg-green-100',  text: 'text-green-800' },
  { min: 20,  color: 'warning'  as const, bg: 'bg-yellow-100', text: 'text-yellow-800' },
  { min: 5,   color: 'default'  as const, bg: 'bg-orange-100', text: 'text-orange-700' },
  { min: 0,   color: 'danger'   as const, bg: 'bg-red-100',    text: 'text-red-700'   },
];

// ---------------------------------------------------------------------------
// Допоміжні функції
// ---------------------------------------------------------------------------

function getSalePercent(totalSold: number, openingStock: number): number | null {
  if (openingStock === 0) return null; // ∞ або не відомо
  return Math.round((totalSold / openingStock) * 100);
}

function getPercentChip(totalSold: number, openingStock: number | undefined) {
  if (openingStock === undefined) {
    // Залишок ще завантажується
    return <span className="text-default-400 text-xs">—</span>;
  }
  if (openingStock === 0) {
    if (totalSold === 0) {
      return (
        <Chip size="sm" variant="flat" color="danger" className="text-xs font-medium">
          0,00%
        </Chip>
      );
    }
    // Є продажі, але нульовий залишок → ∞
    return (
      <Chip size="sm" variant="light" color="default" className="text-xs font-medium">
        ∞
      </Chip>
    );
  }

  const pct = getSalePercent(totalSold, openingStock)!;
  const threshold = COLOR_THRESHOLDS.find(t => pct >= t.min) ?? COLOR_THRESHOLDS[COLOR_THRESHOLDS.length - 1];

  return (
    <Chip 
      size="sm"
      variant="flat"
      // color={threshold.color}
      className="text-xs font-medium"
      classNames={{ 
        base: getValueColor(pct, COLOR_THRESHOLDS.map(t => t.min)).base,
        content: getValueColor(pct, COLOR_THRESHOLDS.map(t => t.min)).content,
      }}>
      {pct.toFixed(0)}%
    </Chip>
  );
}

/** Числове значення % для сортування (∞ → Infinity, невідомо → -1) */
function getPercentSortValue(totalSold: number, openingStock: number | undefined): number {
  if (openingStock === undefined) return -1;
  if (openingStock === 0) return totalSold > 0 ? Infinity : 0;
  return (totalSold / openingStock) * 100;
}

// ---------------------------------------------------------------------------
// Компонент
// ---------------------------------------------------------------------------

export default function ReportsSalesDynamics() {
  const { apiCall } = useApi();
  const { isLoading: isAuthLoading } = useAuth();

  // --- Стан фільтрів ---
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [groupBy, setGroupBy] = useState<GroupBy>('week4');

  // --- Стан даних ---
  const [salesData, setSalesData]   = useState<SalesDynamicsResponse | null>(null);
  const [stockData, setStockData]   = useState<StockSnapshotResponse | null>(null);
  const [isSalesLoading, setIsSalesLoading]   = useState(false);
  const [isStockLoading, setIsStockLoading]   = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);

  // --- Сортування ---
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column:    'salePercent',
    direction: 'descending',
  });

  // ---------------------------------------------------------------------------
  // Завантаження даних продажів
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isAuthLoading) return; // Чекаємо поки авторизація ініціалізується

    const year  = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;
    let cancelled = false;

    setIsSalesLoading(true);
    setSalesError(null);
    setStockData(null);
    setSalesData(null);

    apiCall(`/api/stat/sales-dynamics?year=${year}&month=${month}&groupBy=${groupBy}`)
      .then(r => r.json())
      .then((data: SalesDynamicsResponse) => {
        if (cancelled) return;
        if (!data.success) throw new Error('Сервер повернув помилку');
        setSalesData(data);
      })
      .catch(err => {
        if (cancelled) return;
        setSalesError(err instanceof Error ? err.message : 'Помилка завантаження даних');
      })
      .finally(() => {
        if (!cancelled) setIsSalesLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, groupBy, isAuthLoading]);

  // ---------------------------------------------------------------------------
  // Завантаження залишків після отримання списку SKU
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const skus = salesData?.data?.rows?.map(r => r.sku).filter(Boolean) ?? [];
    if (skus.length === 0) return;

    const year  = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;
    const asOfDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)).toISOString();
    const skusParam = skus.join(',');
    let cancelled = false;

    setIsStockLoading(true);

    apiCall(`/api/warehouse/stock-snapshot?skus=${encodeURIComponent(skusParam)}&asOfDate=${asOfDate}`)
      .then(r => r.json())
      .then((data: StockSnapshotResponse) => {
        if (!cancelled) setStockData(data);
      })
      .catch(err => {
        console.error('[SalesDynamics] Помилка завантаження залишків:', err);
      })
      .finally(() => {
        if (!cancelled) setIsStockLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesData]);

  // ---------------------------------------------------------------------------
  // Мемоізовані дані
  // ---------------------------------------------------------------------------

  const periods = useMemo<PeriodMeta[]>(
    () => salesData?.data?.periods ?? [],
    [salesData],
  );

  const rows = useMemo<SalesDynamicsRow[]>(
    () => salesData?.data?.rows ?? [],
    [salesData],
  );

  /** Словник залишків: sku → totalStock */
  const stockMap = useMemo<Record<string, number>>(() => {
    if (!stockData?.stocks) return {};
    const map: Record<string, number> = {};
    for (const [sku, s] of Object.entries(stockData.stocks)) {
      map[sku] = (s.mainStock ?? 0) + (s.smallStock ?? 0);
    }
    return map;
  }, [stockData]);

  /** Відсортовані рядки */
  const sortedRows = useMemo<SalesDynamicsRow[]>(() => {
    return [...rows].sort((a, b) => {

      const col = sortDescriptor.column as string;
      const dir = sortDescriptor.direction === 'ascending' ? 1 : -1;

      if (col === 'productName') {
        return a.productName.localeCompare(b.productName, 'uk') * dir;
      }
      if (col === 'openingStock') {
        const aS = stockMap[a.sku] ?? 0;
        const bS = stockMap[b.sku] ?? 0;
        return (aS - bS) * dir;
      }
      if (col === 'totalSold') {
        return (a.totalSold - b.totalSold) * dir;
      }
      if (col === 'salePercent') {
        const aP = getPercentSortValue(a.totalSold, stockMap[a.sku]);
        const bP = getPercentSortValue(b.totalSold, stockMap[b.sku]);
        if (aP === Infinity && bP === Infinity) return 0;
        if (aP === Infinity) return -1 * dir;
        if (bP === Infinity) return  1 * dir;
        return (aP - bP) * dir;
      }
      // Колонка periodKey
      const aQ = a.periods[col] ?? 0;
      const bQ = b.periods[col] ?? 0;
      return (aQ - bQ) * dir;
    });
  }, [rows, sortDescriptor, stockMap]);

  /**
   * DisplayRow-масив для HeroUI Table.
   * Кожен об'єкт містить `_stock` — залишок на початок місяця.
   * Завдяки спреду `{ ...row, _stock }` HeroUI отримує НОВІ об'єкти
   * щоразу, коли stockMap або isStockLoading змінюються, і примусово
   * перемальовує клітинки (без цього Table кешує рядки за ключем `sku`
   * і не оновлює вміст при зміні зовнішнього renderCell).
   */
  const displayRows = useMemo<DisplayRow[]>(() =>
    sortedRows.map(row => ({
      ...row,
      _stock: isStockLoading
        ? undefined                              // завантажується
        : (stockMap[row.sku] !== undefined
            ? stockMap[row.sku]
            : null),                             // немає даних
    })),
  [sortedRows, stockMap, isStockLoading]);

  // ---------------------------------------------------------------------------
  // Колонки таблиці
  // ---------------------------------------------------------------------------
  const columns = useMemo(() => {
    const base = [
      { key: 'productName',  label: 'Товар',             allowsSorting: true },
      { key: 'openingStock', label: 'Початок місяця',    allowsSorting: true },
    ];
    const periodCols = periods.map(p => ({
      key: p.key,
      label: p.label,
      allowsSorting: true,
    }));
    const end = [
      { key: 'totalSold',   label: 'Всього',    allowsSorting: true },
      { key: 'salePercent', label: 'Продаж %',  allowsSorting: true },
    ];
    return [...base, ...periodCols, ...end];
  }, [periods]);

  // ---------------------------------------------------------------------------
  // Масиви значень для кольорової градації
  // ---------------------------------------------------------------------------

  /** Всі наявні залишки (без undefined/null) для градації openingStock */
  const allOpeningStocks = useMemo<number[]>(
    () => displayRows.map(r => r._stock ?? 0),
    [displayRows],
  );

  /** Всі значення totalSold для градації */
  const allTotalSolds = useMemo<number[]>(
    () => displayRows.map(r => r.totalSold),
    [displayRows],
  );

  // ---------------------------------------------------------------------------
  // Рендер рядка
  // ---------------------------------------------------------------------------
  const renderCell = useCallback(
    (row: DisplayRow, colKey: string): React.ReactNode => {
      if (colKey === 'productName') {
        return <span className="font-medium text-sm">{row.productName}</span>;
      }
      if (colKey === 'openingStock') {
        if (row._stock === undefined) return <Spinner size="sm" />;
        if (row._stock === null) return <span className="text-default-400">—</span>;
        const colors = getValueColor(row._stock, allOpeningStocks);
        return (
          <Chip size="sm" variant="flat" classNames={{ base: colors.base, content: colors.content }}>
            {row._stock.toLocaleString('uk-UA')}
          </Chip>
        );
      }
      if (colKey === 'totalSold') {
        const colors = getValueColor(row.totalSold, allTotalSolds);
        return (
          <Chip size="sm" variant="flat" classNames={{ base: colors.base, content: colors.content }}>
            {row.totalSold.toLocaleString('uk-UA')}
          </Chip>
        );
      }
      if (colKey === 'salePercent') {
        const openingStock = row._stock === undefined ? undefined : (row._stock ?? 0);
        return getPercentChip(row.totalSold, openingStock);
      }
      // Колонка period
      const qty = row.periods[colKey] ?? 0;
      return (
        <span className={qty === 0 ? 'text-default-300 text-sm' : 'text-sm'}>
          {qty === 0 ? '—' : qty.toLocaleString('uk-UA')}
        </span>
      );
    },
    [allOpeningStocks, allTotalSolds],
  );

  // ---------------------------------------------------------------------------
  // Рендер
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-4">
      {/* Заголовок + фільтри */}
      <div className="bg-white rounded-xl p-4 flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-lg font-semibold text-default-800">Динаміка продажів по тижнях</h1>
        <div className="flex items-center gap-3">
          <MonthSwitcher
            value={selectedMonth}
            onChange={setSelectedMonth}
            disableFuture
            size="sm"
          />
          <Select
            aria-label="Режим відображення"
            size="sm"
            className="w-48"
            selectedKeys={[groupBy]}
            onSelectionChange={(keys) => {
              const val = Array.from(keys)[0] as GroupBy;
              if (val) setGroupBy(val);
            }}
          >
            {GROUP_BY_OPTIONS.map(o => (
              <SelectItem key={o.key}>{o.label}</SelectItem>
            ))}
          </Select>
        </div>
      </div>

      {/* Повідомлення про помилку */}
      {salesError && (
        <div className="bg-danger-50 border border-danger-200 rounded-xl p-4 text-danger-700 text-sm">
          ❌ {salesError}
        </div>
      )}

      {/* Таблиця */}
      <div className="bg-white rounded-xl overflow-hidden">
        <Table
          aria-label="Динаміка продажів по тижнях"
          sortDescriptor={sortDescriptor}
          onSortChange={setSortDescriptor}
					
          classNames={{
            th: 'bg-default-200/60 first:rounded-s-sm last:rounded-e-sm',
            td: [
							"py-2 text-default-700",
							"[&>*]:z-1 [&>*]:relative",
							"before:pointer-events-none before:content-[''] before:absolute before:z-0 before:inset-0 before:opacity-0 before:bg-default/40",
							"group-hover/tr:before:opacity-70",
							"first:before:rounded-s-sm last:before:rounded-e-sm"
						],
          }}
        >
          <TableHeader columns={columns}>
            {(col) => (
              <TableColumn
                key={col.key}
                allowsSorting={col.allowsSorting}
                className={col.key === 'salePercent' ? '' : ''}
              >
                {col.label}
              </TableColumn>
            )}
          </TableHeader>
          <TableBody
            items={displayRows}
            isLoading={isSalesLoading}
            loadingContent={<Spinner label="Завантаження..." />}
            emptyContent={
              isSalesLoading
                ? ' '
                : salesError
                  ? 'Помилка завантаження'
                  : 'Немає даних за обраний місяць'
            }
          >
            {(row) => (
              <TableRow key={row.sku}>
                {(colKey) => (
                  <TableCell className={colKey === 'salePercent' ? '' : ''}>
                    {renderCell(row, colKey as string)}
                  </TableCell>
                )}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Метадані */}
      {salesData && !isSalesLoading && (
        <div className="text-xs text-default-400 px-1 flex gap-4">
          <span>Замовлень: <b>{salesData.metadata.totalOrders}</b></span>
          <span>Продуктів: <b>{rows.length}</b></span>
          <span>Кеш: <b>{salesData.metadata.ordersWithCache}</b> / {salesData.metadata.totalOrders}</span>
          <span>Оновлено: {new Date(salesData.metadata.generatedAt).toLocaleTimeString('uk-UA')}</span>
        </div>
      )}
    </div>
  );
}
