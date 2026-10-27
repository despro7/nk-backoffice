import { logServer } from '../../lib/utils.js';
import {
  formatOpenAiPricingHint,
  type PriceRow,
} from './LlmOpenAiOfficialPricingService.js';

const GOOGLE_PRICING_URL = 'https://ai.google.dev/gemini-api/docs/pricing';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const MODEL_CODE_IN_DOCS =
  /<a href="\/gemini-api\/docs\/models\/[^"]+"><code translate="no" dir="ltr">([^<]+)<\/code><\/a>/g;

let cachedAt = 0;
let cachedMap: Map<string, PriceRow> | null = null;

function stripHtml(cell: string): string {
  return cell
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/** Перший USD у комірці Paid tier (перший рядок, якщо кілька модальностей). */
function parseUsdFromPaidCell(cellHtml: string): number | null {
  const text = stripHtml(cellHtml);
  const firstLine = text.split('\n')[0]?.trim() ?? '';
  if (!firstLine || /free of charge/i.test(firstLine) || /not available/i.test(firstLine)) {
    return null;
  }
  const m = firstLine.match(/\$([\d.]+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseStandardPricingTable(tableHtml: string): PriceRow | null {
  let inputUsdPerM: number | null = null;
  let outputUsdPerM: number | null = null;

  const rows = tableHtml.match(/<tr>[\s\S]*?<\/tr>/gi) ?? [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (cells.length < 3) continue;
    const label = stripHtml(cells[0]).toLowerCase();
    const paidCell = cells[2];
    if (label.startsWith('input price')) {
      inputUsdPerM = parseUsdFromPaidCell(paidCell);
    } else if (label.startsWith('output price')) {
      outputUsdPerM = parseUsdFromPaidCell(paidCell);
    }
  }

  if (inputUsdPerM == null) return null;
  return { inputUsdPerM, outputUsdPerM };
}

function extractStandardTable(afterModelAnchor: string): string | null {
  const sectionRe =
    /<section><h3[^>]*data-text="Standard"[^>]*>[\s\S]*?<table class="pricing-table">([\s\S]*?)<\/table>/i;
  const m = sectionRe.exec(afterModelAnchor);
  return m?.[1] ?? null;
}

/** Парсить офіційну HTML-сторінку pricing (Standard tier, Paid column). */
export function parseGooglePricingHtml(html: string): Map<string, PriceRow> {
  const map = new Map<string, PriceRow>();
  const anchors: Array<{ modelId: string; index: number }> = [];

  MODEL_CODE_IN_DOCS.lastIndex = 0;
  let anchorMatch: RegExpExecArray | null;
  while ((anchorMatch = MODEL_CODE_IN_DOCS.exec(html)) !== null) {
    const modelId = anchorMatch[1].trim().toLowerCase();
    if (!modelId) continue;
    anchors.push({ modelId, index: anchorMatch.index });
  }

  for (let i = 0; i < anchors.length; i += 1) {
    const { modelId, index } = anchors[i];
    const nextIndex = anchors[i + 1]?.index ?? html.length;
    const slice = html.slice(index, Math.min(nextIndex, index + 25_000));
    const tableHtml = extractStandardTable(slice);
    if (!tableHtml) continue;
    const row = parseStandardPricingTable(tableHtml);
    if (!row) continue;
    map.set(modelId, row);
  }

  return map;
}

function normalizeModelKey(modelId: string): string {
  return modelId.replace(/^models\//, '').trim().toLowerCase();
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

async function loadPricingMap(): Promise<Map<string, PriceRow>> {
  const now = Date.now();
  if (cachedMap && now < cachedAt + CACHE_TTL_MS) {
    return cachedMap;
  }

  const response = await fetch(GOOGLE_PRICING_URL, {
    headers: { Accept: 'text/html,application/xhtml+xml,*/*' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Google pricing page HTTP ${response.status}`);
  }
  const html = await response.text();
  const map = parseGooglePricingHtml(html);
  if (map.size === 0) {
    throw new Error('Google pricing: не вдалося розпарсити таблиці Standard');
  }
  cachedMap = map;
  cachedAt = now;
  return map;
}

export class LlmGoogleOfficialPricingService {
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
      logServer('[LlmGoogleOfficialPricing] failed to load pricing page', error);
      return null;
    }
  }
}

export const llmGoogleOfficialPricingService = new LlmGoogleOfficialPricingService();
