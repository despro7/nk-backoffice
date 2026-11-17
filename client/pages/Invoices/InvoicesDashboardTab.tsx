import { useCallback, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { Button, Card, CardBody, CardHeader, Chip, Input, Skeleton, Tab, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow, Tabs, Tooltip } from '@heroui/react';
import { CalendarDate } from '@internationalized/date';
import type { DateRange } from '@react-types/datepicker';
import { DynamicIcon } from 'lucide-react/dynamic';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { HR_TABLE_CLASS_NAMES } from '@/pages/Hr/hrUi';
import {
  ReportsFilterBuilder,
  createDateRangeFilterConfig,
  createPeriodFilterConfig,
  createResetFilterConfig,
  type ReportFilterConfig,
} from '@/pages/Reports/shared/filters';
import { ToastService } from '@/services/ToastService';
import { invoicesApi } from '@/services/InvoicesService';
import type { DashboardData, DashboardMode, DashboardMonthRow, DashboardRow } from '@shared/types/invoices';
import { daysInclusive, formatHm, formatMoneyUa, parseHm } from '@shared/utils/invoiceCalc';
import { todayKyivYmd } from '@shared/utils/kyivDateTime';
import { InvoicesChartTooltip } from './InvoicesChartTooltip';

const usd = (v: number): string => `${v < 0 ? '-' : ''}$${Math.abs(Math.round(v)).toLocaleString('uk-UA')}`;
const usd2 = (v: number): string => `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2).replace('.', ',')}`;
const uah = (v: number): string => formatMoneyUa(Math.round(v)).replace(',00', '');
const short = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const periodLabel = (r: Pick<DashboardRow, 'start' | 'end'>): string => `${short(r.start)}–${short(r.end)}.${r.end.slice(2, 4)}`;
const monthLabel = (m: string): string => `${m.slice(5, 7)}.${m.slice(0, 4)}`;
const pct = (v: number | null): string => (v == null ? '–' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(1).replace('.', ',')}%`);
const rateText = (v: number | null): string => (v == null ? '' : v.toFixed(2).replace('.', ','));

// Light, friendly palette.
const C_PAID = 'hsl(217, 91%, 68%)';
const C_COST = 'hsl(351, 95%, 71%)'; // rose: cost of hours
const C_LINE = 'hsl(84, 70%, 42%)'; // darker lime: sold portions
const C_FACT = 'hsl(262, 83%, 74%)';
const C_OVER = 'hsl(24, 94%, 59%)';
const AXIS = { fontSize: 12, fill: 'hsl(215, 14%, 46%)' } as const;
const GRID_CLASS = 'opacity-40';
const legendLabel = (value: string) => <span className="text-xs text-default-600">{value}</span>;
const LINE_PROPS = { type: 'monotone' as const, strokeWidth: 3, dot: false, activeDot: { r: 5 } };
const X_AXIS_PROPS = { tick: AXIS, axisLine: false, tickLine: false, angle: -45, textAnchor: 'end' as const, height: 70, interval: 'preserveStartEnd' as const };
const CHART_MARGIN = { top: 16, right: 16, left: 8, bottom: 8 };

/** Segmented switch without shadows: flat style for the dashboard controls. */
function FlatTabs(props: ComponentProps<typeof Tabs>) {
  return (
    <Tabs
      size="sm"
      radius="md"
      {...props}
      classNames={{
        tabList: 'gap-0.5 p-0.5 bg-default-100 shadow-none',
        cursor: 'shadow-none bg-white border border-default-200',
        tab: 'h-7 px-3',
        tabContent: 'text-xs text-default-500 group-data-[selected=true]:text-default-900',
      }}
    />
  );
}

type ChartStyle = 'lines' | 'bars' | 'both';
const BAR_RADIUS: [number, number, number, number] = [6, 6, 0, 0];

type SeriesDef = { key: string; name: string; color: string };

/**
 * One chart for several metrics. `both` = the first metric as bars, the rest as smooth lines.
 */
function MetricChart({
  data,
  series,
  style,
  yTickFormatter,
  formatValue,
}: {
  data: Array<Record<string, string | number>>;
  series: SeriesDef[];
  style: ChartStyle;
  yTickFormatter?: (v: number) => string;
  formatValue: (value: number, name: string) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid strokeDasharray="3 3" className={GRID_CLASS} />
        <XAxis dataKey="label" {...X_AXIS_PROPS} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={yTickFormatter} />
        <ChartTooltip content={<InvoicesChartTooltip formatValue={formatValue} />} />
        <Legend formatter={legendLabel} wrapperStyle={{ paddingTop: 8 }} />
        {series.map((s, idx) =>
          style === 'bars' || (style === 'both' && idx === 0) ? (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={BAR_RADIUS} />
          ) : (
            <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} {...LINE_PROPS} />
          ),
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function StyleTabs({ value, onChange, allowBoth }: { value: ChartStyle; onChange: (s: ChartStyle) => void; allowBoth: boolean }) {
  return (
    <FlatTabs selectedKey={value} onSelectionChange={(k) => onChange(k === 'bars' || k === 'both' ? k : 'lines')} aria-label="Стиль діаграми">
      <Tab key="lines" title={<DynamicIcon name="chart-spline" size={16} />} aria-label="Лінії" />
      <Tab key="bars" title={<DynamicIcon name="chart-column" size={16} />} aria-label="Стовпчики" />
      {allowBoth ? <Tab key="both" title={<DynamicIcon name="chart-no-axes-combined" size={16} />} aria-label="Стовпчики і лінії" /> : null}
    </FlatTabs>
  );
}

type Grain = 'half' | 'month';
type Currency = 'uah' | 'usd';
type PresetKey = 'all' | '6m' | '12m' | 'ytd';

const PRESET_OPTIONS: Array<{ key: PresetKey; label: string }> = [
  { key: 'all', label: 'Весь час' },
  { key: '6m', label: 'Останні 6 місяців' },
  { key: '12m', label: 'Останні 12 місяців' },
  { key: 'ytd', label: 'З початку року' },
];

function todayCalendar(): CalendarDate {
  const [year, month, day] = todayKyivYmd().split('-').map(Number);
  return new CalendarDate(year, month, day);
}

function presetRange(key: PresetKey): DateRange | null {
  if (key === 'all') return null;
  const end = todayCalendar();
  if (key === 'ytd') return { start: new CalendarDate(end.year, 1, 1), end };
  const months = key === '6m' ? 6 : 12;
  return { start: end.subtract({ months }).add({ days: 1 }), end };
}

type Point = {
  key: string;
  label: string;
  subtitle?: string;
  paidUah: number;
  paidUsd: number;
  costUah: number;
  costUsd: number;
  portions: number;
  factHours: number;
  overdraftHours: number;
};

/** Rows → chart points: every half-month, or summed by month. */
function toPoints(rows: DashboardRow[], grain: Grain): Point[] {
  const costUahOf = (r: DashboardRow) => r.costUsd * (r.usdRate ?? 0);
  if (grain === 'half') {
    return rows.map((r) => ({
      key: String(r.periodId),
      label: periodLabel(r),
      paidUah: r.amountUah,
      paidUsd: r.amountUsd,
      costUah: costUahOf(r),
      costUsd: r.costUsd,
      portions: r.portions ?? 0,
      factHours: (r.factMinutes ?? 0) / 60,
      overdraftHours: r.overdraftMinutes / 60,
    }));
  }
  const byMonth = new Map<string, Point>();
  for (const r of rows) {
    const key = r.start.slice(0, 7);
    const cur = byMonth.get(key) ?? { key, label: monthLabel(key), paidUah: 0, paidUsd: 0, costUah: 0, costUsd: 0, portions: 0, factHours: 0, overdraftHours: 0 };
    cur.paidUah += r.amountUah;
    cur.paidUsd += r.amountUsd;
    cur.costUah += costUahOf(r);
    cur.costUsd += r.costUsd;
    cur.portions += r.portions ?? 0;
    cur.factHours += (r.factMinutes ?? 0) / 60;
    cur.overdraftHours = r.overdraftMinutes / 60; // balance at the end of the month
    byMonth.set(key, cur);
  }
  return [...byMonth.values()];
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

type Tone = 'good' | 'bad' | 'neutral';
const TONE_CLASS: Record<Tone, string> = { good: 'text-success-600', bad: 'text-danger-600', neutral: 'text-default-500' };

function Tile({ label, value, hint, hintTone = 'neutral', hintIcon }: { label: string; value: string; hint?: string; hintTone?: Tone; hintIcon?: 'up' | 'down' }) {
  return (
    <div className="rounded-lg border border-default-200 p-3">
      <div className="text-xs text-default-500">{label}</div>
      <div className="text-xl font-semibold text-default-900">{value}</div>
      {hint ? (
        <div className={`flex items-center gap-1 text-xs font-medium ${TONE_CLASS[hintTone]}`}>
          {hintIcon ? <DynamicIcon name={hintIcon === 'up' ? 'trending-up' : 'trending-down'} size={14} /> : null}
          {hint}
        </div>
      ) : null}
    </div>
  );
}

/** Text input that saves on blur / Enter and only when the value changed. */
function EditableCell({ value, placeholder, onSave, width = 'w-24', align = 'text-right' }: { value: string; placeholder?: string; onSave: (next: string) => Promise<void>; width?: string; align?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft.trim() !== value.trim()) void onSave(draft.trim());
  };
  return (
    <Input
      size="sm"
      variant="flat"
      aria-label={placeholder ?? 'Значення'}
      placeholder={placeholder}
      value={draft}
      onValueChange={setDraft}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={width}
      classNames={{ input: align }}
    />
  );
}

function GrainTabs({ value, onChange }: { value: Grain; onChange: (g: Grain) => void }) {
  return (
    <FlatTabs selectedKey={value} onSelectionChange={(k) => onChange(k === 'month' ? 'month' : 'half')} aria-label="Період групування">
      <Tab key="half" title="По напівмісяцях" />
      <Tab key="month" title="По місяцях" />
    </FlatTabs>
  );
}

function ChartCard({ title, controls, children }: { title: string; controls?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="px-4 border-b border-default-200 flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold">{title}</h3>
        <div className="ml-auto flex flex-wrap items-center gap-2">{controls}</div>
      </CardHeader>
      <CardBody className="p-4 h-96">{children}</CardBody>
    </Card>
  );
}

export default function InvoicesDashboardTab({ refreshKey }: { refreshKey: number }) {
  const [mode, setMode] = useState<DashboardMode>('history');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters (shared by all charts and tables)
  const [presetKey, setPresetKey] = useState<PresetKey | null>('all');
  const [range, setRange] = useState<DateRange | null>(null);
  // Per-chart switches
  const [paidGrain, setPaidGrain] = useState<Grain>('half');
  const [currency, setCurrency] = useState<Currency>('usd');
  const [portionsGrain, setPortionsGrain] = useState<Grain>('half');
  const [styles, setStyles] = useState<Record<'paid' | 'portions' | 'hours' | 'months', ChartStyle>>({ paid: 'lines', portions: 'lines', hours: 'lines', months: 'lines' });
  const setStyle = (key: keyof typeof styles) => (s: ChartStyle) => setStyles((cur) => ({ ...cur, [key]: s }));

  const load = useCallback(async (nextMode: DashboardMode) => {
    setLoading(true);
    setError(null);
    try {
      setData(await invoicesApi.getDashboard(nextMode));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалося завантажити дашборд');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(mode);
  }, [load, mode, refreshKey]);

  const patchPeriod = async (periodId: number, patch: Parameters<typeof invoicesApi.updatePeriod>[1]) => {
    try {
      await invoicesApi.updatePeriod(periodId, patch);
      await load(mode);
    } catch (e) {
      ToastService.show({ title: 'Не вдалося зберегти', description: e instanceof Error ? e.message : undefined, color: 'danger' });
    }
  };

  const refreshRate = async (periodId: number) => {
    try {
      await invoicesApi.refreshRate(periodId);
      await load(mode);
    } catch (e) {
      ToastService.show({ title: 'Курс НБУ недоступний', description: e instanceof Error ? e.message : undefined, color: 'warning' });
    }
  };

  const filters = useMemo<ReportFilterConfig[]>(
    () => [
      createPeriodFilterConfig({
        selectedKey: presetKey,
        onChange: (key) => {
          if (!key) return;
          setPresetKey(key as PresetKey);
          setRange(presetRange(key as PresetKey));
        },
        options: PRESET_OPTIONS,
        className: 'w-56 shrink-0',
        popoverClassName: 'w-auto min-w-full',
      }),
      createDateRangeFilterConfig({
        value: range,
        onChange: (value) => {
          setRange(value);
          setPresetKey(value ? null : 'all');
        },
        className: 'w-62 shrink-0',
      }),
      createResetFilterConfig({
        onPress: () => {
          setPresetKey('all');
          setRange(null);
          setPaidGrain('half');
          setPortionsGrain('half');
          setCurrency('usd');
          setStyles({ paid: 'lines', portions: 'lines', hours: 'lines', months: 'lines' });
        },
        disabled: loading,
        className: 'h-10 px-3 gap-2 ml-auto shrink-0 bg-transparent border-1.5 border-neutral-200 hover:bg-red-100 hover:border-red-200 hover:text-red-500',
      }),
    ],
    [presetKey, range, loading],
  );

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    if (!range) return all;
    const from = range.start.toString();
    const to = range.end.toString();
    // A period that crosses the range edge counts when most of its days are inside the range
    // (a period cannot be split: its portions, hours and sum are for the whole period).
    return all.filter((r) => {
      const overlapStart = r.start > from ? r.start : from;
      const overlapEnd = r.end < to ? r.end : to;
      if (overlapStart > overlapEnd) return false;
      return daysInclusive(overlapStart, overlapEnd) * 2 >= daysInclusive(r.start, r.end);
    });
  }, [data, range]);

  const months = useMemo<DashboardMonthRow[]>(() => {
    const all = data?.months ?? [];
    if (!range) return all;
    const from = range.start.toString().slice(0, 7);
    const to = range.end.toString().slice(0, 7);
    return all.filter((m) => m.month >= from && m.month <= to);
  }, [data, range]);

  const paidPoints = useMemo(() => toPoints(rows, paidGrain).map((p) => ({ ...p, paid: currency === 'usd' ? Math.round(p.paidUsd) : Math.round(p.paidUah), cost: currency === 'usd' ? Math.round(p.costUsd) : Math.round(p.costUah) })), [rows, paidGrain, currency]);
  const portionPoints = useMemo(() => toPoints(rows, portionsGrain), [rows, portionsGrain]);
  const hoursPoints = useMemo(() => toPoints(rows, 'half').map((p) => ({ ...p, fact: round1(p.factHours), overdraft: round1(p.overdraftHours) })), [rows]);
  const monthPoints = useMemo(() => months.map((m) => ({ label: monthLabel(m.month), amountUah: Math.round(m.amountUah) })), [months]);
  const tableRows = useMemo(() => [...rows].reverse(), [rows]);

  const money = (v: number): string => (currency === 'usd' ? usd(v) : `${uah(v)} грн`);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="px-4 border-b border-default-200 flex flex-wrap items-center gap-3">
          <DynamicIcon name="chart-column" size={20} className="text-default-600" />
          <h2 className="text-lg font-semibold">Облік часу й оплат</h2>
          <div className="ml-auto flex items-center gap-2">
            <FlatTabs selectedKey={mode} onSelectionChange={(k) => setMode(k === 'live' ? 'live' : 'history')} aria-label="Режим даних">
              <Tab key="history" title="На момент рахунку" />
              <Tab key="live" title="Живі дані" />
            </FlatTabs>
            <Tooltip content="Оновити" placement="top">
              <Button isIconOnly size="sm" variant="light" aria-label="Оновити" isDisabled={loading} onPress={() => void load(mode)}>
                <DynamicIcon name={loading ? 'loader-2' : 'refresh-cw'} size={16} className={loading ? 'animate-spin' : ''} />
              </Button>
            </Tooltip>
          </div>
        </CardHeader>
        <CardBody className="p-4 gap-4">
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <p className="text-xs text-default-500">
            {mode === 'history'
              ? 'Порції й суми зафіксовані на момент виставлення рахунку (для поточного періоду без рахунку беруться живі).'
              : 'Порції перераховані за поточним станом замовлень: скасування й зміни вже враховані. Різниця з рахунком показана в таблиці.'}
          </p>
          {!data ? (
            <Skeleton className="h-24 rounded-lg" />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tile
                label="Овердрафт, год"
                value={formatHm(data.kpi.overdraftMinutes)}
                hint={usd(data.kpi.overdraftUsd)}
                // Positive: unpaid hours (red). Negative: paid ahead (green).
                hintTone={data.kpi.overdraftMinutes > 0 ? 'bad' : data.kpi.overdraftMinutes < 0 ? 'good' : 'neutral'}
              />
              <Tile label="Оплачено за 12 міс." value={`${uah(data.kpi.yearAmountUah)} грн`} hint={usd(data.kpi.yearAmountUsd)} />
              <Tile label="Вартість годин за 12 міс." value={usd(data.kpi.yearCostUsd)} />
              <Tile
                label="Середній рахунок за 6 міс."
                value={`${uah(data.kpi.avgAmountUah)} грн`}
                hint={data.kpi.avgAmountChange == null ? undefined : `${pct(data.kpi.avgAmountChange)} до попередніх 6 міс.`}
                hintTone={data.kpi.avgAmountChange == null ? 'neutral' : data.kpi.avgAmountChange >= 0 ? 'good' : 'bad'}
                hintIcon={data.kpi.avgAmountChange == null ? undefined : data.kpi.avgAmountChange >= 0 ? 'up' : 'down'}
              />
            </div>
          )}
        </CardBody>
      </Card>

      <ReportsFilterBuilder filters={filters} />
      {range ? (
        <p className="text-xs text-default-500 -mt-3">
          Період, що перетинає межу діапазону, враховується повністю, якщо більша частина його днів у діапазоні (дані періоду не можна розділити).
        </p>
      ) : null}

      {data ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ChartCard
            title="Оплачено проти вартості годин"
            controls={
              <>
                <GrainTabs value={paidGrain} onChange={setPaidGrain} />
                <FlatTabs selectedKey={currency} onSelectionChange={(k) => setCurrency(k === 'uah' ? 'uah' : 'usd')} aria-label="Валюта">
                  <Tab key="uah" title="грн" />
                  <Tab key="usd" title="$" />
                </FlatTabs>
                <StyleTabs value={styles.paid} onChange={setStyle('paid')} allowBoth />
              </>
            }
          >
            <MetricChart
              data={paidPoints}
              series={[
                { key: 'paid', name: 'Оплачено', color: C_PAID },
                { key: 'cost', name: 'Вартість годин', color: C_COST },
              ]}
              style={styles.paid}
              yTickFormatter={(v) => (currency === 'usd' ? usd(v) : `${Math.round(v / 1000)}к`)}
              formatValue={(v) => money(v)}
            />
          </ChartCard>

          <ChartCard
            title="Продані порції"
            controls={
              <>
                <GrainTabs value={portionsGrain} onChange={setPortionsGrain} />
                <StyleTabs value={styles.portions} onChange={setStyle('portions')} allowBoth={false} />
              </>
            }
          >
            <MetricChart data={portionPoints} series={[{ key: 'portions', name: 'Порції', color: C_LINE }]} style={styles.portions} formatValue={(v) => v.toLocaleString('uk-UA')} />
          </ChartCard>

          <ChartCard title="Години: факт і овердрафт" controls={<StyleTabs value={styles.hours} onChange={setStyle('hours')} allowBoth />}>
            <MetricChart
              data={hoursPoints}
              series={[
                { key: 'fact', name: 'Факт', color: C_FACT },
                { key: 'overdraft', name: 'Овердрафт', color: C_OVER },
              ]}
              style={styles.hours}
              yTickFormatter={(v) => `${v} г`}
              formatValue={(v) => `${v.toString().replace('.', ',')} год`}
            />
          </ChartCard>

          <ChartCard title="Сума по місяцях, грн" controls={<StyleTabs value={styles.months} onChange={setStyle('months')} allowBoth={false} />}>
            <MetricChart
              data={monthPoints}
              series={[{ key: 'amountUah', name: 'Сума', color: C_PAID }]}
              style={styles.months}
              yTickFormatter={(v) => `${Math.round(v / 1000)}к`}
              formatValue={(v) => `${uah(v)} грн`}
            />
          </ChartCard>
        </div>
      ) : null}

      {data ? (
        <Card>
          <CardHeader className="px-4 border-b border-default-200"><h3 className="text-base font-semibold">Зведення по місяцях</h3></CardHeader>
          <CardBody className="p-4 overflow-x-auto">
            <Table aria-label="Місяці" removeWrapper classNames={HR_TABLE_CLASS_NAMES}>
              <TableHeader>
                <TableColumn>Місяць</TableColumn>
                <TableColumn align="end">Порції</TableColumn>
                <TableColumn align="end">Сума, грн</TableColumn>
                <TableColumn align="end">Сума в день, грн</TableColumn>
                <TableColumn align="end">Сума в день, $</TableColumn>
                <TableColumn align="end">Оплачено, $</TableColumn>
                <TableColumn align="end">Зміна</TableColumn>
                <TableColumn align="end">Вартість годин, $</TableColumn>
              </TableHeader>
              <TableBody emptyContent="Немає даних">
                {[...months].reverse().map((m) => (
                  <TableRow key={m.month}>
                    <TableCell className="text-sm font-mono">{monthLabel(m.month)}</TableCell>
                    <TableCell className="text-sm text-right">{m.portions.toLocaleString('uk-UA')}</TableCell>
                    <TableCell className="text-sm text-right">{uah(m.amountUah)}</TableCell>
                    <TableCell className="text-sm text-right">{uah(m.amountPerDay)}</TableCell>
                    <TableCell className="text-sm text-right">{usd2(m.amountUsdPerDay)}</TableCell>
                    <TableCell className="text-sm text-right">{usd(m.amountUsd)}</TableCell>
                    <TableCell className={`text-sm text-right ${m.amountChange != null && m.amountChange < 0 ? 'text-danger' : 'text-success'}`}>{pct(m.amountChange)}</TableCell>
                    <TableCell className="text-sm text-right">{usd(m.costUsd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="px-4 border-b border-default-200"><h3 className="text-base font-semibold">Періоди</h3></CardHeader>
        <CardBody className="p-4 overflow-x-auto">
          <Table aria-label="Періоди" removeWrapper classNames={HR_TABLE_CLASS_NAMES}>
            <TableHeader>
              <TableColumn>Період</TableColumn>
              <TableColumn align="end">Факт, г:хв</TableColumn>
              <TableColumn align="end">Порції</TableColumn>
              <TableColumn align="end">Тариф</TableColumn>
              <TableColumn align="end">Сума, грн</TableColumn>
              <TableColumn align="end">Курс</TableColumn>
              <TableColumn align="end">Сума, $</TableColumn>
              <TableColumn align="end">Вартість, $</TableColumn>
              <TableColumn align="end">Оплач. год</TableColumn>
              <TableColumn align="end">Овердрафт, год</TableColumn>
              <TableColumn align="end">Δ, $</TableColumn>
              <TableColumn>Рахунок</TableColumn>
            </TableHeader>
            <TableBody emptyContent={data ? 'Немає періодів' : 'Завантаження…'}>
              {tableRows.map((r) => (
                <TableRow key={r.periodId}>
                  <TableCell className="text-sm font-mono whitespace-nowrap">{periodLabel(r)}</TableCell>
                  <TableCell>
                    <EditableCell
                      value={r.factMinutes == null ? '' : formatHm(r.factMinutes)}
                      placeholder="гг:хх"
                      width="w-20"
                      onSave={async (v) => {
                        if (v === '') return patchPeriod(r.periodId, { factMinutes: null });
                        const minutes = parseHm(v);
                        if (minutes == null) {
                          ToastService.show({ title: 'Формат годин: гг:хх', description: 'Наприклад 64:18', color: 'warning' });
                          return;
                        }
                        return patchPeriod(r.periodId, { factMinutes: minutes });
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-right">
                    {r.portions == null ? '–' : r.portions.toLocaleString('uk-UA')}
                    {r.portionsSource ? (
                      <span className="block text-xs text-default-400">{r.portionsSource === 'snapshot' ? 'зі знімка' : 'живі'}</span>
                    ) : null}
                    {mode === 'live' && r.portionsDrift ? (
                      <Tooltip content="Живі дані мінус зафіксовані в рахунку" placement="top">
                        <span className={`block text-xs ${r.portionsDrift < 0 ? 'text-danger' : 'text-success'}`}>{r.portionsDrift > 0 ? '+' : ''}{r.portionsDrift}</span>
                      </Tooltip>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm text-right">{r.tariff.toString().replace('.', ',')}</TableCell>
                  <TableCell className="text-sm text-right">
                    {uah(r.amountUah)}
                    {r.adjustmentUah ? (
                      <Tooltip content={`Корекція ${uah(r.adjustmentUah)} грн${r.adjustmentNote ? `: ${r.adjustmentNote}` : ''}`} placement="top">
                        <span className="text-warning-600 text-xs"> *</span>
                      </Tooltip>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <EditableCell
                        value={rateText(r.usdRate)}
                        placeholder="курс"
                        width="w-16"
                        onSave={async (v) => {
                          if (v === '') return patchPeriod(r.periodId, { usdRate: null });
                          const rate = Number(v.replace(',', '.'));
                          if (!(rate > 0)) {
                            ToastService.show({ title: 'Невірний курс', color: 'warning' });
                            return;
                          }
                          return patchPeriod(r.periodId, { usdRate: rate });
                        }}
                      />
                      <Tooltip content={r.rateSource === 'manual' ? 'Курс виправлено вручну. Оновити з НБУ' : r.rateSource === 'imported' ? 'Виведено з таблиці. Оновити з НБУ' : 'Курс НБУ. Оновити'} placement="top">
                        <Button isIconOnly size="sm" variant="light" aria-label="Оновити курс НБУ" onPress={() => void refreshRate(r.periodId)}>
                          <DynamicIcon name="landmark" size={14} />
                        </Button>
                      </Tooltip>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-right">{usd(r.amountUsd)}</TableCell>
                  <TableCell className="text-sm text-right">{usd(r.costUsd)}</TableCell>
                  <TableCell className="text-sm text-right font-mono">{formatHm(r.paidMinutes)}</TableCell>
                  <TableCell className={`text-sm text-right font-mono ${r.overdraftMinutes > 0 ? 'text-danger' : 'text-success'}`}>{formatHm(r.overdraftMinutes)}</TableCell>
                  <TableCell className={`text-sm text-right ${r.deltaUsd < 0 ? 'text-danger' : 'text-success'}`}>{usd(r.deltaUsd)}</TableCell>
                  <TableCell>{r.invoiceNumber != null ? <Chip size="sm" variant="flat">№{r.invoiceNumber}</Chip> : <span className="text-default-400">–</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-default-500 mt-3">
            Овердрафт: накопичений час (попередній овердрафт + факт) мінус оплачені години (сума в $ / ставка години). Δ: оплачено мінус вартість годин періоду. * – внутрішня корекція суми, у PDF не друкується.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
