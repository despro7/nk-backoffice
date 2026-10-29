import { logServer } from '../../lib/utils.js';

const OPENAI_PRICING_MD_URL = 'https://developers.openai.com/api/docs/pricing.md';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type PriceRow = { inputUsdPerM: number; outputUsdPerM: number | null };

let cachedAt = 0;
let cachedMap: Map<string, PriceRow> | null = null;

function parseUsdCell(cell: string): number | null {
  const trimmed = cell.trim();
  if (!trimmed || trimmed === '-') return null;
  const m = trimmed.match(/\$?([\d.]+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function normalizeModelKey(raw: string): string {
  return raw
    .trim()
    .replace(/\s*\([^)]*\)\s*/g, '')
    .trim()
    .toLowerCase();
}

type PriceColumnLayout = { inputIdx: number; outputIdx: number };

function isTableSeparatorRow(cells: string[]): boolean {
  return cells.every((c) => /^-+$/.test(c) || c === '');
}

/** Визначає індекси input/output з рядка заголовка таблиці pricing.md. */
export function resolveOpenAiPricingColumns(cells: string[]): PriceColumnLayout | null {
  if (cells[0]?.toLowerCase() !== 'model') return null;
  const lower = cells.map((c) => c.toLowerCase());

  if (lower.some((h) => h.includes('price per minute'))) {
    return null;
  }

  let inputIdx = lower.findIndex((h) => h === 'input' || h === 'short context input');
  if (inputIdx < 0) {
    inputIdx = lower.findIndex(
      (h) =>
        h.includes('input') &&
        !h.includes('cached') &&
        !h.includes('write') &&
        !h.includes('long context'),
    );
  }

  let outputIdx = lower.findIndex((h) => h === 'output' || h === 'short context output');
  if (outputIdx < 0) {
    outputIdx = lower.findIndex(
      (h) =>
        (h === 'output / cost' || h.includes('output')) &&
        !h.includes('cached') &&
        !h.includes('write') &&
        !h.includes('long context'),
    );
  }

  // Старий формат: input | cached | cache writes | output (індекс 4)
  if (outputIdx < 0 && lower.some((h) => h.includes('cache writes'))) {
    outputIdx = lower.findIndex((h) => h.includes('short context output'));
    if (outputIdx < 0) outputIdx = 4;
  }

  if (inputIdx < 0) inputIdx = 1;
  if (outputIdx < 0) outputIdx = 2;

  return { inputIdx, outputIdx };
}

type PricingDocSection = 'standard' | 'batch' | 'skip';

function pricingSectionFromLine(line: string): PricingDocSection | null {
  const lower = line.toLowerCase();
  if (lower.includes('batch pricing')) return 'batch';
  if (lower.includes('standard pricing') || /^#+\s*standard\b/.test(lower)) return 'standard';
  if (lower.includes('gpt-live') || lower.includes('price per minute')) return 'skip';
  return null;
}

/** Парсить markdown-таблиці з офіційного pricing.md (Standard tier, short context). */
export function parseOpenAiPricingMarkdown(markdown: string): Map<string, PriceRow> {
  const map = new Map<string, PriceRow>();
  const lines = markdown.split('\n');
  let layout: PriceColumnLayout = { inputIdx: 1, outputIdx: 2 };
  let section: PricingDocSection = 'standard';

  for (const line of lines) {
    const sectionHint = pricingSectionFromLine(line);
    if (sectionHint != null) {
      section = sectionHint;
    }
    if (!line.trim().startsWith('|')) continue;
    if (section !== 'standard') continue;
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
    if (cells.length < 2) continue;
    if (isTableSeparatorRow(cells)) continue;

    if (cells[0].toLowerCase() === 'model') {
      const resolved = resolveOpenAiPricingColumns(cells);
      if (resolved) layout = resolved;
      continue;
    }

    let modelCell = cells[0];
    let inputIdx = layout.inputIdx;
    let outputIdx = layout.outputIdx;

    if (cells[0].toLowerCase() === 'embedding' && cells.length >= 3) {
      modelCell = cells[1];
      inputIdx = 2;
      outputIdx = -1;
    }

    const modelKey = normalizeModelKey(modelCell);
    if (!modelKey || modelKey === 'model') continue;

    const inputUsdPerM = parseUsdCell(cells[inputIdx] ?? '');
    if (inputUsdPerM == null) continue;

    const outputUsdPerM = outputIdx >= 0 ? parseUsdCell(cells[outputIdx] ?? '') : null;
    if (!map.has(modelKey)) {
      map.set(modelKey, { inputUsdPerM, outputUsdPerM });
    }
  }

  return map;
}

function modelIdMatchesPricingPrefix(modelId: string, prefix: string): boolean {
  if (!modelId.startsWith(prefix)) return false;
  if (modelId.length === prefix.length) return true;
  return modelId[prefix.length] === '-';
}

function stripOpenAiSnapshotSuffix(modelId: string): string {
  return modelId.replace(/-\d{4}-\d{2}-\d{2}$/, '');
}

/** Для тестів і підказок: exact → snapshot → найдовший prefix з `-` boundary. */
export function resolveOpenAiPricingRow(
  map: Map<string, PriceRow>,
  modelId: string,
): PriceRow | null {
  return lookupPrice(map, modelId);
}

function lookupPrice(map: Map<string, PriceRow>, modelId: string): PriceRow | null {
  const key = normalizeModelKey(modelId);
  if (map.has(key)) return map.get(key) ?? null;

  const withoutDate = normalizeModelKey(stripOpenAiSnapshotSuffix(modelId));
  if (withoutDate !== key && map.has(withoutDate)) {
    return map.get(withoutDate) ?? null;
  }

  let best: { row: PriceRow; len: number } | null = null;
  for (const [prefix, row] of map.entries()) {
    if (!modelIdMatchesPricingPrefix(key, prefix)) continue;
    if (!best || prefix.length > best.len) {
      best = { row, len: prefix.length };
    }
  }
  return best?.row ?? null;
}

export function formatOpenAiPricingHint(row: PriceRow): string {
  if (row.outputUsdPerM != null) {
    return `$${row.inputUsdPerM}/1M in · $${row.outputUsdPerM}/1M out`;
  }
  return `$${row.inputUsdPerM}/1M`;
}

async function loadPricingMap(): Promise<Map<string, PriceRow>> {
  const now = Date.now();
  if (cachedMap && now < cachedAt + CACHE_TTL_MS) {
    return cachedMap;
  }

  const response = await fetch(OPENAI_PRICING_MD_URL, {
    headers: { Accept: 'text/markdown,text/plain,*/*' },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    throw new Error(`OpenAI pricing.md HTTP ${response.status}`);
  }
  const markdown = await response.text();
  const map = parseOpenAiPricingMarkdown(markdown);
  if (map.size === 0) {
    throw new Error('OpenAI pricing.md: не вдалося розпарсити таблиці');
  }
  cachedMap = map;
  cachedAt = now;
  return map;
}

export class LlmOpenAiOfficialPricingService {
  async loadStandardPricing(): Promise<Map<string, PriceRow>> {
    return loadPricingMap();
  }

  resolveHint(modelId: string, map: Map<string, PriceRow>): string | null {
    const row = lookupPrice(map, modelId);
    return row ? formatOpenAiPricingHint(row) : null;
  }

  async getPricingHintForModel(modelId: string): Promise<string | null> {
    try {
      const map = await loadPricingMap();
      return this.resolveHint(modelId, map);
    } catch (error) {
      logServer('[LlmOpenAiOfficialPricing] failed to load pricing.md', error);
      return null;
    }
  }
}

export const llmOpenAiOfficialPricingService = new LlmOpenAiOfficialPricingService();
