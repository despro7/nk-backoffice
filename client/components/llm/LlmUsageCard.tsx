import { useCallback, useEffect, useState, type Key } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Skeleton,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tabs,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import type {
  LlmBalancesResponse,
  LlmProviderBalance,
  LlmUsageProvider,
  LlmUsageSummaryResponse,
  LlmUsageTotals,
} from '@shared/types/llm';
import { llmSettingsApi } from '@/services/LlmSettingsService';
import { formatNumber } from '@/lib/formatUtils';
import { HR_TABLE_CLASS_NAMES } from '@/pages/Hr/hrUi';

const PERIODS = [7, 30] as const;

const PROVIDER_LABELS: Record<LlmUsageProvider, string> = {
  openai: 'OpenAI',
  google: 'Google Gemini',
  openrouter: 'OpenRouter',
  typesafe: 'TypeSafe Jev',
};

const FEATURE_LABELS: Record<string, string> = {
  chatwoot_bot_reply: 'Відповіді чат-бота',
  topics_jev: 'Теми питань (Jev)',
  llm_test: 'Тести моделей',
  jev_test: 'Тест Jev',
  other: 'Інше',
};

const BALANCE_STATUS: Record<LlmProviderBalance['status'], { label: string; color: 'success' | 'default' | 'danger' }> =
  {
    available: { label: 'Дані є', color: 'success' },
    no_key: { label: 'Немає ключа', color: 'default' },
    unsupported: { label: 'API немає', color: 'default' },
    error: { label: 'Помилка', color: 'danger' },
  };

function usd(value: number | null | undefined): string {
  if (value == null) return '—';
  const abs = Math.abs(value);
  return `$${value.toFixed(abs > 0 && abs < 0.01 ? 4 : 2)}`;
}

function TotalsTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-default-50 border border-default-200 px-3 py-2">
      <div className="text-xs text-default-500">{label}</div>
      <div className="text-lg font-semibold text-default-900">{value}</div>
      {hint ? <div className="text-xs text-default-400">{hint}</div> : null}
    </div>
  );
}

type BreakdownRow = LlmUsageTotals & { key: string; label: string };

function BreakdownTable({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  return (
    <Table aria-label={title} removeWrapper classNames={HR_TABLE_CLASS_NAMES}>
      <TableHeader>
        <TableColumn>{title}</TableColumn>
        <TableColumn align="end">Викликів</TableColumn>
        <TableColumn align="end">Tokens in / out</TableColumn>
        <TableColumn align="end">USD</TableColumn>
      </TableHeader>
      <TableBody emptyContent="Викликів не було">
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell className="text-sm">{row.label}</TableCell>
            <TableCell className="text-sm text-right">
              {formatNumber(row.calls)}
              {row.errors > 0 ? <span className="text-danger text-xs"> · {row.errors} помилок</span> : null}
            </TableCell>
            <TableCell className="font-mono text-xs text-right text-default-600">
              {formatNumber(row.inputTokens)} / {formatNumber(row.outputTokens)}
            </TableCell>
            <TableCell className="text-sm text-right font-medium">
              {usd(row.costUsd)}
              {row.unpricedCalls > 0 ? (
                <Tooltip content={`${row.unpricedCalls} викликів без відомої ціни`} placement="top">
                  <span className="text-warning-600 text-xs"> *</span>
                </Tooltip>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function BalanceRow({ balance }: { balance: LlmProviderBalance }) {
  const status = BALANCE_STATUS[balance.status];
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 py-2 border-b border-default-200 last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-default-900">{PROVIDER_LABELS[balance.provider]}</div>
        <div className="text-xs text-default-500">{balance.error ?? balance.note}</div>
      </div>
      <div className="flex items-center gap-3 text-right">
        {balance.status === 'available' ? (
          <div className="text-xs text-default-500">
            {balance.remainingUsd != null ? (
              <div>
                Залишок <span className="text-sm font-semibold text-default-900">{usd(balance.remainingUsd)}</span>
                {balance.limitUsd != null ? ` з ${usd(balance.limitUsd)}` : null}
              </div>
            ) : null}
            {balance.usedUsd != null ? (
              <div>
                Витрачено {usd(balance.usedUsd)}
                {balance.usedPeriod ? ` (${balance.usedPeriod})` : null}
              </div>
            ) : null}
          </div>
        ) : null}
        <Chip size="sm" variant="flat" color={status.color}>
          {status.label}
        </Chip>
      </div>
    </div>
  );
}

/** Витрати з журналу `llm_usage_log` за 7/30 днів і баланси провайдерів. */
export function LlmUsageCard() {
  const [days, setDays] = useState<number>(7);
  const [usage, setUsage] = useState<LlmUsageSummaryResponse | null>(null);
  const [balances, setBalances] = useState<LlmBalancesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (period: number, refreshBalances = false) => {
    setLoading(true);
    setError(null);
    // Незалежно: збій журналу не ховає баланси і навпаки.
    const [usageResult, balancesResult] = await Promise.allSettled([
      llmSettingsApi.getUsage(period),
      llmSettingsApi.getBalances(refreshBalances),
    ]);
    if (usageResult.status === 'fulfilled') setUsage(usageResult.value);
    if (balancesResult.status === 'fulfilled') setBalances(balancesResult.value);
    const failed = [usageResult, balancesResult].find((r) => r.status === 'rejected');
    if (failed?.status === 'rejected') {
      setError(failed.reason instanceof Error ? failed.reason.message : 'Не вдалося завантажити витрати');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const onPeriodChange = (key: Key) => {
    const next = Number(key);
    if (PERIODS.includes(next as (typeof PERIODS)[number])) setDays(next);
  };

  const chartData = (usage?.byDay ?? []).map((d) => ({
    ...d,
    label: `${d.day.slice(8, 10)}.${d.day.slice(5, 7)}`,
  }));

  return (
    <Card>
      <CardHeader className="flex flex-wrap gap-2 px-4 items-center border-b border-default-200">
        <DynamicIcon name="wallet" size={20} className="text-default-600" />
        <h2 className="text-lg font-semibold">Витрати і баланси</h2>
        <div className="ml-auto flex items-center gap-2">
          <Tabs size="sm" selectedKey={String(days)} onSelectionChange={onPeriodChange} aria-label="Період">
            {PERIODS.map((p) => (
              <Tab key={String(p)} title={`${p} днів`} />
            ))}
          </Tabs>
          <Tooltip content="Оновити, баланси — без кешу" placement="top">
            <Button
              size="sm"
              variant="light"
              isIconOnly
              aria-label="Оновити витрати і баланси"
              isDisabled={loading}
              onPress={() => void load(days, true)}
            >
              <DynamicIcon
                name={loading ? 'loader-2' : 'refresh-cw'}
                size={16}
                className={loading ? 'animate-spin' : ''}
              />
            </Button>
          </Tooltip>
        </div>
      </CardHeader>
      <CardBody className="gap-4 p-4">
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {!usage ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <TotalsTile
                label="Витрати, USD"
                value={usd(usage.total.costUsd)}
                hint={usage.total.unpricedCalls > 0 ? `${usage.total.unpricedCalls} викликів без ціни` : undefined}
              />
              <TotalsTile
                label="Викликів"
                value={formatNumber(usage.total.calls)}
                hint={usage.total.errors > 0 ? `${usage.total.errors} з помилкою` : undefined}
              />
              <TotalsTile label="Input tokens" value={formatNumber(usage.total.inputTokens)} />
              <TotalsTile label="Output tokens" value={formatNumber(usage.total.outputTokens)} />
            </div>

            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="opacity-30" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => usd(v)}
                  />
                  <ChartTooltip
                    formatter={(value: number) => [usd(value), 'Витрати']}
                    labelFormatter={(label) => `День ${label}`}
                  />
                  <Bar dataKey="costUsd" fill="hsl(210, 70%, 50%)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <BreakdownTable
                title="Провайдер"
                rows={usage.byProvider.map((r) => ({
                  ...r,
                  key: r.provider,
                  label: PROVIDER_LABELS[r.provider] ?? r.provider,
                }))}
              />
              <BreakdownTable
                title="Функція"
                rows={usage.byFeature.map((r) => ({
                  ...r,
                  key: r.feature,
                  label: FEATURE_LABELS[r.feature] ?? r.feature,
                }))}
              />
            </div>
            {usage.byModel.length > 0 ? (
              <BreakdownTable
                title="Модель (топ 10)"
                rows={usage.byModel.map((r) => ({
                  ...r,
                  key: `${r.provider}:${r.model}`,
                  label: `${r.model} · ${PROVIDER_LABELS[r.provider] ?? r.provider}`,
                }))}
              />
            ) : null}
            <p className="text-xs text-default-500">
              Наші витрати з журналу викликів; вартість — за ціною моделі або з відповіді провайдера (OpenRouter). Ціну
              Jev задайте в картці TypeSafe Jev.
            </p>
          </>
        )}

        <div>
          <h3 className="text-sm font-semibold text-default-900 mb-1">Баланси провайдерів</h3>
          {balances ? (
            balances.balances.map((b) => <BalanceRow key={b.provider} balance={b} />)
          ) : (
            <Skeleton className="h-24 rounded-lg" />
          )}
        </div>
      </CardBody>
    </Card>
  );
}
