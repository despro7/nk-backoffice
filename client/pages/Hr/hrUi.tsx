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

/** Закріплені hue як у довіднику «Облік (тип номенклатури)». */
export const HR_PAY_GROUP_HUES: Record<HrPayGroup, string> = {
  official_salary: 'indigo',
  hourly: 'cyan',
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
  'bg-gradient-to-b from-sky-500 to-blue-600/75 text-white hover:bg-blue-600 font-medium';
export const HR_BTN_SUCCESS =
  'bg-gradient-to-b from-lime-500 to-green-600 text-white hover:bg-green-600 font-medium';
export const HR_BTN_WARNING =
  'bg-gradient-to-b from-amber-400 to-orange-600 text-white hover:bg-orange-600 font-medium';
export const HR_BTN_NEUTRAL =
  'bg-slate-100 text-slate-800 hover:bg-slate-200 font-medium border border-slate-200';

export function hrPayGroupTokens(group: HrPayGroup, intensity: SpecColorIntensity = 'soft'): SpecColorTokens {
  return getSpecColorByHue(HR_PAY_GROUP_HUES[group], 'light', intensity);
}

export function hrStatusTokens(status: 'active' | 'inactive'): SpecColorTokens {
  return getSpecColorByHue(HR_EMPLOYEE_STATUS_HUES[status], 'light', 'soft');
}

export function hrLegalEntityTokens(code: string | null | undefined): SpecColorTokens {
  const hue = (code && HR_LEGAL_ENTITY_HUES[code]) || 'slate';
  return getSpecColorByHue(hue, 'light', 'soft');
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
    return 'bg-slate-50 text-slate-300 border-transparent';
  }
  if (kind === 'work') {
    return 'text-slate-800';
  }
  return hrKindClassName(kindHueOrDefault(kind, hues));
}

interface HrSpecChipProps {
  tokens: SpecColorTokens;
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md';
  selected?: boolean;
  onClick?: () => void;
}

export function HrSpecChip({
  tokens,
  children,
  className,
  size = 'sm',
  selected = false,
  onClick,
}: HrSpecChipProps) {
  return (
    <Chip
      size={size}
      variant="flat"
      className={onClick ? 'cursor-pointer' : undefined}
      onClick={onClick}
      classNames={{
        base: [
          specColorToClassNames(tokens, { border: true, intensity: selected ? 'medium' : tokens.intensity }),
          selected ? 'ring-2 ring-slate-800 ring-offset-1' : '',
          className ?? '',
        ].join(' '),
        content: 'font-medium',
      }}
    >
      {children}
    </Chip>
  );
}
