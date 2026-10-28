import type { ReactNode } from 'react';
import { Checkbox } from '@heroui/react';
import type { CatalogDilovodPreviewResult, CatalogDilovodBarcodePreviewLine } from '@shared/types/catalog';
import type { WooPullPreviewResult } from '@shared/types/storefront';
import { catalogPlainTextForCompare } from '@shared/utils/catalogHtmlCompare';
import { CatalogImagePreviewPopover } from '../CatalogImagePreviewPopover';
import { PullFieldBarcodesComparePopover } from '../PullFieldBarcodesComparePopover';
import { PullFieldConflictTooltip } from '../PullFieldConflictTooltip';
import { PullFieldFullTextPopover } from '../PullFieldFullTextPopover';
import { PullFieldStorefrontDocComparePopover } from '../PullFieldStorefrontDocComparePopover';
import { summarizeStorefrontDescriptionDocDiff } from '@shared/utils/storefrontDescriptionDocDiff';
import { formatCatalogBarcodePreviewList } from '@shared/utils/catalogBarcodePreviewFormat';

export type ProductPullSource = 'local' | 'woo' | 'dilovod';

export type ProductPullTriRowId =
  | 'name'
  | 'shortDescription'
  | 'weight'
  | 'regularPrice'
  | 'storefrontDescriptionDoc'
  | 'productIngredientsJson'
  | 'productNutritionJson'
  | 'doNotPublish'
  | 'category'
  | 'packageRatio'
  | 'specQty'
  | 'mainComponentWeight'
  | 'kitPortionCount'
  | 'images'
  | 'barcodesAndBatches';

export interface ProductPullTriRow {
  id: ProductPullTriRowId;
  label: string;
  local: string;
  woo: string;
  dilovod: string | null;
  conflictLocal: string | null;
  conflictWoo: string | null;
  conflictDilovod: string | null;
  hasConflict: boolean;
  dilovodSelectable: boolean;
  wooSelectable: boolean;
  barcodePreviewLocal?: CatalogDilovodBarcodePreviewLine[];
  barcodePreviewDilovod?: CatalogDilovodBarcodePreviewLine[];
}

const ROW_WOO_CONFLICT_FIELD: Partial<Record<ProductPullTriRowId, string>> = {
  name: 'name',
  shortDescription: 'description',
  weight: 'weight',
  regularPrice: 'regularPrice',
  storefrontDescriptionDoc: 'storefrontDescriptionDoc',
  productIngredientsJson: 'productIngredientsJson',
  productNutritionJson: 'productNutritionJson',
  doNotPublish: 'doNotPublish',
  category: 'category',
  images: 'images',
};

const ROW_DILOVOD_CONFLICT_FIELD: Partial<Record<ProductPullTriRowId, string>> = {
  name: 'name',
  weight: 'weight',
  regularPrice: 'regularPrice',
  packageRatio: 'packageRatio',
  barcodesAndBatches: 'barcodeCount',
};

function truncate(value: string | null | undefined, max = 72): string {
  if (!value?.trim()) return '—';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}…`;
}

function formatPlainShort(value: string | null | undefined, max = 80): string {
  const plain = catalogPlainTextForCompare(value) || value?.trim() || '';
  if (!plain) return '—';
  return truncate(plain, max);
}

function countStorefrontDocBlocks(
  value: string | { type?: string; content?: unknown[] } | null | undefined,
): number {
  if (value == null) return 0;
  let doc: { content?: unknown[] } | null = null;
  if (typeof value === 'string') {
    if (!value.trim()) return 0;
    try {
      doc = JSON.parse(value) as { content?: unknown[] };
    } catch {
      return 0;
    }
  } else if (typeof value === 'object' && value.type === 'doc') {
    doc = value;
  }
  return Array.isArray(doc?.content) ? doc.content.length : 0;
}

function formatStorefrontDocSummary(
  value: string | { type?: string; content?: unknown[] } | null | undefined,
): string {
  const count = countStorefrontDocBlocks(value);
  return count > 0 ? `${count} поз.` : '—';
}

function formatJsonIngredients(value: string | null | undefined): string {
  if (!value?.trim()) return '—';
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.length > 0 ? `${parsed.length} поз.` : '—';
    }
  } catch {
    /* ignore */
  }
  return truncate(value, 48);
}

function formatNutritionLocal(value: string | null | undefined): string {
  if (!value?.trim()) return '—';
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object') return 'є дані';
  } catch {
    /* ignore */
  }
  return truncate(value, 48);
}

function formatNutritionParsed(
  parsed: WooPullPreviewResult['proposed']['parsed']['productNutritionJson'],
): string {
  if (!parsed) return '—';
  return 'є дані';
}

function formatBool(value: boolean): string {
  return value ? 'так' : 'ні';
}

function formatNum(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return String(value);
}

function formatErpRowCount(value: string | null | undefined): string {
  if (!value?.trim()) return '—';
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `${n} поз.`;
}

function rowHasConflict(
  rowId: ProductPullTriRowId,
  wooFields: Set<string>,
  dilovodFields: Set<string>,
): boolean {
  const wooField = ROW_WOO_CONFLICT_FIELD[rowId];
  if (wooField && wooFields.has(wooField)) return true;
  const dilovodField = ROW_DILOVOD_CONFLICT_FIELD[rowId];
  if (dilovodField && dilovodFields.has(dilovodField)) return true;
  return false;
}

const KIT_HIDDEN_ROW_IDS: ProductPullTriRowId[] = [
  'productIngredientsJson',
  'productNutritionJson',
  'mainComponentWeight',
  'packageRatio',
];

export type ProductPullTriFieldView = 'differences' | 'all';

/** Після узгодження: якщо для WC-конфлікту обрано не WC — потрібен push BO → сайт. */
export function shouldPushTriSyncChoicesToWoo(
  rows: ProductPullTriRow[],
  sourceByRowId: Record<string, ProductPullSource>,
  wooConflictFields: Iterable<string>,
): boolean {
  const conflicts = new Set(wooConflictFields);
  for (const row of rows) {
    const wooField = ROW_WOO_CONFLICT_FIELD[row.id];
    if (!wooField || !conflicts.has(wooField)) continue;
    if ((sourceByRowId[row.id] ?? 'local') !== 'woo') return true;
  }
  return false;
}

export function filterProductPullTriRows(
  rows: ProductPullTriRow[],
  options: { isKit: boolean; fieldView: ProductPullTriFieldView },
): ProductPullTriRow[] {
  let filtered = rows;
  if (options.isKit) {
    filtered = filtered.filter(
      (row) => !KIT_HIDDEN_ROW_IDS.includes(row.id) && row.id !== 'specQty',
    );
  } else {
    filtered = filtered.filter((row) => row.id !== 'kitPortionCount');
  }
  if (options.fieldView === 'differences') {
    filtered = filtered.filter((row) => row.hasConflict);
  }
  return filtered.sort((a, b) => {
    if (a.id === 'specQty') return 1;
    if (b.id === 'specQty') return -1;
    return 0;
  });
}

export function buildProductPullTriRows(
  preview: WooPullPreviewResult,
  dilovod: CatalogDilovodPreviewResult | null,
  localName: string,
  _localFullDescription: string,
  localShortDescription: string,
): ProductPullTriRow[] {
  const d = dilovod?.remoteAvailable ? dilovod : null;
  const dilovodLocal = dilovod?.local;
  const wooCompareEnabled = preview.wcCompareEnabled !== false;
  const wooConflictFields = wooCompareEnabled
    ? new Set(preview.conflicts.map((c) => c.field))
    : new Set<string>();
  const dilovodConflictFields = new Set(d?.conflicts.map((c) => c.field) ?? []);

  const dilovodName = d ? truncate(d.proposed.name, 80) : null;
  const dilovodWeight = d?.proposed.weight ?? null;
  const dilovodPrice = d?.proposed.regularPrice ?? null;
  const dilovodPackageRatio = d?.proposed.packageRatio ?? null;
  const localPackageRatio = preview.local.packageRatio ?? null;

  const proposedIngredients = preview.proposed.parsed.productIngredientsJson;
  const proposedIngredientsStr =
    proposedIngredients.length > 0 ? JSON.stringify(proposedIngredients) : null;

  const rows: Array<Omit<ProductPullTriRow, 'hasConflict'>> = [
    {
      id: 'name',
      label: 'Назва товару',
      local: truncate(localName, 80),
      woo: truncate(preview.proposed.name, 80),
      dilovod: dilovodName,
      conflictLocal: localName,
      conflictWoo: preview.proposed.name,
      conflictDilovod: d?.proposed.name ?? null,
      dilovodSelectable: Boolean(d && dilovodName && dilovodName !== '—'),
      wooSelectable: true,
    },
    {
      id: 'shortDescription',
      label: 'Короткий опис',
      local: formatPlainShort(localShortDescription),
      woo: formatPlainShort(preview.proposed.shortDescription),
      dilovod: null,
      conflictLocal: localShortDescription,
      conflictWoo: preview.proposed.shortDescription,
      conflictDilovod: null,
      dilovodSelectable: false,
      wooSelectable: true,
    },
    {
      id: 'storefrontDescriptionDoc',
      label: 'Повний опис (структура)',
      local: formatStorefrontDocSummary(preview.local.storefrontDescriptionDoc),
      woo: formatStorefrontDocSummary(preview.proposed.parsed.storefrontDescriptionDoc ?? null),
      dilovod: null,
      conflictLocal: preview.local.storefrontDescriptionDoc,
      conflictWoo:
        preview.conflicts.find((c) => c.field === 'storefrontDescriptionDoc')?.remoteValue ??
        (preview.proposed.parsed.storefrontDescriptionDoc
          ? JSON.stringify(preview.proposed.parsed.storefrontDescriptionDoc)
          : null),
      conflictDilovod: null,
      dilovodSelectable: false,
      wooSelectable: true,
    },
    {
      id: 'productIngredientsJson',
      label: 'Склад',
      local: formatJsonIngredients(preview.local.productIngredientsJson),
      woo:
        proposedIngredients.length > 0
          ? `${proposedIngredients.length} поз.`
          : '—',
      dilovod: null,
      conflictLocal: preview.local.productIngredientsJson,
      conflictWoo: proposedIngredientsStr,
      conflictDilovod: null,
      dilovodSelectable: false,
      wooSelectable: true,
    },
    {
      id: 'productNutritionJson',
      label: 'КБЖУ',
      local: formatNutritionLocal(preview.local.productNutritionJson),
      woo: formatNutritionParsed(preview.proposed.parsed.productNutritionJson),
      dilovod: null,
      conflictLocal: preview.local.productNutritionJson,
      conflictWoo:
        preview.conflicts.find((c) => c.field === 'productNutritionJson')?.remoteValue ??
        (preview.proposed.parsed.productNutritionJson
          ? JSON.stringify(preview.proposed.parsed.productNutritionJson)
          : null),
      conflictDilovod: null,
      dilovodSelectable: false,
      wooSelectable: true,
    },
    {
      id: 'weight',
      label: 'Вага, кг',
      local: formatNum(preview.local.weight),
      woo: formatNum(preview.proposed.weight),
      dilovod: dilovodWeight,
      conflictLocal: formatNum(preview.local.weight),
      conflictWoo: formatNum(preview.proposed.weight),
      conflictDilovod: dilovodWeight,
      dilovodSelectable: Boolean(d && dilovodWeight),
      wooSelectable: true,
    },
    {
      id: 'mainComponentWeight',
      label: 'Маса осн. продукту, кг',
      local: formatNum(preview.local.mainComponentWeight),
      woo: '—',
      dilovod: null,
      conflictLocal: formatNum(preview.local.mainComponentWeight),
      conflictWoo: null,
      conflictDilovod: null,
      dilovodSelectable: false,
      wooSelectable: false,
    },
    {
      id: 'packageRatio',
      label: 'Кількість в наборі (packageRatio)',
      local: formatNum(localPackageRatio),
      woo: '—',
      dilovod: dilovodPackageRatio,
      conflictLocal: formatNum(localPackageRatio),
      conflictWoo: null,
      conflictDilovod: dilovodPackageRatio,
      dilovodSelectable: Boolean(d && dilovodPackageRatio),
      wooSelectable: false,
    },
    {
      id: 'kitPortionCount',
      label: 'Порцій у наборі',
      local: formatNum(preview.local.kitPortionCount),
      woo: '—',
      dilovod: null,
      conflictLocal: formatNum(preview.local.kitPortionCount),
      conflictWoo: null,
      conflictDilovod: null,
      dilovodSelectable: false,
      wooSelectable: false,
    },
    {
      id: 'regularPrice',
      label: 'Ціна',
      local: preview.local.regularPrice ?? '—',
      woo: preview.proposed.regularPrice ?? '—',
      dilovod: dilovodPrice ?? null,
      conflictLocal: preview.local.regularPrice,
      conflictWoo: preview.proposed.regularPrice,
      conflictDilovod: dilovodPrice,
      dilovodSelectable: Boolean(d && dilovodPrice),
      wooSelectable: true,
    },
    {
      id: 'doNotPublish',
      label: 'Не публікувати',
      local: formatBool(preview.local.doNotPublish),
      woo: formatBool(preview.proposed.doNotPublish),
      dilovod: null,
      conflictLocal: formatBool(preview.local.doNotPublish),
      conflictWoo: formatBool(preview.proposed.doNotPublish),
      conflictDilovod: null,
      dilovodSelectable: false,
      wooSelectable: true,
    },
    {
      id: 'category',
      label: 'Категорія',
      local: truncate(preview.local.groupName, 80),
      woo: truncate(preview.proposed.categoryName, 80),
      dilovod: null,
      conflictLocal: preview.local.groupName,
      conflictWoo: preview.proposed.categoryName,
      conflictDilovod: null,
      dilovodSelectable: false,
      wooSelectable: true,
    },
    {
      id: 'images',
      label: 'Зображення',
      local: preview.local.imageCount > 0 ? `${preview.local.imageCount} шт.` : '—',
      woo: preview.proposed.imageCount > 0 ? `${preview.proposed.imageCount} шт.` : '—',
      dilovod: null,
      conflictLocal: preview.local.imageCount > 0 ? String(preview.local.imageCount) : null,
      conflictWoo:
        preview.proposed.imageCount > 0 ? String(preview.proposed.imageCount) : null,
      conflictDilovod: null,
      dilovodSelectable: false,
      wooSelectable: true,
    },
    {
      id: 'barcodesAndBatches',
      label: 'Штрихкоди і партії',
      local: formatErpRowCount(dilovodLocal?.barcodeCount),
      woo: '—',
      dilovod: formatErpRowCount(d?.proposed.barcodeCount),
      conflictLocal: dilovodLocal?.barcodeCount ?? null,
      conflictWoo: null,
      conflictDilovod: d?.proposed.barcodeCount ?? null,
      dilovodSelectable: Boolean(d),
      wooSelectable: false,
      barcodePreviewLocal: dilovod?.localBarcodes ?? [],
      barcodePreviewDilovod: dilovod?.remoteAvailable ? (dilovod.proposedBarcodes ?? []) : [],
    },
    {
      id: 'specQty',
      label: 'Розрахунок на (специфікація)',
      local: formatNum(preview.local.specQty),
      woo: '—',
      dilovod: null,
      conflictLocal: formatNum(preview.local.specQty),
      conflictWoo: null,
      conflictDilovod: null,
      dilovodSelectable: false,
      wooSelectable: false,
    },
  ];

  return rows.map((row) => ({
    ...row,
    woo: wooCompareEnabled ? row.woo : '—',
    conflictWoo: wooCompareEnabled ? row.conflictWoo : null,
    wooSelectable: wooCompareEnabled && row.wooSelectable,
    hasConflict: rowHasConflict(row.id, wooConflictFields, dilovodConflictFields),
  }));
}

interface ProductPullTriSourceTableProps {
  rows: ProductPullTriRow[];
  sourceByRowId: Record<string, ProductPullSource>;
  onSourceChange: (rowId: ProductPullTriRowId, source: ProductPullSource) => void;
  localImagePreviewUrls?: string[];
  wooImagePreviewUrls?: string[];
  replaceImages?: {
    visible: boolean;
    checked: boolean;
    onChange: (checked: boolean) => void;
    localImageCount: number;
  };
}

const SIDE_LABELS: Record<ProductPullSource, string> = {
  local: 'Backoffice',
  woo: 'WC',
  dilovod: 'Діловoд',
};

const RAW_POPOVER_ROW_IDS = new Set<ProductPullTriRowId>([
  'storefrontDescriptionDoc',
  'productIngredientsJson',
  'productNutritionJson',
]);

function conflictValueForSide(row: ProductPullTriRow, side: ProductPullSource): string | null {
  const value =
    side === 'local' ? row.conflictLocal : side === 'woo' ? row.conflictWoo : row.conflictDilovod;
  return value?.trim() ? value : null;
}

function isTruncatedCellDisplay(display: string, full: string | null): boolean {
  if (!full?.trim() || display === '—') return false;
  if (display.endsWith('…')) return true;
  const plain = catalogPlainTextForCompare(full) || full;
  const normalized = plain.replace(/\s+/g, ' ').trim();
  const displayCore = display.replace(/…$/, '').trim();
  return normalized.length > displayCore.length;
}

function wrapCellContent(
  row: ProductPullTriRow,
  side: ProductPullSource,
  display: string,
  localImagePreviewUrls: string[],
  wooImagePreviewUrls: string[],
): ReactNode {
  if (row.id === 'images') {
    return wrapImagePreview(row.id, side, display, localImagePreviewUrls, wooImagePreviewUrls);
  }

  if (row.id === 'barcodesAndBatches' && side !== 'woo') {
    const localLines = row.barcodePreviewLocal ?? [];
    const dilovodLines = row.barcodePreviewDilovod ?? [];
    if (localLines.length > 0 || dilovodLines.length > 0) {
      if (display === '—' && side === 'dilovod' && dilovodLines.length === 0) {
        return display;
      }
      if (display === '—' && side === 'local' && localLines.length === 0) {
        return display;
      }
      return (
        <PullFieldBarcodesComparePopover
          localLines={localLines}
          dilovodLines={dilovodLines}
          positionLabel={display}
        >
          <span className="cursor-pointer underline decoration-dotted underline-offset-2">{display}</span>
        </PullFieldBarcodesComparePopover>
      );
    }
  }

  const full = conflictValueForSide(row, side);

  if (
    row.id === 'storefrontDescriptionDoc' &&
    row.hasConflict &&
    row.conflictLocal &&
    row.conflictWoo &&
    display !== '—'
  ) {
    const { diffCount } = summarizeStorefrontDescriptionDocDiff(row.conflictLocal, row.conflictWoo);
    const suffix = diffCount > 0 ? ` · ${diffCount} відм.` : '';
    return (
      <PullFieldStorefrontDocComparePopover
        localRaw={row.conflictLocal}
        wooRaw={row.conflictWoo}
        positionLabel={display}
      >
        <span className="cursor-pointer underline decoration-dotted underline-offset-2">
          {display}
          {suffix}
        </span>
      </PullFieldStorefrontDocComparePopover>
    );
  }

  if (full && RAW_POPOVER_ROW_IDS.has(row.id) && display !== '—') {
    return (
      <PullFieldFullTextPopover fullText={full} title={display}>
        <span className="cursor-pointer underline decoration-dotted underline-offset-2">{display}</span>
      </PullFieldFullTextPopover>
    );
  }

  if (full && isTruncatedCellDisplay(display, full)) {
    return (
      <span className="block space-y-0.5">
        <span className="break-words">{display}</span>
        <PullFieldFullTextPopover fullText={full}>
          <p className="inline-block mt-1.5 cursor-pointer font-medium text-primary-600 underline decoration-dotted underline-offset-2 hover:text-primary-700">
            показати повний текст
          </p>
        </PullFieldFullTextPopover>
      </span>
    );
  }

  return display;
}

function wrapImagePreview(
  rowId: ProductPullTriRowId,
  side: ProductPullSource,
  display: string,
  localImagePreviewUrls: string[],
  wooImagePreviewUrls: string[],
): ReactNode {
  if (rowId !== 'images') return display;
  const urls =
    side === 'local' ? localImagePreviewUrls : side === 'woo' ? wooImagePreviewUrls : [];
  if (urls.length === 0) return display;
  return (
    <CatalogImagePreviewPopover urls={urls} label={display}>
      <span className="underline decoration-dotted underline-offset-2">{display}</span>
    </CatalogImagePreviewPopover>
  );
}

export function ProductPullTriSourceTable({
  rows,
  sourceByRowId,
  onSourceChange,
  localImagePreviewUrls = [],
  wooImagePreviewUrls = [],
  replaceImages,
}: ProductPullTriSourceTableProps) {
  const LABEL_CLASS = 'bg-default-200/80 text-default-500 rounded ml-0.5 px-1 py-0.5 text-xs font-medium';
  return (
    <section className="max-h-[min(28rem,55vh)] overflow-y-auto rounded-md shadow-[0_6px_20px_-6px_rgba(0,0,0,0.1)] border border-default-200 scrollbar-thin-transparent">
      <div className="sticky top-0 z-10 border-b border-default-200 bg-default-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-default-500 shadow-[0_3px_10px_-2px_rgba(0,0,0,0.1)]">
        <div className="grid grid-cols-[7rem_1fr_1fr_1fr] gap-2">
          <span>Поле</span>
          <span>Backoffice <span className={LABEL_CLASS}>BO</span></span>
          <span>WooCommerce <span className={LABEL_CLASS}>WC</span></span>
          <span>Діловoд <span className={LABEL_CLASS}>ERP</span></span>
        </div>
      </div>
      <div className="divide-y divide-default-100">
        {rows.map((row) => {
          const selected = sourceByRowId[row.id] ?? 'local';

          return (
            <div key={row.id} className="px-3 py-3">
              <div className="grid grid-cols-[7rem_1fr_1fr_1fr] gap-2 text-sm items-start">
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                <span className="font-medium text-default-700">{row.label}</span>
                {row.hasConflict ? (
                  <PullFieldConflictTooltip
                    fieldLabel={row.label}
                    localValue={
                      row.id === 'barcodesAndBatches'
                        ? formatCatalogBarcodePreviewList(row.barcodePreviewLocal) ?? row.conflictLocal
                        : row.conflictLocal
                    }
                    remoteValue={row.conflictWoo}
                    dilovodValue={
                      row.id === 'barcodesAndBatches'
                        ? formatCatalogBarcodePreviewList(row.barcodePreviewDilovod) ??
                          row.conflictDilovod
                        : row.conflictDilovod
                    }
                  />
                ) : null}
              </div>
              {(['local', 'woo', 'dilovod'] as const).map((side) => {
                const display =
                  side === 'local' ? row.local : side === 'woo' ? row.woo : row.dilovod ?? '—';
                const disabled =
                  side === 'woo' ? !row.wooSelectable : side === 'dilovod' ? !row.dilovodSelectable : false;
                const isSelected = selected === side;
                const cellClass = [
                  'min-w-0 rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
                  isSelected
                    ? 'border-primary bg-primary-50/80 ring-1 ring-primary'
                    : 'border-default-200 bg-default-50 hover:border-default-300',
                  disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
                ].join(' ');

                const showReplaceCheckbox =
                  side === 'woo' && row.id === 'images' && replaceImages?.visible;

                if (showReplaceCheckbox) {
                  return (
                    <div key={side} className={cellClass.replace('cursor-pointer', 'cursor-default')}>
                      <span className="mb-0.5 block text-[10px] font-medium text-default-400/80">
                        {SIDE_LABELS[side]}
                      </span>
                      <span className="break-words text-default-700">
                        {wrapCellContent(
                          row,
                          side,
                          display,
                          localImagePreviewUrls,
                          wooImagePreviewUrls,
                        )}
                      </span>
                      <label
                        className="mt-2 flex cursor-pointer items-center gap-1.5 border-t border-default-200/80 pt-2"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          size="sm"
                          isSelected={replaceImages.checked}
                          onValueChange={replaceImages.onChange}
                        />
                        <span className="text-[11px] font-normal text-default-600">
                          Замінити локальні файли
                        </span>
                      </label>
                    </div>
                  );
                }

                return (
                  <div
                    key={side}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-disabled={disabled}
                    onClick={() => !disabled && onSourceChange(row.id, side)}
                    onKeyDown={(e) => {
                      if (disabled) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSourceChange(row.id, side);
                      }
                    }}
                    className={cellClass}
                  >
                    <span className="mb-0.5 block text-[10px] font-medium text-default-400/80">
                      {SIDE_LABELS[side]}
                    </span>
                    <span className="break-words text-default-700">
                      {wrapCellContent(
                        row,
                        side,
                        display,
                        localImagePreviewUrls,
                        wooImagePreviewUrls,
                      )}
                    </span>
                  </div>
                );
              })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
