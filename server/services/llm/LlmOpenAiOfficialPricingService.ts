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

/** Парсить markdown-таблиці з офіційного pricing.md (Standard tier, short context). */
export function parseOpenAiPricingMarkdown(markdown: string): Map<string, PriceRow> {
  const map = new Map<string, PriceRow>();
  const lines = markdown.split('\n');

  for (const line of lines) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
    if (cells.length < 2) continue;
    if (cells[0].toLowerCase() === 'model' || cells[0] === '---') continue;

    let modelCell = cells[0];
    let inputIdx = 1;
    let outputIdx = 4;

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
    map.set(modelKey, { inputUsdPerM, outputUsdPerM });
  }

  return map;
}

function lookupPrice(map: Map<string, PriceRow>, modelId: string): PriceRow | null {
  const key = normalizeModelKey(modelId);
  if (map.has(key)) return map.get(key) ?? null;

  let best: { row: PriceRow; len: number } | null = null;
  for (const [prefix, row] of map.entries()) {
    if (key.startsWith(prefix) && (!best || prefix.length > best.len)) {
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
