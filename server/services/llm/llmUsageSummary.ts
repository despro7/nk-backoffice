import type { LlmUsageProvider, LlmUsageSummaryResponse, LlmUsageTotals } from '../../../shared/types/llm.js';

/** Агрегація журналу витрат LLM. Чисті функції; читання з БД — у LlmUsageLogService. */

export type LlmUsageRow = {
  createdAt: Date;
  provider: string;
  model: string;
  feature: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  ok: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_MODELS = 10;

const kyivDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Kyiv',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** YYYY-MM-DD за київським часом. */
export function kyivDayKey(date: Date): string {
  return kyivDayFormatter.format(date);
}

function emptyTotals(): LlmUsageTotals {
  return { calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, unpricedCalls: 0 };
}

function addRow(totals: LlmUsageTotals, row: LlmUsageRow): void {
  totals.calls += 1;
  if (!row.ok) totals.errors += 1;
  totals.inputTokens += row.inputTokens;
  totals.outputTokens += row.outputTokens;
  if (row.costUsd != null) totals.costUsd += row.costUsd;
  else if (row.ok) totals.unpricedCalls += 1;
}

function bucket<T>(map: Map<string, T & LlmUsageTotals>, key: string, init: () => T): T & LlmUsageTotals {
  let entry = map.get(key);
  if (!entry) {
    entry = { ...init(), ...emptyTotals() };
    map.set(key, entry);
  }
  return entry;
}

const byCostDesc = (a: LlmUsageTotals, b: LlmUsageTotals) => b.costUsd - a.costUsd || b.calls - a.calls;

export function summarizeLlmUsage(rows: LlmUsageRow[], days: number, now: Date): LlmUsageSummaryResponse {
  const from = new Date(now.getTime() - days * DAY_MS);
  const total = emptyTotals();
  const providers = new Map<string, { provider: LlmUsageProvider } & LlmUsageTotals>();
  const features = new Map<string, { feature: string } & LlmUsageTotals>();
  const models = new Map<string, { provider: LlmUsageProvider; model: string } & LlmUsageTotals>();
  const dayMap = new Map<string, { day: string; costUsd: number; calls: number }>();

  for (let t = from.getTime(); t <= now.getTime(); t += DAY_MS) {
    const day = kyivDayKey(new Date(t));
    dayMap.set(day, { day, costUsd: 0, calls: 0 });
  }
  const today = kyivDayKey(now);
  if (!dayMap.has(today)) dayMap.set(today, { day: today, costUsd: 0, calls: 0 });

  for (const row of rows) {
    if (row.createdAt < from || row.createdAt > now) continue;
    const provider = row.provider as LlmUsageProvider;
    addRow(total, row);
    addRow(bucket(providers, provider, () => ({ provider })), row);
    addRow(bucket(features, row.feature, () => ({ feature: row.feature })), row);
    addRow(bucket(models, `${provider}\u0000${row.model}`, () => ({ provider, model: row.model })), row);
    const day = dayMap.get(kyivDayKey(row.createdAt));
    if (day) {
      day.calls += 1;
      day.costUsd += row.costUsd ?? 0;
    }
  }

  return {
    days,
    from: from.toISOString(),
    to: now.toISOString(),
    total,
    byProvider: [...providers.values()].sort(byCostDesc),
    byFeature: [...features.values()].sort(byCostDesc),
    byModel: [...models.values()].sort(byCostDesc).slice(0, TOP_MODELS),
    byDay: [...dayMap.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}

/** USD за input tokens Jev; null — ціну не задано. */
export function jevCostUsd(inputTokens: number, pricePer1M: number): number | null {
  return pricePer1M > 0 ? (inputTokens / 1_000_000) * pricePer1M : null;
}
