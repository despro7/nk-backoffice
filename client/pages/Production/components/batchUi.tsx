import { SpecChip, type SpecChipIcon } from '@/components/SpecChip';
import {
  PRODUCTION_BATCH_STATUS_LABELS,
  type ProductionBatchStatus,
} from '@shared/types/production';
import { getSpecColorByHue } from '@shared/utils/specColorPalette';

const STATUS_META: Record<ProductionBatchStatus, { hue: string; icon: SpecChipIcon }> = {
  draft: { hue: 'slate', icon: 'default' },
  issued: { hue: 'cyan', icon: 'info' },
  accepted: { hue: 'indigo', icon: 'info' },
  cooking: { hue: 'orange', icon: 'warning' },
  output: { hue: 'violet', icon: 'info' },
  finished: { hue: 'teal', icon: 'success' },
  closed: { hue: 'emerald', icon: 'success' },
  cancelled: { hue: 'rose', icon: 'error' },
};

export function BatchStatusChip({ status }: { status: ProductionBatchStatus }) {
  const meta = STATUS_META[status];
  return (
    <SpecChip tokens={getSpecColorByHue(meta.hue, 'light', 'soft')} icon={meta.icon} rounded="sm">
      {PRODUCTION_BATCH_STATUS_LABELS[status]}
    </SpecChip>
  );
}

/** Кроки варки по порядку (без «Скасовано»). */
export const BATCH_STEPS: Array<{ status: Exclude<ProductionBatchStatus, 'cancelled'>; hint: string }> = [
  { status: 'draft', hint: 'План порцій і день варки' },
  { status: 'issued', hint: 'Комірник видає сировину і пакування' },
  { status: 'accepted', hint: 'Підпис за прийняту сировину' },
  { status: 'cooking', hint: 'Відмітки етапів' },
  { status: 'output', hint: 'Порції, брак, залишки' },
  { status: 'finished', hint: 'Прийом продукції на склад ГП' },
  { status: 'closed', hint: 'Варку закрито' },
];

/** YYYY-MM-DD → ДД.ММ.РРРР */
export function formatBatchDate(value: string | null | undefined): string {
  if (!value) return '–';
  const [y, m, d] = value.split('-');
  return y && m && d ? `${d}.${m}.${y}` : value;
}

/** Сьогодні у форматі YYYY-MM-DD (локальна дата). */
export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function formatQty(value: number | null | undefined, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return '–';
  return value.toLocaleString('uk-UA', { maximumFractionDigits: digits });
}
