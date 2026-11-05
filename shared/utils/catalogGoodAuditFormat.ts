import { AUDIT_SOURCE_LABELS, type AuditSource } from '../constants/auditEntities.js';
import type { AuditFieldChange } from '../types/audit.js';
import type {
  CatalogAuditBarcodeRow,
  CatalogAuditComponentRow,
  CatalogGoodAuditPayload,
} from '../types/catalogAudit.js';
import { CATALOG_AUDIT_ACTIONS } from '../types/catalogAudit.js';

export const CATALOG_AUDIT_ACTION_LABELS: Record<string, string> = {
  [CATALOG_AUDIT_ACTIONS.CREATED]: 'Створено',
  [CATALOG_AUDIT_ACTIONS.UPDATED]: 'Змінено',
  [CATALOG_AUDIT_ACTIONS.DUPLICATED]: 'Створено копією',
  [CATALOG_AUDIT_ACTIONS.MOVED]: 'Переміщено',
  [CATALOG_AUDIT_ACTIONS.TYPE_CHANGED]: 'Змінено тип обʼєкта',
  [CATALOG_AUDIT_ACTIONS.ARCHIVED]: 'Архівовано',
  [CATALOG_AUDIT_ACTIONS.RESTORED]: 'Відновлено',
  [CATALOG_AUDIT_ACTIONS.TRASHED]: 'Переміщено в кошик',
  [CATALOG_AUDIT_ACTIONS.IMAGES_CHANGED]: 'Змінено зображення',
  [CATALOG_AUDIT_ACTIONS.LABEL_TEMPLATE_CHANGED]: 'Змінено шаблон наліпки',
  [CATALOG_AUDIT_ACTIONS.LABEL_PUBLISHED]: 'Опубліковано наліпку',
  [CATALOG_AUDIT_ACTIONS.STOREFRONT_PULL]: 'Імпорт з вітрини',
  [CATALOG_AUDIT_ACTIONS.DILOVOD_PULL]: 'Оновлено з Dilovod',
  [CATALOG_AUDIT_ACTIONS.DILOVOD_SYNC]: 'Синхронізація з Dilovod',
  [CATALOG_AUDIT_ACTIONS.LEGACY_FIELD_CHANGED]: 'Змінено (кеш товарів)',
};

export const CATALOG_AUDIT_FIELD_LABELS: Record<string, string> = {
  name: 'Назва',
  sku: 'Артикул',
  parentName: 'Папка',
  isGroup: 'Папка (група)',
  delMark: 'Позначка видалення',
  mainUnitId: 'Основна од. виміру',
  packageRatio: 'Коеф. упаковки',
  weight: 'Вага, кг',
  specQty: 'Розрахунок на N шт.',
  accPolicyId: 'Тип обʼєкта',
  printName: 'Назва для друку',
  description: 'Короткий опис',
  fullDescription: 'Повний опис',
  doNotPublish: 'Не публікувати на сайті',
  storefrontPresetName: 'Пресет опису вітрини',
  productIngredientsJson: 'Склад (теги)',
  productNutritionJson: 'КБЖВ',
  storefrontDescriptionDoc: 'Опис вітрини',
  grossWeight: 'Брутто, кг',
  mainProductWeight: 'Маса осн. продукту, кг',
  wooProductId: 'WooCommerce ID',
  unitRatio: 'Коеф. порцій',
  archivedAt: 'Дата архівації',
  portionLabelTemplateName: 'Шаблон наліпки «Порція»',
  boxLabelTemplateName: 'Шаблон наліпки «Коробка»',
};

const COMPONENT_FIELD_LABELS: Record<string, string> = {
  qty: 'к-сть',
  unitId: 'од.',
  note: 'примітка',
  cookingLossPercent: 'втрати %',
};

/** Довідники для людських назв (id → name). */
export interface CatalogAuditDictionaries {
  units?: Array<{ id: string; name: string }>;
  priceTypes?: Array<{ id: string; name: string }>;
  accPolicies?: Array<{ id: string; name: string }>;
}

export type CatalogAuditLineKind = 'changed' | 'added' | 'removed' | 'info';

export interface CatalogAuditLine {
  kind: CatalogAuditLineKind;
  /** Підпис секції/поля */
  label: string;
  text: string;
}

const EMPTY = '—';

function dictName(list: Array<{ id: string; name: string }> | undefined, id: unknown): string {
  if (id == null || id === '') return EMPTY;
  return list?.find((item) => item.id === id)?.name ?? String(id);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4))).replace('.', ',');
}

function formatJsonTags(value: unknown): string {
  if (typeof value !== 'string') return EMPTY;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.length ? parsed.join(', ') : EMPTY;
    if (parsed && typeof parsed === 'object') {
      const parts = Object.entries(parsed as Record<string, unknown>)
        .filter(([, v]) => String(v ?? '').trim() !== '')
        .map(([k, v]) => `${k}: ${v}`);
      return parts.length ? parts.join(', ') : EMPTY;
    }
  } catch {
    /* plain string */
  }
  return value;
}

export function formatCatalogAuditValue(field: string, value: unknown, dicts: CatalogAuditDictionaries = {}): string {
  if (value === null || value === undefined || value === '') return EMPTY;
  if (field === 'mainUnitId') return dictName(dicts.units, value);
  if (field === 'accPolicyId') return dictName(dicts.accPolicies, value);
  if (field === 'productIngredientsJson' || field === 'productNutritionJson') return formatJsonTags(value);
  if (typeof value === 'boolean') return value ? 'так' : 'ні';
  if (typeof value === 'number') return formatNumber(value);
  return String(value);
}

export function formatCatalogAuditFieldLabel(field: string, dicts: CatalogAuditDictionaries = {}): string {
  if (field.startsWith('price:')) return `Ціна «${dictName(dicts.priceTypes, field.slice(6))}»`;
  return CATALOG_AUDIT_FIELD_LABELS[field] ?? field;
}

function fieldLine(change: AuditFieldChange, dicts: CatalogAuditDictionaries): CatalogAuditLine {
  const label = formatCatalogAuditFieldLabel(change.field, dicts);
  if (change.truncated) return { kind: 'changed', label, text: 'змінено' };
  const from = formatCatalogAuditValue(change.field, change.from, dicts);
  const to = formatCatalogAuditValue(change.field, change.to, dicts);
  return { kind: 'changed', label, text: `${from} → ${to}` };
}

function componentText(row: CatalogAuditComponentRow, dicts: CatalogAuditDictionaries): string {
  const unit = row.unitId ? ` ${dictName(dicts.units, row.unitId)}` : '';
  const loss = row.cookingLossPercent ? `, втрати ${formatNumber(row.cookingLossPercent)}%` : '';
  return `${row.name}${row.sku ? ` (${row.sku})` : ''} — ${formatNumber(row.qty)}${unit}${loss}`;
}

function barcodeText(row: CatalogAuditBarcodeRow): string {
  const part = row.goodPartName ? `, партія ${row.goodPartName}` : '';
  const kind = row.kind === 'box' ? ', коробка' : '';
  return `${row.code}${kind}${part}${row.activity ? '' : ' (неактивний)'}`;
}

function componentValue(key: string, value: unknown, dicts: CatalogAuditDictionaries): string {
  if (key === 'unitId') return dictName(dicts.units, value);
  if (typeof value === 'number') return formatNumber(value);
  return value == null || value === '' ? EMPTY : String(value);
}

/** Розгорнутий список змін для UI. */
export function buildCatalogAuditLines(
  payload: CatalogGoodAuditPayload | null | undefined,
  dicts: CatalogAuditDictionaries = {},
): CatalogAuditLine[] {
  if (!payload) return [];
  const lines: CatalogAuditLine[] = [];

  for (const change of payload.changes ?? []) lines.push(fieldLine(change, dicts));

  const comp = payload.components;
  if (comp) {
    for (const row of comp.added) lines.push({ kind: 'added', label: 'Склад', text: componentText(row, dicts) });
    for (const row of comp.removed) lines.push({ kind: 'removed', label: 'Склад', text: componentText(row, dicts) });
    for (const row of comp.changed) {
      const parts = Object.keys(row.to).map((key) => {
        const from = componentValue(key, (row.from as Record<string, unknown>)[key], dicts);
        const to = componentValue(key, (row.to as Record<string, unknown>)[key], dicts);
        return `${COMPONENT_FIELD_LABELS[key] ?? key}: ${from} → ${to}`;
      });
      lines.push({ kind: 'changed', label: 'Склад', text: `${row.name}${row.sku ? ` (${row.sku})` : ''} — ${parts.join('; ')}` });
    }
  }

  const bc = payload.barcodes;
  if (bc) {
    for (const row of bc.added) lines.push({ kind: 'added', label: 'Штрихкод', text: barcodeText(row) });
    for (const row of bc.removed) lines.push({ kind: 'removed', label: 'Штрихкод', text: barcodeText(row) });
    for (const row of bc.changed) {
      const parts: string[] = [];
      if ('activity' in row.to) parts.push(row.to.activity ? 'активовано' : 'деактивовано');
      if ('kind' in row.to) parts.push(`тип: ${row.from.kind ?? EMPTY} → ${row.to.kind ?? EMPTY}`);
      lines.push({ kind: 'changed', label: 'Штрихкод', text: `${row.code} — ${parts.join(', ')}` });
    }
  }

  const img = payload.images;
  if (img) {
    for (const name of img.added) lines.push({ kind: 'added', label: 'Зображення', text: name });
    for (const name of img.removed) lines.push({ kind: 'removed', label: 'Зображення', text: name });
    if (img.primary) {
      lines.push({ kind: 'changed', label: 'Головне зображення', text: `${img.primary.from ?? EMPTY} → ${img.primary.to ?? EMPTY}` });
    }
    if (img.reordered) lines.push({ kind: 'info', label: 'Зображення', text: 'змінено порядок' });
  }

  const meta = payload.meta;
  if (meta && typeof meta === 'object') {
    if ('version' in meta && 'labelKind' in meta) {
      const kind = meta.labelKind === 'box' ? 'Коробка' : 'Порція';
      lines.push({ kind: 'info', label: 'Наліпка', text: `«${kind}», партія ${String(meta.batchNumber ?? EMPTY)}, версія ${String(meta.version)}` });
    }
  }
  return lines;
}

export function formatCatalogAuditAction(action: string): string {
  return CATALOG_AUDIT_ACTION_LABELS[action] ?? action;
}

export function formatCatalogAuditSource(source: AuditSource): string {
  return AUDIT_SOURCE_LABELS[source] ?? source;
}

export function formatCatalogAuditHeader(createdAt: string, userName: string | null, source: AuditSource): string {
  const date = new Date(createdAt);
  const when = Number.isNaN(date.getTime())
    ? createdAt
    : date.toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
  const who = userName?.trim() || (source === 'dilovod' ? 'Dilovod' : 'Система');
  return `${when} · ${who}`;
}
