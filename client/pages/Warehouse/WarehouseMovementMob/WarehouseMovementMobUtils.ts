import { CalendarDate, getLocalTimeZone, today } from '@internationalized/date';
import type { DateRange } from '@react-types/datepicker';
import { createStandardDatePresets } from '@/lib/dateReportingUtils';
import {
  STORAGE_DISPLAY_MAP,
  resolveStorageDisplay,
} from '../WarehouseMovement/storageDisplay';
import type {
  MovementMobAggregates,
  MovementMobApiRecord,
  MovementMobChronologyEvent,
  MovementMobDocumentViewModel,
  MovementMobListCardViewModel,
  MovementMobReceiptSummary,
  MovementMobProductLineViewModel,
  MovementMobProductMeta,
  MovementMobRawItem,
  MovementMobReceiptState,
  MovementMobScreenMode,
  MovementMobStockBreakdown,
  MovementMobStepperStep,
} from './WarehouseMovementMobTypes';

export const MOVEMENT_MOB_DEFAULT_PRESET_KEY = 'last7Days';

/** ID складу ГП / малого — для коротких бейджів макету */
const STORAGE_ID_GP = '1100700000001005';
const STORAGE_ID_SMALL = '1100700000001019';

const SHORT_BADGE_BY_STORAGE_ID: Record<string, string> = {
  [STORAGE_ID_GP]: 'ГП',
  [STORAGE_ID_SMALL]: 'МС',
};

export function getDefaultMovementMobDateRange(): DateRange {
  const presets = createStandardDatePresets();
  const last7 = presets.find((p) => p.key === MOVEMENT_MOB_DEFAULT_PRESET_KEY);
  return last7?.getRange() ?? {
    start: today(getLocalTimeZone()).subtract({ days: 6 }),
    end: today(getLocalTimeZone()),
  };
}

export function areDateRangesEqual(a: DateRange | null, b: DateRange | null): boolean {
  if (!a?.start || !a?.end || !b?.start || !b?.end) {
    return false;
  }
  return (
    (a.start as CalendarDate).compare(b.start as CalendarDate) === 0
    && (a.end as CalendarDate).compare(b.end as CalendarDate) === 0
  );
}

/** Чи фільтр збігається з дефолтом («Останні 7 днів»). */
export function isMovementMobFilterDefault(
  dateRange: DateRange | null,
  datePresetKey: string | null,
): boolean {
  if (datePresetKey !== MOVEMENT_MOB_DEFAULT_PRESET_KEY) {
    return false;
  }
  return areDateRangesEqual(dateRange, getDefaultMovementMobDateRange());
}

export function calendarDateToIso(date: CalendarDate): string {
  const year = date.year;
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatCalendarDateUk(date: CalendarDate): string {
  return `${String(date.day).padStart(2, '0')}.${String(date.month).padStart(2, '0')}.${date.year}`;
}

export function formatDateRangeLabel(range: DateRange | null): string {
  if (!range?.start || !range?.end) {
    return '';
  }
  return `${formatCalendarDateUk(range.start as CalendarDate)} - ${formatCalendarDateUk(range.end as CalendarDate)}`;
}

export function isSingleDayRange(range: DateRange | null): boolean {
  if (!range?.start || !range?.end) {
    return false;
  }
  return (range.start as CalendarDate).compare(range.end as CalendarDate) === 0;
}

export function parseMovementItems(raw: MovementMobApiRecord['items']): MovementMobRawItem[] {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function aggregateMovementItems(items: MovementMobRawItem[]): MovementMobAggregates {
  return items.reduce<MovementMobAggregates>(
    (acc, item) => {
      const boxes = Number(item.boxQuantity) || 0;
      const loose = Number(item.portionQuantity) || 0;
      // totalPortions зберігається при save; для Dilovod-імпорту часто лише portionQuantity (= total qty)
      const resolvedTotal =
        item.totalPortions != null && Number.isFinite(Number(item.totalPortions))
          ? Number(item.totalPortions)
          : loose;

      acc.totalBoxes += boxes;
      acc.totalLoosePortions += loose;
      acc.totalPortions += resolvedTotal;
      acc.lineCount += 1;
      return acc;
    },
    { totalBoxes: 0, totalLoosePortions: 0, totalPortions: 0, lineCount: 0 },
  );
}

function hasStoredDeviations(raw: unknown): boolean {
  return raw != null && raw !== '';
}

function resolvedSentPortions(item: MovementMobRawItem): number {
  if (item.totalPortions != null && Number.isFinite(Number(item.totalPortions))) {
    return Number(item.totalPortions);
  }
  return Number(item.portionQuantity) || 0;
}

function resolvedReceivedPortions(item: MovementMobRawItem): number {
  if (item.receivedTotalPortions != null && Number.isFinite(Number(item.receivedTotalPortions))) {
    return Number(item.receivedTotalPortions);
  }
  return Number(item.receivedPortionQuantity) || 0;
}

/** Підсумок прийому лише для документів, де вже є етап отримання. */
export function summarizeMovementReceipt(
  items: MovementMobRawItem[],
  status: string,
  deviations?: unknown,
): MovementMobReceiptSummary | null {
  if (status === 'pending_receipt') {
    return buildReceiptSummary(items, status);
  }
  // Старі finalized-документи (десктоп / Dilovod) не мають snapshot відхилень.
  if (status === 'finalized' && hasStoredDeviations(deviations)) {
    return buildReceiptSummary(items, status);
  }
  return null;
}

function buildReceiptSummary(
  items: MovementMobRawItem[],
  status: string,
): MovementMobReceiptSummary {
  const summary: MovementMobReceiptSummary = {
    receivedBoxes: 0,
    receivedLoosePortions: 0,
    receivedTotalPortions: 0,
    deltaPortions: 0,
    matchLines: 0,
    shortageLines: 0,
    surplusLines: 0,
    pendingLines: 0,
    shortagePortions: 0,
    surplusPortions: 0,
  };

  let sentTotal = 0;
  for (const item of items) {
    const sent = resolvedSentPortions(item);
    const received = resolvedReceivedPortions(item);
    sentTotal += sent;
    summary.receivedBoxes += Number(item.receivedBoxQuantity) || 0;
    summary.receivedLoosePortions += Number(item.receivedPortionQuantity) || 0;
    summary.receivedTotalPortions += received;

    if (status === 'pending_receipt' && received <= 0) {
      summary.pendingLines += 1;
      continue;
    }
    if (received === sent) {
      summary.matchLines += 1;
    } else if (received < sent) {
      summary.shortageLines += 1;
      summary.shortagePortions += sent - received;
    } else {
      summary.surplusLines += 1;
      summary.surplusPortions += received - sent;
    }
  }

  summary.deltaPortions = summary.receivedTotalPortions - sentTotal;
  return summary;
}

export function resolveShortStorageBadge(storageId?: string, fallbackName?: string): string {
  if (storageId && SHORT_BADGE_BY_STORAGE_ID[storageId]) {
    return SHORT_BADGE_BY_STORAGE_ID[storageId];
  }
  if (storageId && STORAGE_DISPLAY_MAP[storageId]) {
    const short = STORAGE_DISPLAY_MAP[storageId].shortName;
    if (short.includes('ГП')) return 'ГП';
    if (short.includes('М')) return 'МС';
  }
  const display = resolveStorageDisplay(storageId, fallbackName);
  return display.shortName.replace(/^Склад\s+/i, '') || '—';
}

export function buildStepperSteps(status: string): MovementMobStepperStep[] {
  const preparedDone =
    status === 'draft'
    || status === 'active'
    || status === 'pending_receipt'
    || status === 'finalized';
  const sentDone = status === 'active' || status === 'pending_receipt' || status === 'finalized';
  const receivedDone = status === 'finalized';

  return [
    {
      key: 'prepared',
      label: 'Підготовлено',
      state: preparedDone ? 'done' : 'pending',
    },
    {
      key: 'sent',
      label: 'Відправлено',
      state: sentDone ? 'done' : 'pending',
    },
    {
      key: 'received',
      label: receivedDone ? 'Отримано' : 'Ще не отримано',
      state: receivedDone ? 'done' : 'pending',
    },
  ];
}

export function resolveScreenMode(status: string): MovementMobScreenMode {
  if (status === 'deleted') return 'view';
  if (status === 'draft') return 'formation';
  if (status === 'pending_receipt') return 'receiving';
  return 'view';
}

export function formatMovementDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatChronologyDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDocNumber(internalDocNumber: string): string {
  const trimmed = String(internalDocNumber || '').trim();
  if (!trimmed) return 'П-';
  if (/^П-/i.test(trimmed)) return trimmed;
  return `П-${trimmed}`;
}

export function resolveChronologyStorageLabel(storageId: string, directoryName?: string): string {
  const fromDir = directoryName?.trim();
  if (fromDir) return fromDir;
  return resolveStorageDisplay(storageId).shortName;
}

export function sentChronologyTitle(destWarehouseName: string): string {
  return `Відправлено на «${destWarehouseName}»`;
}

export function toListCardViewModel(record: MovementMobApiRecord): MovementMobListCardViewModel {
  const items = parseMovementItems(record.items);
  const aggregates = aggregateMovementItems(items);
  const displayAt = record.movementDate || record.draftCreatedAt;

  return {
    id: record.id,
    displayNumber: formatDocNumber(record.internalDocNumber),
    displayDateTime: formatMovementDateTime(displayAt),
    sourceStorageId: record.sourceWarehouse,
    destStorageId: record.destinationWarehouse,
    sourceBadge: resolveShortStorageBadge(record.sourceWarehouse),
    destBadge: resolveShortStorageBadge(record.destinationWarehouse),
    aggregates,
    receiptSummary: summarizeMovementReceipt(items, record.status, record.deviations),
    stepperSteps: buildStepperSteps(record.status),
    status: record.status,
  };
}

export function buildProductLines(
  items: MovementMobRawItem[],
  metaBySku: Record<string, MovementMobProductMeta>,
): MovementMobProductLineViewModel[] {
  return items.map((item, index) => {
    const meta = metaBySku[item.sku] ?? { weight: null, portionsPerBox: null };
    const boxes = Number(item.boxQuantity) || 0;
    const loose = Number(item.portionQuantity) || 0;
    const portionsPerBox = meta.portionsPerBox && meta.portionsPerBox > 0 ? meta.portionsPerBox : null;
    const total =
      item.totalPortions != null && Number.isFinite(Number(item.totalPortions))
        ? Number(item.totalPortions)
        : portionsPerBox
          ? boxes * portionsPerBox + loose
          : loose;

    return {
      key: `${item.sku}-${item.batchId || item.batchNumber || index}`,
      sku: item.sku,
      productName: item.productName || item.sku,
      batchId: item.batchId || '',
      batchNumber: item.batchNumber || item.batchId || '—',
      boxQuantity: boxes,
      portionQuantity: loose,
      totalPortions: total,
      weight: meta.weight,
      portionsPerBox,
      barcode: item.barcode || undefined,
      barcodeKind: item.barcodeKind === 'box' ? 'box' : item.barcodeKind === 'portion' ? 'portion' : undefined,
      receivedBoxQuantity: Number(item.receivedBoxQuantity) || 0,
      receivedPortionQuantity: Number(item.receivedPortionQuantity) || 0,
      receivedTotalPortions:
        item.receivedTotalPortions != null && Number.isFinite(Number(item.receivedTotalPortions))
          ? Number(item.receivedTotalPortions)
          : Number(item.receivedPortionQuantity) || 0,
    };
  });
}

export function buildChronology(
  record: MovementMobApiRecord,
  destDirectoryName?: string,
): MovementMobChronologyEvent[] {
  const author = record.createdByName ?? null;
  const receiver = record.receivedByName ?? null;
  const destLabel = resolveChronologyStorageLabel(record.destinationWarehouse, destDirectoryName);
  const sentDone = record.status === 'active' || record.status === 'pending_receipt' || record.status === 'finalized';
  const receivedDone = record.status === 'finalized';
  const sentAt = record.submittedAt || record.sentToDilovodAt || record.lastSentToDilovodAt || record.draftLastEditedAt;
  const receivedAt = record.receivedAt || record.lastSentToDilovodAt || record.sentToDilovodAt;

  return [
    {
      key: 'prepared',
      occurredAt: formatChronologyDateTime(record.draftCreatedAt),
      title: 'Формування списку на переміщення',
      userName: author,
      state: 'done',
    },
    {
      key: 'sent',
      occurredAt: sentDone ? formatChronologyDateTime(sentAt) : 'ще не відправлено',
      title: sentChronologyTitle(destLabel),
      userName: sentDone ? author : null,
      state: sentDone ? 'done' : 'pending',
    },
    {
      key: 'received',
      occurredAt: receivedDone
        ? formatChronologyDateTime(receivedAt)
        : 'ще не отримано',
      title: 'Отримано',
      userName: receivedDone ? (receiver || author) : null,
      state: receivedDone ? 'done' : 'pending',
    },
  ];
}

export function toDocumentViewModel(
  record: MovementMobApiRecord,
  metaBySku: Record<string, MovementMobProductMeta> = {},
  destDirectoryName?: string,
): MovementMobDocumentViewModel {
  const items = parseMovementItems(record.items);
  const lines = buildProductLines(items, metaBySku);
  const aggregates = {
    totalBoxes: lines.reduce((s, l) => s + l.boxQuantity, 0),
    totalLoosePortions: lines.reduce((s, l) => s + l.portionQuantity, 0),
    totalPortions: lines.reduce((s, l) => s + l.totalPortions, 0),
    lineCount: lines.length,
  };

  return {
    id: record.id,
    displayNumber: formatDocNumber(record.internalDocNumber),
    status: record.status,
    mode: resolveScreenMode(record.status),
    sourceStorageId: record.sourceWarehouse,
    destStorageId: record.destinationWarehouse,
    lines,
    aggregates,
    chronology: buildChronology(record, destDirectoryName),
    createdBy: Number(record.createdBy) || 0,
    createdByName: record.createdByName ?? null,
    receivedByName: record.receivedByName ?? null,
  };
}

export function emptyReceivedQty(): Pick<
  MovementMobProductLineViewModel,
  'receivedBoxQuantity' | 'receivedPortionQuantity' | 'receivedTotalPortions'
> {
  return {
    receivedBoxQuantity: 0,
    receivedPortionQuantity: 0,
    receivedTotalPortions: 0,
  };
}

export function movementMobLineKey(sku: string, batchId: string, batchNumber: string): string {
  return `${sku}-${batchId || batchNumber || 'none'}`;
}

export function lineTotalPortions(boxes: number, portions: number, portionsPerBox: number): number {
  const perBox = portionsPerBox > 0 ? portionsPerBox : 0;
  return boxes * perBox + portions;
}

export function breakdownStockPortions(totalPortions: number, portionsPerBox: number): MovementMobStockBreakdown {
  const portions = Number.isFinite(totalPortions) ? Math.max(0, totalPortions) : 0;
  const perBox = portionsPerBox > 0 ? portionsPerBox : 0;
  if (perBox <= 0) {
    return { portions, boxes: 0, loosePortions: portions };
  }
  return {
    portions,
    boxes: Math.floor(portions / perBox),
    loosePortions: portions % perBox,
  };
}

export function aggregatesFromLines(lines: MovementMobProductLineViewModel[]): MovementMobAggregates {
  return {
    totalBoxes: lines.reduce((sum, line) => sum + line.boxQuantity, 0),
    totalLoosePortions: lines.reduce((sum, line) => sum + line.portionQuantity, 0),
    totalPortions: lines.reduce((sum, line) => sum + line.totalPortions, 0),
    lineCount: lines.length,
  };
}

export function aggregatesFromReceivedLines(lines: MovementMobProductLineViewModel[]): MovementMobAggregates {
  return {
    totalBoxes: lines.reduce((sum, line) => sum + line.receivedBoxQuantity, 0),
    totalLoosePortions: lines.reduce((sum, line) => sum + line.receivedPortionQuantity, 0),
    totalPortions: lines.reduce((sum, line) => sum + line.receivedTotalPortions, 0),
    lineCount: lines.filter((line) => line.receivedTotalPortions > 0).length,
  };
}

export function lineReceiptState(
  line: MovementMobProductLineViewModel,
): MovementMobReceiptState {
  if (line.receivedTotalPortions <= 0) return 'pending';
  if (line.receivedTotalPortions === line.totalPortions) return 'match';
  return line.receivedTotalPortions < line.totalPortions ? 'shortage' : 'surplus';
}

/** Колір фактично прийнятої кількості. */
export function receiptReceivedClass(state: MovementMobReceiptState): string {
  if (state === 'match') return 'text-success-600';
  if (state === 'shortage') return 'text-danger-600';
  if (state === 'surplus') return 'text-primary-600';
  return 'text-default-400';
}

/** Колір дельти (отримано − відправлено). */
export function receiptDeltaClass(delta: number): string {
  if (delta === 0) return 'text-success-600';
  if (delta < 0) return 'text-danger-600';
  return 'text-primary-600';
}

export function receiptDeviations(lines: MovementMobProductLineViewModel[]): MovementMobProductLineViewModel[] {
  return lines.filter((line) => line.receivedTotalPortions !== line.totalPortions);
}

export function mergeMovementMobLine(
  lines: MovementMobProductLineViewModel[],
  incoming: MovementMobProductLineViewModel,
): MovementMobProductLineViewModel[] {
  const index = lines.findIndex((line) => line.key === incoming.key);
  if (index < 0) {
    return [...lines, incoming];
  }

  const existing = lines[index];
  const portionsPerBox = incoming.portionsPerBox ?? existing.portionsPerBox ?? 0;
  const boxQuantity = existing.boxQuantity + incoming.boxQuantity;
  const portionQuantity = existing.portionQuantity + incoming.portionQuantity;
  const next: MovementMobProductLineViewModel = {
    ...existing,
    ...incoming,
    boxQuantity,
    portionQuantity,
    totalPortions: lineTotalPortions(boxQuantity, portionQuantity, portionsPerBox ?? 0),
    portionsPerBox: portionsPerBox || null,
  };
  const copy = [...lines];
  copy[index] = next;
  return copy;
}

/** Замінює рядок з тим самим ключем (або додає), без сумування кількостей. */
export function replaceMovementMobLine(
  lines: MovementMobProductLineViewModel[],
  incoming: MovementMobProductLineViewModel,
): MovementMobProductLineViewModel[] {
  const index = lines.findIndex((line) => line.key === incoming.key);
  if (index < 0) {
    return [...lines, incoming];
  }
  const copy = [...lines];
  copy[index] = incoming;
  return copy;
}

export function insertMovementMobLineAt(
  lines: MovementMobProductLineViewModel[],
  incoming: MovementMobProductLineViewModel,
  index: number,
): MovementMobProductLineViewModel[] {
  if (lines.some((line) => line.key === incoming.key)) {
    return replaceMovementMobLine(lines, incoming);
  }
  const copy = [...lines];
  const at = Math.max(0, Math.min(index, copy.length));
  copy.splice(at, 0, incoming);
  return copy;
}

export function committedPortionsForSku(
  lines: MovementMobProductLineViewModel[],
  sku: string,
  exceptKey?: string,
  side: 'sent' | 'received' = 'sent',
): number {
  return lines.reduce((sum, line) => {
    if (line.sku !== sku) return sum;
    if (exceptKey && line.key === exceptKey) return sum;
    return sum + (side === 'received' ? line.receivedTotalPortions : line.totalPortions);
  }, 0);
}

export function serializeMobDraftItems(
  lines: MovementMobProductLineViewModel[],
  sourceStorageId: string,
): MovementMobRawItem[] {
  return lines.map((line) => ({
    sku: line.sku,
    productName: line.productName,
    boxQuantity: line.boxQuantity,
    portionQuantity: line.portionQuantity,
    totalPortions: line.totalPortions,
    batchNumber: line.batchNumber === '—' ? '' : line.batchNumber,
    batchId: line.batchId,
    batchStorage: sourceStorageId,
    forecast: 0,
    barcode: line.barcode || undefined,
    barcodeKind: line.barcodeKind,
    receivedBoxQuantity: line.receivedBoxQuantity,
    receivedPortionQuantity: line.receivedPortionQuantity,
    receivedTotalPortions: line.receivedTotalPortions,
  }));
}

export function findPresetKeyForRange(
  range: DateRange | null,
  presets: ReturnType<typeof createStandardDatePresets>,
): string | null {
  if (!range?.start || !range?.end) return null;
  for (const preset of presets) {
    const presetRange = preset.getRange();
    if (
      (range.start as CalendarDate).compare(presetRange.start as CalendarDate) === 0
      && (range.end as CalendarDate).compare(presetRange.end as CalendarDate) === 0
    ) {
      return preset.key;
    }
  }
  return null;
}
