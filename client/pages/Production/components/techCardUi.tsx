import { SpecChip, type SpecChipIcon } from '@/components/SpecChip';
import type { TechCardStatus } from '@shared/types/production';
import { getSpecColorByHue } from '@shared/utils/specColorPalette';

export const TECH_CARD_STATUS_META: Record<TechCardStatus, { label: string; hue: string; icon: SpecChipIcon }> = {
  none: { label: 'Немає', hue: 'slate', icon: 'default' },
  editing: { label: 'Чернетка', hue: 'blue', icon: 'info' },
  pending: { label: 'На затвердженні', hue: 'amber', icon: 'warning' },
  rejected: { label: 'Відхилено', hue: 'rose', icon: 'error' },
  approved: { label: 'Затверджена', hue: 'emerald', icon: 'success' },
};

export function TechCardStatusChip({ status }: { status: TechCardStatus }) {
  const meta = TECH_CARD_STATUS_META[status];
  return (
    <SpecChip tokens={getSpecColorByHue(meta.hue, 'light', 'soft')} icon={meta.icon} rounded="sm">
      {meta.label}
    </SpecChip>
  );
}

/** Чіп чернетки специфікації (у парі з техкартою). */
export function SpecDraftChip({ status }: { status: string }) {
  const rejected = status === 'rejected';
  return (
    <SpecChip
      tokens={getSpecColorByHue(rejected ? 'rose' : 'amber', 'light', 'soft')}
      icon={rejected ? 'error' : 'warning'}
      rounded="sm"
    >
      {rejected ? 'Специфікацію відхилено' : 'Специфікація на затвердженні'}
    </SpecChip>
  );
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '–';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '–';
  return date.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
