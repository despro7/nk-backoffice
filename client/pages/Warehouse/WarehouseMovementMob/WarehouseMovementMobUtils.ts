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

export function formatPortionsLabel(count: number): string {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return `${count} порцій`;
  if (n1 === 1) return `${count} порція`;
  if (n1 >= 2 && n1 <= 4) return `${count} порції`;
  return `${count} порцій`;
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
      batchNumber: item.batchNumber || item.batchId || '—',
      boxQuantity: boxes,
      portionQuantity: loose,
      totalPortions: total,
      weight: meta.weight,
      portionsPerBox,
    };
  });
}

export function buildChronology(record: MovementMobApiRecord): MovementMobChronologyEvent[] {
  const events: MovementMobChronologyEvent[] = [];
  const author = record.createdByName ?? null;

  events.push({
    key: 'prepared',
    occurredAt: formatChronologyDateTime(record.draftCreatedAt),
    title: 'Формування списку на переміщення',
    userName: author,
    state: 'done',
  });

  if (record.status === 'active' || record.status === 'finalized') {
    const sentAt = record.sentToDilovodAt || record.lastSentToDilovodAt || record.draftLastEditedAt;
    const destLabel = resolveStorageDisplay(record.destinationWarehouse).shortName;
    events.push({
      key: 'sent',
      occurredAt: formatChronologyDateTime(sentAt),
      title: `Відправлено на «${destLabel}»`,
      userName: author,
      state: 'done',
    });
  }

  if (record.status === 'finalized') {
    events.push({
      key: 'received',
      occurredAt: formatChronologyDateTime(record.lastSentToDilovodAt || record.sentToDilovodAt),
      title: 'Отримано',
      userName: author,
      state: 'done',
    });
  } else if (record.status === 'active') {
    events.push({
      key: 'receive_pending',
      occurredAt: formatChronologyDateTime(record.lastSentToDilovodAt || record.sentToDilovodAt || record.draftLastEditedAt),
      title: 'Очікує на підтвердження...',
      userName: null,
      state: 'pending',
    });
  }

  return events;
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
