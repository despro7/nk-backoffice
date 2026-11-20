import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Skeleton,
  Tab,
  Tabs,
} from '@heroui/react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useApi } from '@/hooks/useApi';
import { useProductMovementsDrawer } from '@/features/product-movements/context/productMovementsDrawerContext.shared';
import { useWarehouseDocumentEditDrawer } from '@/features/warehouse-document-edit/context/WarehouseDocumentEditDrawerContext';
import {
  resolveDocumentIconClass,
  resolveDocumentIconName,
} from '@/features/product-movements/productMovementsDocumentIcon';
import {
  WAREHOUSE_STATEMENT_HISTORY_MAX_DAYS,
  type WarehouseStatementHistoryDocument,
  type WarehouseStatementHistoryPoint,
  type WarehouseStatementHistoryResponse,
  type WarehouseStatementPeriod,
} from '@shared/types/warehouseStatement';
import { formatConstructorNumber } from '../../shared/constructor';
import { readApiError } from '../warehouseStatementUtils';

export interface ProductHistoryTarget {
  goodId: string;
  label: string;
  sku?: string | null;
  /** Відбір складу / фірми для історії (ключі = імена вимірів shape). */
  dimensionFilters: Record<string, string[]>;
  /** Підпис розрізу (склад) для шапки. */
  scopeLabel?: string;
  /** Склад для «Рухи по товару», якщо він один. */
  storageId?: string;
}

interface ProductHistoryDrawerProps {
  target: ProductHistoryTarget | null;
  reportPeriod: WarehouseStatementPeriod | null;
  onClose: () => void;
}

type RangeKey = 'report' | '7' | '30' | '90';
type MetricKey = 'qty' | 'amount';

const DAY_MS = 86_400_000;

function ymdToUtc(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function utcToYmd(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

function shortDate(value: string): string {
  const [, month, day] = value.split('-');
  return `${day}.${month}`;
}

function fullDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

function resolveRange(period: WarehouseStatementPeriod | null, key: RangeKey): { startDate: string; endDate: string } {
  const today = utcToYmd(Date.now());
  const endDate = period?.mode === 'dateRange' ? period.endDate : period?.mode === 'asOfDate' ? period.asOfDate : today;
  if (key === 'report' && period?.mode === 'dateRange') {
    const maxStart = utcToYmd(ymdToUtc(endDate) - (WAREHOUSE_STATEMENT_HISTORY_MAX_DAYS - 1) * DAY_MS);
    return { startDate: period.startDate > maxStart ? period.startDate : maxStart, endDate };
  }
  const days = key === 'report' ? 30 : Number(key);
  return { startDate: utcToYmd(ymdToUtc(endDate) - (days - 1) * DAY_MS), endDate };
}

interface ChartPoint extends WarehouseStatementHistoryPoint {
  label: string;
  end: number;
  receipt: number;
  expense: number;
}

/** Перемикач-вкладки: активна темна, іконка й текст вирівняні по центру. */
function Segmented<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: T;
  options: Array<{ key: T; label: string; icon?: IconName }>;
  onChange: (key: T) => void;
}) {
  return (
    <Tabs
      size="md"
      aria-label={ariaLabel}
      selectedKey={value}
      onSelectionChange={(key) => onChange(key as T)}
      // Без анімованого курсора: HeroUI міряє його ширину під час анімації відкриття drawer
      // і курсор виходить вужчим за вкладку. Фон активної вкладки задаємо через `tab`.
      disableCursorAnimation
      classNames={{
        tab: 'h-9 rounded-medium transition-colors data-[selected=true]:bg-default-700 data-[selected=true]:shadow-sm',
        tabContent:
          'flex items-center text-default-600 group-data-[selected=true]:text-white group-data-[selected=true]:font-medium',
      }}
    >
      {options.map((option) => (
        <Tab
          key={option.key}
          title={
            <span className="flex items-center gap-1.5 leading-none">
              {option.icon ? <DynamicIcon name={option.icon} size={15} className="shrink-0" /> : null}
              <span className="leading-none">{option.label}</span>
            </span>
          }
        />
      ))}
    </Tabs>
  );
}

/** Пункт легенди, що вмикає / вимикає лінію. */
function LegendToggle({
  color,
  label,
  active,
  onToggle,
}: {
  color: string;
  label: string;
  active: boolean;
  onToggle?: () => void;
}) {
  const content = (
    <>
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: active ? color : 'transparent', border: `2px solid ${color}` }} />
      {label}
    </>
  );
  if (!onToggle) {
    return <span className="inline-flex items-center gap-1.5 text-xs text-default-600">{content}</span>;
  }
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs transition-colors hover:bg-default-100 ${
        active ? 'text-default-700' : 'text-default-400 line-through'
      }`}
      onClick={onToggle}
    >
      {content}
    </button>
  );
}

const COLORS = {
  balance: 'hsl(217, 91%, 60%)',
  receipt: 'hsl(142, 71%, 45%)',
  expense: 'hsl(0, 84%, 60%)',
};

function HistoryTooltip({
  active,
  payload,
  metric,
  bucket,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ChartPoint }>;
  metric: MetricKey;
  bucket: WarehouseStatementHistoryResponse['bucket'];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const format = metric === 'qty' ? 'qty' : 'money';
  const title = bucket === 'week' && point.endDate !== point.date
    ? `${fullDate(point.date)} – ${fullDate(point.endDate)}`
    : fullDate(point.date);
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-md border border-default-200 min-w-40">
      <p className="font-medium text-default-800 mb-1">{title}</p>
      <p className="flex justify-between gap-4 text-default-700">
        <span>Залишок</span>
        <span className="tabular-nums font-semibold">{formatConstructorNumber(point.end, format)}</span>
      </p>
      <p className="flex justify-between gap-4 text-success-600">
        <span>Прихід</span>
        <span className="tabular-nums">{formatConstructorNumber(point.receipt, format)}</span>
      </p>
      <p className="flex justify-between gap-4 text-danger-500">
        <span>Витрата</span>
        <span className="tabular-nums">{formatConstructorNumber(point.expense, format)}</span>
      </p>
    </div>
  );
}

function DocumentRow({
  doc,
  metric,
  showDate,
  onOpen,
}: {
  doc: WarehouseStatementHistoryDocument;
  metric: MetricKey;
  /** Діапазон із кількох днів: показувати дату, а не лише час. */
  showDate: boolean;
  onOpen: (doc: WarehouseStatementHistoryDocument) => void;
}) {
  const format = metric === 'qty' ? 'qty' : 'money';
  const unit = metric === 'qty' ? 'од.' : '₴';
  const receipt = metric === 'qty' ? doc.qtyReceipt : doc.amountReceipt;
  const expense = metric === 'qty' ? doc.qtyExpense : doc.amountExpense;
  const isIn = Math.abs(receipt) >= Math.abs(expense);
  const counterpart = doc.counterpartLabels.join(', ');
  const route = counterpart
    ? isIn
      ? `${counterpart} → ${doc.storageLabel}`
      : `${doc.storageLabel} → ${counterpart}`
    : doc.storageLabel;

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-default-100 last:border-b-0">
      <DynamicIcon
        name={resolveDocumentIconName(doc.label) as IconName}
        size={16}
        className={`shrink-0 ${resolveDocumentIconClass(doc.label)}`}
      />
      <div className="min-w-0 flex-1">
        {doc.recorderId ? (
          <button
            type="button"
            className="block max-w-full truncate text-left text-sm text-primary hover:underline"
            onClick={() => onOpen(doc)}
          >
            {doc.label}
          </button>
        ) : (
          <span className="block truncate text-sm">{doc.label}</span>
        )}
        <span className="block truncate text-xs text-default-500">
          {showDate ? `${fullDate(doc.date)} ` : ''}
          {doc.dateTime.slice(11, 16)}
          {route ? ` · ${route}` : ''}
        </span>
      </div>
      <div className="shrink-0 text-right text-sm tabular-nums">
        {Math.abs(receipt) > 1e-9 ? (
          <div className="text-success-600">+{formatConstructorNumber(receipt, format)} {unit}</div>
        ) : null}
        {Math.abs(expense) > 1e-9 ? (
          <div className="text-danger-500">−{formatConstructorNumber(expense, format)} {unit}</div>
        ) : null}
      </div>
    </div>
  );
}

function StatTile({
  title,
  value,
  unit,
  hint,
  tone,
}: {
  title: string;
  value: string;
  /** Одиниця основного значення (`₴` / `од.`). */
  unit: string;
  hint?: string;
  tone?: 'success' | 'danger';
}) {
  // hint – той самий показник в іншій одиниці (кількість ↔ собівартість), з підписом.
  const toneClass = tone === 'success' ? 'text-success-600' : tone === 'danger' ? 'text-danger-500' : 'text-default-900';
  return (
    <div className="rounded-xl bg-default-50 px-3 py-2.5 min-w-0">
      <p className="text-xs text-default-500">{title}</p>
      <p className={`text-base font-semibold tabular-nums truncate ${toneClass}`}>
        {value}
        <span className="ml-1 text-sm font-medium opacity-70">{unit}</span>
      </p>
      {hint ? <p className="text-xs text-default-400 tabular-nums leading-snug break-words">{hint}</p> : null}
    </div>
  );
}

export default function ProductHistoryDrawer({ target, reportPeriod, onClose }: ProductHistoryDrawerProps) {
  const { apiCall } = useApi();
  const movementsDrawer = useProductMovementsDrawer();
  const { open: openDocument } = useWarehouseDocumentEditDrawer();
  /** Обраний діапазон бакетів (дати початку бакета). Клік = один бакет, перетягування = діапазон. */
  const [selection, setSelection] = useState<{ from: string; to: string } | null>(null);
  const [drag, setDrag] = useState<{ from: string; to: string } | null>(null);
  const [rangeKey, setRangeKey] = useState<RangeKey>('report');
  const [metric, setMetric] = useState<MetricKey>('qty');
  const [showReceipt, setShowReceipt] = useState(true);
  const [showExpense, setShowExpense] = useState(true);

  const hasReportRange = reportPeriod?.mode === 'dateRange';
  const effectiveRangeKey: RangeKey = rangeKey === 'report' && !hasReportRange ? '30' : rangeKey;
  const range = useMemo(() => resolveRange(reportPeriod, effectiveRangeKey), [effectiveRangeKey, reportPeriod]);

  const query = useQuery({
    queryKey: ['warehouse-statement-history', target?.goodId, target?.dimensionFilters, range],
    enabled: Boolean(target),
    staleTime: 60_000,
    queryFn: async (): Promise<WarehouseStatementHistoryResponse> => {
      const response = await apiCall('/api/reports/warehouse-statement/history', {
        method: 'POST',
        body: JSON.stringify({
          goodId: target?.goodId,
          startDate: range.startDate,
          endDate: range.endDate,
          dimensionFilters: target?.dimensionFilters,
        }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Не вдалося завантажити історію товару'));
      }
      return (await response.json()) as WarehouseStatementHistoryResponse;
    },
  });

  const data = query.data;

  useEffect(() => {
    setSelection(null);
    setDrag(null);
  }, [target?.goodId, range.startDate, range.endDate]);

  /** Межі виділення в днях: від початку першого бакета до кінця останнього. */
  const selectedRange = useMemo(() => {
    if (!selection || !data) return null;
    const [first, last] = selection.from <= selection.to
      ? [selection.from, selection.to]
      : [selection.to, selection.from];
    const lastPoint = data.points.find((point) => point.date === last);
    return { from: first, to: lastPoint?.endDate ?? last, firstBucket: first, lastBucket: last };
  }, [data, selection]);
  const selectedDocuments = useMemo(
    () =>
      selectedRange
        ? (data?.documents ?? []).filter(
          (doc) => doc.date >= selectedRange.from && doc.date <= selectedRange.to,
        )
        : [],
    [data?.documents, selectedRange],
  );
  const selectedTotals = useMemo(() => {
    const sum = { receipt: 0, expense: 0 };
    for (const doc of selectedDocuments) {
      sum.receipt += metric === 'qty' ? doc.qtyReceipt : doc.amountReceipt;
      sum.expense += metric === 'qty' ? doc.qtyExpense : doc.amountExpense;
    }
    return sum;
  }, [metric, selectedDocuments]);

  const pointFromState = (state: unknown): ChartPoint | null =>
    ((state as { activePayload?: Array<{ payload?: ChartPoint }> } | null)?.activePayload?.[0]?.payload ?? null);
  const format = metric === 'qty' ? 'qty' : 'money';
  const chartData = useMemo<ChartPoint[]>(
    () =>
      (data?.points ?? []).map((point) => ({
        ...point,
        label: shortDate(point.date),
        end: metric === 'qty' ? point.qtyEnd : point.amountEnd,
        receipt: metric === 'qty' ? point.qtyReceipt : point.amountReceipt,
        expense: metric === 'qty' ? point.qtyExpense : point.amountExpense,
      })),
    [data?.points, metric],
  );

  const totals = data?.totals;
  const unit = metric === 'qty' ? 'од.' : '₴';
  const pick = (qty: number | undefined, amount: number | undefined) => (metric === 'qty' ? qty : amount);
  /** Другий показник з підписом, щоб не плутати кількість і гривні. */
  const other = (qty: number | undefined, amount: number | undefined) =>
    metric === 'qty'
      ? `${formatConstructorNumber(amount, 'money')} ₴`
      : `${formatConstructorNumber(qty, 'qty')} од.`;

  const openMovements = () => {
    if (!target) return;
    onClose();
    movementsDrawer.open({
      dilovodGoodId: target.goodId,
      productName: target.label,
      storageId: target.storageId,
      period: range,
      autoGenerate: true,
    });
  };

  return (
    <Drawer
      isOpen={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="right"
      size="3xl"
      classNames={{ base: 'flex flex-col', body: 'flex-1 min-h-0 overflow-y-auto', closeButton: 'top-3 right-3' }}
    >
      <DrawerContent>
        <DrawerHeader className="border-b border-default-200 shrink-0 flex flex-col gap-0.5 pr-12">
          <div className="flex items-center gap-2 min-w-0">
            <DynamicIcon name="chart-area" size={18} className="shrink-0 text-default-500" />
            <span className="truncate text-lg font-semibold">{target?.label}</span>
            {target?.sku ? <span className="text-sm text-default-400 shrink-0">・{target.sku}</span> : null}
          </div>
          <span className="text-xs font-normal text-default-500">
            {fullDate(range.startDate)} – {fullDate(range.endDate)}
            {target?.scopeLabel ? ` · ${target.scopeLabel}` : ''}
            {data?.bucket === 'week' ? ' · по тижнях' : ''}
          </span>
        </DrawerHeader>

        <DrawerBody className="flex flex-col gap-5 py-5 overflow-y-auto min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented<MetricKey>
              ariaLabel="Показник"
              value={metric}
              onChange={setMetric}
              options={[
                { key: 'qty', label: 'Кількість', icon: 'package' },
                { key: 'amount', label: 'Собівартість', icon: 'banknote' },
              ]}
            />
            <Segmented<RangeKey>
              ariaLabel="Період графіка"
              value={effectiveRangeKey}
              onChange={setRangeKey}
              options={[
                ...(hasReportRange ? [{ key: 'report' as const, label: 'Період звіту' }] : []),
                { key: '7', label: '7 днів' },
                { key: '30', label: '30 днів' },
                { key: '90', label: '90 днів' },
              ]}
            />
          </div>

          {query.error instanceof Error ? (
            <Alert color="danger" variant="faded" title="Не вдалося завантажити історію" description={query.error.message} />
          ) : null}
          {data?.warning ? <Alert color="warning" variant="faded" title={data.warning} /> : null}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {query.isLoading || !totals ? (
              Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-16 rounded-xl" />)
            ) : (
              <>
                <StatTile
                  unit={unit}
                  title="На початок"
                  value={formatConstructorNumber(pick(totals.qtyStart, totals.amountStart), format)}
                  hint={other(totals.qtyStart, totals.amountStart)}
                />
                <StatTile
                  unit={unit}
                  title="Прихід"
                  tone="success"
                  value={formatConstructorNumber(pick(totals.qtyReceipt, totals.amountReceipt), format)}
                  hint={other(totals.qtyReceipt, totals.amountReceipt)}
                />
                <StatTile
                  unit={unit}
                  title="Витрата"
                  tone="danger"
                  value={formatConstructorNumber(pick(totals.qtyExpense, totals.amountExpense), format)}
                  hint={other(totals.qtyExpense, totals.amountExpense)}
                />
                <StatTile
                  unit={unit}
                  title="На кінець"
                  value={formatConstructorNumber(pick(totals.qtyFinal, totals.amountFinal), format)}
                  hint={other(totals.qtyFinal, totals.amountFinal)}
                />
              </>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {query.isLoading ? (
              <Skeleton className="rounded-xl h-80 w-full opacity-60" />
            ) : chartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-80 text-default-400">
                <DynamicIcon name="chart-area" size={40} className="mb-2 opacity-40" />
                <span className="text-sm">Немає даних за період</span>
              </div>
            ) : (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    className="cursor-crosshair select-none"
                    onMouseDown={(state) => {
                      const point = pointFromState(state);
                      if (point) setDrag({ from: point.date, to: point.date });
                    }}
                    onMouseMove={(state) => {
                      const point = pointFromState(state);
                      if (drag && point && point.date !== drag.to) setDrag({ ...drag, to: point.date });
                    }}
                    onMouseUp={() => {
                      if (!drag) return;
                      const single = drag.from === drag.to;
                      setSelection((current) =>
                        single && current && current.from === drag.from && current.to === drag.to ? null : drag,
                      );
                      setDrag(null);
                    }}
                    onMouseLeave={() => setDrag(null)}
                  >
                    <defs>
                      <linearGradient id="ws-history-balance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.balance} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={COLORS.balance} stopOpacity={0.04} />
                      </linearGradient>
                      <linearGradient id="ws-history-receipt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.receipt} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={COLORS.receipt} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="ws-history-expense" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.expense} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={COLORS.expense} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" className="opacity-40" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      width={64}
                      tickFormatter={(value: number) => formatConstructorNumber(value, metric === 'qty' ? 'qty' : 'money').replace(/,00$/, '')}
                    />
                    <Tooltip content={<HistoryTooltip metric={metric} bucket={data?.bucket ?? 'day'} />} />
                    {(() => {
                      const shown = drag ?? (selectedRange ? { from: selectedRange.firstBucket, to: selectedRange.lastBucket } : null);
                      if (!shown) return null;
                      if (shown.from === shown.to) {
                        return (
                          <ReferenceLine x={shortDate(shown.from)} stroke="hsl(220, 9%, 46%)" strokeDasharray="4 4" />
                        );
                      }
                      return (
                        <ReferenceArea
                          x1={shortDate(shown.from)}
                          x2={shortDate(shown.to)}
                          fill="hsl(220, 9%, 46%)"
                          fillOpacity={0.12}
                          stroke="hsl(220, 9%, 46%)"
                          strokeOpacity={0.4}
                        />
                      );
                    })()}
                    {showReceipt ? (
                      <Area
                        type="monotone"
                        dataKey="receipt"
                        name="Прихід"
                        stroke={COLORS.receipt}
                        fill="url(#ws-history-receipt)"
                        strokeWidth={1.5}
                      />
                    ) : null}
                    {showExpense ? (
                      <Area
                        type="monotone"
                        dataKey="expense"
                        name="Витрата"
                        stroke={COLORS.expense}
                        fill="url(#ws-history-expense)"
                        strokeWidth={1.5}
                      />
                    ) : null}
                    <Area
                      type="monotone"
                      dataKey="end"
                      name="Залишок"
                      stroke={COLORS.balance}
                      fill="url(#ws-history-balance)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <LegendToggle
                color={COLORS.balance}
                label={`Залишок на кінець ${data?.bucket === 'week' ? 'тижня' : 'дня'}`}
                active
              />
              <LegendToggle
                color={COLORS.receipt}
                label="Прихід"
                active={showReceipt}
                onToggle={() => setShowReceipt((current) => !current)}
              />
              <LegendToggle
                color={COLORS.expense}
                label="Витрата"
                active={showExpense}
                onToggle={() => setShowExpense((current) => !current)}
              />
              <span className="ml-auto text-xs text-default-400">
                Клікніть на день або виділіть діапазон, щоб побачити рухи
              </span>
            </div>
          </div>

          {selectedRange ? (
            <section className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-default-800">
                  Рухи за{' '}
                  {selectedRange.to !== selectedRange.from
                    ? `${fullDate(selectedRange.from)} – ${fullDate(selectedRange.to)}`
                    : fullDate(selectedRange.from)}
                  {selectedDocuments.length > 0 ? (
                    <span className="ml-2 font-normal text-default-500 tabular-nums">
                      <span className="text-success-600">+{formatConstructorNumber(selectedTotals.receipt, format)}</span>
                      {' / '}
                      <span className="text-danger-500">−{formatConstructorNumber(selectedTotals.expense, format)}</span>
                      {' '}{unit} · документів: {selectedDocuments.length}
                    </span>
                  ) : null}
                </h3>
                <Button size="sm" variant="light" onPress={() => setSelection(null)}>
                  Сховати
                </Button>
              </div>
              {selectedDocuments.length === 0 ? (
                <p className="rounded-xl bg-default-50 px-3 py-4 text-center text-sm text-default-500">
                  Рухів за цей період немає
                </p>
              ) : (
                <div className="rounded-xl border border-default-200 max-h-96 overflow-y-auto">
                  {selectedDocuments.map((doc, index) => (
                    <DocumentRow
                      key={`${doc.recorderId ?? doc.label}:${doc.storageLabel}:${index}`}
                      doc={doc}
                      metric={metric}
                      showDate={selectedRange.to !== selectedRange.from}
                      onOpen={(item) => {
                        if (item.recorderId) {
                          openDocument({ dilovodDocumentId: item.recorderId, documentLabel: item.label });
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </DrawerBody>

        <DrawerFooter className="border-t border-default-200 shrink-0">
          <Button
            variant="flat"
            startContent={<DynamicIcon name="list" size={16} />}
            onPress={openMovements}
            isDisabled={!target}
          >
            Відкрити рухи
          </Button>
          <Button variant="light" onPress={onClose}>
            Закрити
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
