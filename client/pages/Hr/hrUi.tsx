import { Chip } from '@heroui/react';
import type { ReactNode } from 'react';
import {
  HR_PAY_GROUPS,
  HR_TIMESHEET_KIND_CODES,
  type HrPayGroup,
  type HrTimesheetKind,
  type HrTimesheetKindCode,
} from '@shared/types/hr';
import {
  getSpecColorByHue,
  specColorToClassNames,
  type SpecColorIntensity,
  type SpecColorTokens,
} from '@shared/utils/specColorPalette';
import { DynamicIcon } from 'lucide-react/dynamic';

/** Закріплені hue як у довіднику «Облік (тип номенклатури)». */
export const HR_PAY_GROUP_HUES: Record<HrPayGroup, string> = {
  official_salary: 'indigo',
  hourly: 'lime',
  unofficial_cash: 'orange',
};

export const HR_EMPLOYEE_STATUS_HUES = {
  active: 'emerald',
  inactive: 'rose',
} as const;

export const HR_LEGAL_ENTITY_HUES: Record<string, string> = {
  fop: 'blue',
  tov: 'violet',
  unofficial_cash: 'amber',
};

export const HR_TIMESHEET_KIND_DEFAULT_HUES: Record<HrTimesheetKindCode, string> = {
  В: 'slate',
  О: 'emerald',
  ТН: 'amber',
  Н: 'indigo',
  Пр: 'rose',
  Св: 'violet',
};

export const HR_BTN_PRIMARY =
  'bg-blue-500 text-white font-medium';
export const HR_BTN_SUCCESS =
  'bg-lime-500 text-white font-medium';
export const HR_BTN_WARNING =
  'bg-amber-500 text-white font-medium';
export const HR_BTN_NEUTRAL =
  'bg-slate-100 text-slate-800 hover:bg-slate-200 font-medium border border-slate-200';

/** HeroUI Table — лише горизонтальні лінії між рядками (header без змін). */
export const HR_TABLE_CLASS_NAMES = {
  wrapper: 'p-0 shadow-none',
  td: 'border-b border-border-subtle',
  tr: 'last:[&>td]:border-b-0',
};

export function hrPayGroupTokens(group: HrPayGroup, intensity: SpecColorIntensity = 'soft'): SpecColorTokens {
  return getSpecColorByHue(HR_PAY_GROUP_HUES[group], 'light', intensity);
}

export function hrStatusTokens(status: 'active' | 'inactive'): SpecColorTokens {
  return getSpecColorByHue(HR_EMPLOYEE_STATUS_HUES[status], 'light', 'soft');
}

export function hrLegalEntityTokens(codeOrKind: string | null | undefined): SpecColorTokens {
  const key = (codeOrKind ?? '').toLowerCase();
  const hue =
    HR_LEGAL_ENTITY_HUES[key] ||
    HR_LEGAL_ENTITY_HUES[key.split('_')[0]] ||
    'slate';
  return getSpecColorByHue(hue, 'light', 'soft');
}

export function hrLegalEntityKindTokens(kind: string | null | undefined): SpecColorTokens {
  return hrLegalEntityTokens(kind);
}

export function hrEmployerTokensFromName(name: string | null | undefined): SpecColorTokens {
  const n = (name ?? '').toLowerCase();
  if (n.includes('тов')) return hrLegalEntityTokens('tov');
  if (n.includes('нештат') || n.includes('готів')) return hrLegalEntityTokens('unofficial_cash');
  if (n.includes('фоп')) return hrLegalEntityTokens('fop');
  return getSpecColorByHue('slate', 'light', 'soft');
}

export function hrKindTokens(hue: string): SpecColorTokens {
  return getSpecColorByHue(hue, 'light', 'soft');
}

export function hrKindClassName(hue: string): string {
  return specColorToClassNames(hrKindTokens(hue), { border: true });
}

export function payGroupTokensMap(): Record<HrPayGroup, SpecColorTokens> {
  return Object.fromEntries(HR_PAY_GROUPS.map((group) => [group, hrPayGroupTokens(group)])) as Record<
    HrPayGroup,
    SpecColorTokens
  >;
}

export function defaultKindHueMap(): Record<HrTimesheetKindCode, string> {
  return { ...HR_TIMESHEET_KIND_DEFAULT_HUES };
}

export function kindHueOrDefault(
  code: HrTimesheetKindCode,
  overrides: Partial<Record<HrTimesheetKindCode, string>>,
): string {
  return overrides[code] || HR_TIMESHEET_KIND_DEFAULT_HUES[code];
}

export function timesheetKindCellClass(
  kind: HrTimesheetKind | 'prefill' | null,
  hues: Partial<Record<HrTimesheetKindCode, string>>,
): string {
  if (!kind || kind === 'prefill') {
    return 'text-slate-300 border-transparent';
  }
  if (kind === 'work') {
    return 'text-slate-800';
  }
  return hrKindClassName(kindHueOrDefault(kind, hues));
}

const HR_SPEC_CHIP_LUCIDE_ICONS = {
  success: 'circle-check',
  warning: 'triangle-alert',
  error: 'circle-x',
  info: 'info',
  default: 'circle',
} as const;

type HrSpecChipIcon = keyof typeof HR_SPEC_CHIP_LUCIDE_ICONS;

interface HrSpecChipProps {
  tokens: SpecColorTokens;
  icon?: HrSpecChipIcon;
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md';
  selected?: boolean;
  onClick?: () => void;
}

export function HrSpecChip({
  tokens,
  icon,
  children,
  className,
  size = 'sm',
  selected = false,
  onClick,
}: HrSpecChipProps) {
  const lucideIcon = icon ? HR_SPEC_CHIP_LUCIDE_ICONS[icon] : undefined;

  return (
    <Chip
      size={size}
      variant="flat"
      className={onClick ? 'cursor-pointer' : undefined}
      onClick={onClick}
      startContent={lucideIcon ? <DynamicIcon name={lucideIcon} size={13} /> : undefined}
      classNames={{
        base: [
          specColorToClassNames(tokens, { border: true, intensity: selected ? 'medium' : tokens.intensity }),
          selected ? 'ring-2 ring-slate-800 ring-offset-1' : '',
          className ?? 'px-1.5',
        ].join(' '),
        content: 'font-medium',
      }}
    >
      {children}
    </Chip>
  );
}
