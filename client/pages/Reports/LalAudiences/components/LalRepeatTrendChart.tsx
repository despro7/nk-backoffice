import { useEffect, useMemo, useState, type Key } from 'react';
import { Skeleton, Tab, Tabs } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { LalPeriodKey, LalPeriodTrendPoint } from '@shared/types/lalAudiences';
import { formatNumber } from '@/lib/formatUtils';

type TrendGroupBy = 'day' | 'week' | 'month';

interface LalRepeatTrendChartProps {
  loading: boolean;
  period: LalPeriodKey;
  trend: LalPeriodTrendPoint[];
}

interface ChartPoint {
  date: string;
  label: string;
  orders: number;
  repeatOrders: number;
}

const GROUP_OPTIONS: Array<{ key: TrendGroupBy; label: string }> = [
  { key: 'day', label: 'День' },
  { key: 'week', label: 'Тиждень' },
  { key: 'month', label: 'Місяць' },
];

function defaultGroupBy(period: LalPeriodKey, dayCount: number): TrendGroupBy {
  if (period === 'all') return 'month';
  if (dayCount <= 45) return 'day';
  return 'week';
}

function isTrendGroupBy(value: Key): value is TrendGroupBy {
  return value === 'day' || value === 'week' || value === 'month';
}

function formatLocalIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Понеділок тижня для звітної дати `YYYY-MM-DD`. */
function weekStart(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.getDay();
  const shift = weekday === 0 ? -6 : 1 - weekday;
  date.setDate(date.getDate() + shift);
  return formatLocalIso(date);
}

function bucketKey(date: string, groupBy: TrendGroupBy): string {
  switch (groupBy) {
    case 'day':
      return date;
    case 'week':
      return weekStart(date);
    case 'month':
      return date.slice(0, 7);
    default: {
      const unreachable: never = groupBy;
      return unreachable;
    }
  }
}

function formatBucketLabel(date: string, groupBy: TrendGroupBy): string {
  if (groupBy === 'month') {
    const [year, month] = date.split('-');
    return `${month}.${year}`;
  }
  const [, month, day] = date.split('-');
  return `${day}.${month}`;
}

function groupTrend(points: LalPeriodTrendPoint[], groupBy: TrendGroupBy): ChartPoint[] {
  const buckets = new Map<string, { orders: number; repeatOrders: number }>();
  for (const point of points) {
    const key = bucketKey(point.date, groupBy);
    const bucket = buckets.get(key) ?? { orders: 0, repeatOrders: 0 };
    bucket.orders += point.orders;
    bucket.repeatOrders += point.repeatOrders;
    buckets.set(key, bucket);
  }

  return [...buckets.entries()].map(([date, bucket]) => ({
    date,
    label: formatBucketLabel(date, groupBy),
    orders: bucket.orders,
    repeatOrders: bucket.repeatOrders,
  }));
}

function repeatPercent(orders: number, repeatOrders: number): string {
  if (orders <= 0) return '0%';
  const value = Math.round((repeatOrders / orders) * 1000) / 10;
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${text}%`;
}

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ChartPoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-md border border-default-200">
      <p className="font-medium text-default-800 mb-1">{point.label}</p>
      <p className="text-default-600">Усі замовлення: {formatNumber(point.orders)}</p>
      <p className="text-default-600">
        Повторні: {formatNumber(point.repeatOrders)} · {repeatPercent(point.orders, point.repeatOrders)}
      </p>
    </div>
  );
}

export default function LalRepeatTrendChart({ loading, period, trend }: LalRepeatTrendChartProps) {
  const suggested = useMemo(() => defaultGroupBy(period, trend.length), [period, trend.length]);
  const [groupBy, setGroupBy] = useState<TrendGroupBy>(suggested);

  useEffect(() => {
    setGroupBy(suggested);
  }, [suggested]);

  const chartData = useMemo(() => groupTrend(trend, groupBy), [groupBy, trend]);
  const hasOrders = trend.some((point) => point.orders > 0);

  return (
    <div className="bg-white rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <p className="text-sm font-medium text-default-800">Повторні продажі</p>
        <Tabs
          aria-label="Групування графіка"
          size="sm"
          selectedKey={groupBy}
          onSelectionChange={(key) => {
            if (isTrendGroupBy(key)) setGroupBy(key);
          }}
        >
          {GROUP_OPTIONS.map((option) => (
            <Tab key={option.key} title={option.label} />
          ))}
        </Tabs>
      </div>

      {loading && trend.length === 0 ? (
        <Skeleton className="rounded-lg h-72 w-full opacity-60" />
      ) : !hasOrders ? (
        <div className="flex flex-col items-center justify-center h-72 text-default-400">
          <DynamicIcon name="area-chart" size={40} className="mb-2 opacity-40" />
          <span className="text-sm">Немає замовлень у цьому періоді</span>
        </div>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="lal-orders-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(210, 70%, 50%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(210, 70%, 50%)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="lal-repeat-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142, 70%, 45%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(142, 70%, 45%)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
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
                width={40}
                allowDecimals={false}
              />
              <Tooltip content={<TrendTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Area
                type="monotone"
                dataKey="orders"
                name="Усі замовлення"
                stroke="hsl(210, 70%, 50%)"
                fill="url(#lal-orders-fill)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="repeatOrders"
                name="Повторні"
                stroke="hsl(142, 70%, 45%)"
                fill="url(#lal-repeat-fill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
