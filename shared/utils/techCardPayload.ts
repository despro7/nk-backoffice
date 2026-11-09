import {
  EMPTY_TECH_CARD_PAYLOAD,
  type TechCardDosingFraction,
  type TechCardPackagingRow,
  type TechCardPayload,
  type TechCardStage,
} from '../types/production.js';
import { isCatalogLossFormula } from './catalogLoss.js';
import { normalizeBatchPortions } from './catalogQtyFormula.js';

type Obj = Record<string, unknown>;

function asObject(raw: unknown): Obj | null {
  if (typeof raw === 'string') {
    try {
      return asObject(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  return raw != null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Obj) : null;
}

function str(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function strList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(str).filter((v): v is string => v != null))];
}

function list<T>(value: unknown, map: (item: Obj) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(asObject).flatMap((item) => {
    const mapped = item ? map(item) : null;
    return mapped ? [mapped] : [];
  });
}

const ALLOWED_HTML_TAGS = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'h5', 'h6']);

/**
 * Опис етапу – HTML з TipTap. Лишаємо лише базові теги без атрибутів (без посилань, зображень,
 * обробників), решту прибираємо: опис показується через innerHTML.
 */
export function sanitizeStageHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (tag, name: string) => {
      const lower = name.toLowerCase();
      if (!ALLOWED_HTML_TAGS.has(lower)) return '';
      return tag.startsWith('</') ? `</${lower}>` : `<${lower}>`;
    })
    // Будь-яке інше «<» (незакритий тег тощо) – як текст
    .replace(new RegExp(`<(?!/?(?:${[...ALLOWED_HTML_TAGS].join('|')})>)`, 'g'), '&lt;')
    .trim();
}

function stage(item: Obj): TechCardStage | null {
  const key = str(item.key);
  if (!key) return null;
  return {
    key,
    name: str(item.name) ?? '',
    description: (() => {
      const raw = str(item.description);
      const clean = raw ? sanitizeStageHtml(raw) : '';
      return clean && clean.replace(/<[^>]*>/g, '').trim() ? clean : null;
    })(),
    durationMin: num(item.durationMin),
    offsetMin: num(item.offsetMin),
    equipment: str(item.equipment),
    mode: str(item.mode),
    inputRowKeys: strList(item.inputRowKeys),
    inputStageKeys: strList(item.inputStageKeys),
    outputName: str(item.outputName),
    yieldPercent: num(item.yieldPercent),
  };
}

function packaging(item: Obj): TechCardPackagingRow | null {
  const goodId = str(item.goodId);
  const qty = num(item.qty);
  if (!goodId || qty == null || qty <= 0) return null;
  return { goodId, qty, basis: item.basis === 'box' ? 'box' : 'portion', note: str(item.note) };
}

function dosing(item: Obj): TechCardDosingFraction | null {
  const key = str(item.key);
  if (!key) return null;
  return { key, name: str(item.name) ?? '', rowKeys: strList(item.rowKeys), stageKeys: strList(item.stageKeys) };
}

/** Безпечне читання `payloadJson` (рядок або обʼєкт); невідомі поля відкидаються. */
export function normalizeTechCardPayload(raw: unknown): TechCardPayload {
  const obj = asObject(raw);
  if (!obj) return { ...EMPTY_TECH_CARD_PAYLOAD };
  const portionsPerBox = num(obj.portionsPerBox);
  return {
    stages: list(obj.stages, stage),
    packaging: list(obj.packaging, packaging),
    dosing: list(obj.dosing, dosing),
    notes: str(obj.notes),
    portionsPerBox: portionsPerBox != null && portionsPerBox > 0 ? Math.round(portionsPerBox) : null,
    lossFormula: isCatalogLossFormula(obj.lossFormula) ? obj.lossFormula : null,
    batchPortions: normalizeBatchPortions(obj.batchPortions),
  };
}

export interface TechCardCoverage {
  /** Рядки специфікації, що не входять у жоден етап */
  unassignedRowKeys: string[];
  /** Посилання етапів і дозування на рядки, яких уже немає в специфікації */
  missingRefs: Array<{ owner: 'stage' | 'dosing'; key: string; name: string; rowKey: string }>;
}

/** Що з рядків специфікації не розподілено по етапах і на які зниклі рядки посилається рецепт. */
export function techCardCoverage(payload: TechCardPayload, rowKeys: string[]): TechCardCoverage {
  const existing = new Set(rowKeys);
  const assigned = new Set(payload.stages.flatMap((st) => st.inputRowKeys));
  const missingRefs: TechCardCoverage['missingRefs'] = [];
  for (const st of payload.stages) {
    for (const rowKey of st.inputRowKeys) {
      if (!existing.has(rowKey)) missingRefs.push({ owner: 'stage', key: st.key, name: st.name, rowKey });
    }
  }
  for (const fraction of payload.dosing) {
    for (const rowKey of fraction.rowKeys) {
      if (!existing.has(rowKey)) missingRefs.push({ owner: 'dosing', key: fraction.key, name: fraction.name, rowKey });
    }
  }
  return {
    unassignedRowKeys: payload.stages.length === 0 ? [] : rowKeys.filter((k) => !assigned.has(k)),
    missingRefs,
  };
}

/** Прибрати посилання на рядки, яких немає в специфікації, і на неіснуючі етапи. */
export function pruneTechCardRefs(payload: TechCardPayload, rowKeys: string[]): TechCardPayload {
  const rows = new Set(rowKeys);
  const stages = new Set(payload.stages.map((st) => st.key));
  return {
    ...payload,
    stages: payload.stages.map((st, idx) => ({
      ...st,
      inputRowKeys: st.inputRowKeys.filter((k) => rows.has(k)),
      // вхід – лише попередні етапи
      inputStageKeys: st.inputStageKeys.filter((k) => payload.stages.slice(0, idx).some((p) => p.key === k)),
    })),
    dosing: payload.dosing.map((d) => ({
      ...d,
      rowKeys: d.rowKeys.filter((k) => rows.has(k)),
      stageKeys: d.stageKeys.filter((k) => stages.has(k)),
    })),
  };
}
