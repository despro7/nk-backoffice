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
  MovementMobDbStatus,
  MovementMobDocumentViewModel,
  MovementMobListCardViewModel,
  MovementMobProductLineViewModel,
  MovementMobProductMeta,
  MovementMobRawItem,
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
  const normalized = status as MovementMobDbStatus;
  const preparedDone = normalized === 'draft' || normalized === 'active' || normalized === 'finalized';
  const sentDone = normalized === 'active' || normalized === 'finalized';
  const receivedDone = normalized === 'finalized';

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
  return status === 'draft' ? 'formation' : 'view';
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
  return `П-${internalDocNumber}`;
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
    };
  });
}

export function buildChronology(record: MovementMobApiRecord): MovementMobChronologyEvent[] {
  const author = record.createdByName ?? null;
  const destLabel = resolveStorageDisplay(record.destinationWarehouse).shortName;
  const sentDone = record.status === 'active' || record.status === 'finalized';
  const receivedDone = record.status === 'finalized';
  const sentAt = record.sentToDilovodAt || record.lastSentToDilovodAt || record.draftLastEditedAt;

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
      title: `Відправлено на «${destLabel}»`,
      userName: sentDone ? author : null,
      state: sentDone ? 'done' : 'pending',
    },
    {
      key: 'received',
      occurredAt: receivedDone
        ? formatChronologyDateTime(record.lastSentToDilovodAt || record.sentToDilovodAt)
        : 'ще не отримано',
      title: 'Отримано',
      userName: receivedDone ? author : null,
      state: receivedDone ? 'done' : 'pending',
    },
  ];
}

export function toDocumentViewModel(
  record: MovementMobApiRecord,
  metaBySku: Record<string, MovementMobProductMeta> = {},
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
    chronology: buildChronology(record),
    createdByName: record.createdByName ?? null,
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
): number {
  return lines.reduce((sum, line) => {
    if (line.sku !== sku) return sum;
    if (exceptKey && line.key === exceptKey) return sum;
    return sum + line.totalPortions;
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
