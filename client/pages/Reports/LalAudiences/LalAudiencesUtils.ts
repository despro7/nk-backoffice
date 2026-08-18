import { today, getLocalTimeZone } from '@internationalized/date';
import type { DateRange } from '@react-types/datepicker';
import type { IconName } from 'lucide-react/dynamic';
import {
  LAL_EXCLUDED_STATUS,
  LAL_LOYAL_MIN_ORDER_COUNT,
  LAL_LTV_UNBOUNDED,
  LAL_ORDER_COUNT_UNBOUNDED,
  LAL_VIP_LTV_MIN,
  type LalAudienceQuality,
  type LalPeriodKey,
  type LalPresetId,
} from '@shared/types/lalAudiences';
import { formatCalendarDateValue } from '../shared/ReportsSharedUtils';

export interface LalStatusOption {
  key: string;
  label: string;
}

/** Усі статуси statusMapper, крім «Видалений» */
export const LAL_STATUS_OPTIONS: LalStatusOption[] = [
  { key: '1', label: 'Новий' },
  { key: '2', label: 'Підтверджено' },
  { key: '3', label: 'На відправку' },
  { key: '4', label: 'Відправлено' },
  { key: '5', label: 'Продаж' },
  { key: '6', label: 'Відмова' },
  { key: '7', label: 'Повернення' },
  { key: '9', label: 'На утриманні' },
].filter((option) => option.key !== LAL_EXCLUDED_STATUS);

export const LAL_PERIOD_OPTIONS: Array<{ key: LalPeriodKey; label: string }> = [
  { key: '1m', label: '1 місяць' },
  { key: '3m', label: '3 місяці' },
  { key: '6m', label: '6 місяців' },
  { key: 'all', label: 'Весь час' },
  { key: 'custom', label: 'Свій період' },
];

export interface LalPresetMeta {
  id: LalPresetId;
  title: string;
  description: string;
  icon: IconName;
  emoji?: string;
}

export const LAL_PRESET_OPTIONS: LalPresetMeta[] = [
  {
    id: 'loyal',
    title: 'Постійні',
    description: '3+ замовлення за весь час',
    icon: 'heart',
    emoji: '💚',
  },
  {
    id: 'vip',
    title: 'VIP',
    description: `LTV понад ${LAL_VIP_LTV_MIN.toLocaleString('uk-UA')} ₴`,
    icon: 'crown',
    emoji: '💎',
  },
  {
    id: 'new',
    title: 'Нові покупці',
    description: 'Рівно 1 замовлення за 30 днів',
    icon: 'sparkles',
    emoji: '✨',
  },
  {
    id: 'churn',
    title: 'Ризик відтоку',
    description: 'Останнє замовлення старші за 90 днів',
    icon: 'user-x',
    emoji: '🚨',
  },
  {
    id: 'military',
    title: 'Військові',
    description: 'Є замовлення зі знижкою',
    icon: 'shield',
    emoji: '🪖',
  },
  {
    id: 'b2b',
    title: 'B2B / Опт',
    description: 'Високий LTV і великі партії',
    icon: 'building-2',
    emoji: '🏢',
  },
];

export interface LalPresetPatch {
  period?: LalPeriodKey;
  orderCountRange: [number, number];
  ltvRange: [number, number];
}

const FULL_ORDER_RANGE: [number, number] = [0, LAL_ORDER_COUNT_UNBOUNDED];
const FULL_LTV_RANGE: [number, number] = [0, LAL_LTV_UNBOUNDED];

export function getPresetPatch(preset: LalPresetId): LalPresetPatch {
  switch (preset) {
    case 'loyal':
      return {
        orderCountRange: [LAL_LOYAL_MIN_ORDER_COUNT, LAL_ORDER_COUNT_UNBOUNDED],
        ltvRange: FULL_LTV_RANGE,
      };
    case 'vip':
      return {
        orderCountRange: FULL_ORDER_RANGE,
        ltvRange: [LAL_VIP_LTV_MIN, LAL_LTV_UNBOUNDED],
      };
    case 'new':
      return {
        period: '1m',
        orderCountRange: [1, 1],
        ltvRange: FULL_LTV_RANGE,
      };
    case 'churn':
      return {
        period: 'all',
        orderCountRange: FULL_ORDER_RANGE,
        ltvRange: FULL_LTV_RANGE,
      };
    case 'military':
      return {
        orderCountRange: FULL_ORDER_RANGE,
        ltvRange: FULL_LTV_RANGE,
      };
    case 'b2b':
      return {
        orderCountRange: FULL_ORDER_RANGE,
        ltvRange: [LAL_VIP_LTV_MIN, LAL_LTV_UNBOUNDED],
      };
    default:
      return {
        orderCountRange: FULL_ORDER_RANGE,
        ltvRange: FULL_LTV_RANGE,
      };
  }
}

export function getDefaultCustomDateRange(): DateRange {
  const end = today(getLocalTimeZone());
  return {
    start: end.subtract({ days: 29 }),
    end,
  };
}

export function dateRangeToIso(range: DateRange | null): { startDate?: string; endDate?: string } {
  if (!range?.start || !range?.end) {
    return {};
  }

  return {
    startDate: formatCalendarDateValue(range.start),
    endDate: formatCalendarDateValue(range.end),
  };
}

export function formatOrderCountThumb(value: number, isMax: boolean): string {
  if (isMax && value >= LAL_ORDER_COUNT_UNBOUNDED) {
    return '∞'; //`${LAL_ORDER_COUNT_UNBOUNDED}+`;
  }
  return String(value);
}

export function formatLtvThumb(value: number, isMax: boolean): string {
  const formatted = value.toLocaleString('uk-UA');
  if (isMax && value >= LAL_LTV_UNBOUNDED) {
    return '∞'; //`${LAL_LTV_UNBOUNDED}+`;
  }
  return `${formatted}`;
}

export function formatSliderRange(
  value: number | number[],
  formatThumb: (value: number, isMax: boolean) => string,
): string {
  if (!Array.isArray(value) || value.length < 2) {
    return formatThumb(Number(value) || 0, false);
  }
  return `${formatThumb(value[0], false)} – ${formatThumb(value[1], true)}`;
}

export function qualityLabel(quality: LalAudienceQuality): string {
  if (quality === 'high') return 'Висока';
  if (quality === 'medium') return 'Середня';
  return 'Низька';
}

export function qualityColor(quality: LalAudienceQuality): 'success' | 'warning' | 'danger' {
  if (quality === 'high') return 'success';
  if (quality === 'medium') return 'warning';
  return 'danger';
}

export function parseFilenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utfMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1].trim());
    } catch {
      return utfMatch[1].trim();
    }
  }
  const plainMatch = header.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1]?.trim() || fallback;
}
