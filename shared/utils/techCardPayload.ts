import {
  EMPTY_TECH_CARD_PAYLOAD,
  type TechCardDosingFraction,
  type TechCardPackagingRow,
  type TechCardPayload,
  type TechCardStage,
} from '../types/production.js';
import { isCatalogLossFormula } from './catalogLoss.js';

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

function stage(item: Obj): TechCardStage | null {
  const key = str(item.key);
  if (!key) return null;
  return {
    key,
    name: str(item.name) ?? '',
    description: str(item.description),
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
  };
}
