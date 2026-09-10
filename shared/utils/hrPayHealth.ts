import { HR_PAY_GROUP_LABELS, type HrPayGroup } from '../types/hr.js';

export interface HrPayHealthTerm {
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface HrPayHealthEmployment {
  payGroup: string;
  validFrom: string;
  validTo: string | null;
  legalEntityName?: string;
  payTerms: HrPayHealthTerm[];
}

const OPEN_END = '9999-12-31';

export function hrTodayYmd(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function hrDayBeforeYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function hrPeriodActive(from: string, to: string | null, today: string): boolean {
  return from <= today && (!to || to >= today);
}

export function hrPeriodOverlaps(
  aFrom: string,
  aTo: string | null,
  bFrom: string,
  bTo: string | null,
): boolean {
  return aFrom <= (bTo ?? OPEN_END) && bFrom <= (aTo ?? OPEN_END);
}

function payGroupLabel(group: string): string {
  return HR_PAY_GROUP_LABELS[group as HrPayGroup] ?? group;
}

function employmentLabel(employment: HrPayHealthEmployment): string {
  const employer = employment.legalEntityName?.trim();
  const group = payGroupLabel(employment.payGroup);
  return employer ? `${employer} · ${group}` : group;
}

/** Чинні ставки, що перетинаються з новим періодом (для confirm «закрити попередню»). */
export function overlappingPayTerms<T extends HrPayHealthTerm>(
  terms: T[],
  effectiveFrom: string,
  effectiveTo: string | null,
): T[] {
  return terms.filter((term) =>
    hrPeriodOverlaps(term.effectiveFrom, term.effectiveTo, effectiveFrom, effectiveTo),
  );
}

export function collectHrPayWarnings(
  employments: HrPayHealthEmployment[],
  today = hrTodayYmd(),
  employeeStatus: 'active' | 'inactive' = 'active',
): string[] {
  const warnings: string[] = [];
  const active = employments.filter((item) => hrPeriodActive(item.validFrom, item.validTo, today));

  if (active.length === 0) {
    if (employeeStatus === 'inactive') return [];
    warnings.push('Немає діючої зайнятості зі ставкою — розрахунок буде 0');
    return warnings;
  }

  const byGroup = new Map<string, HrPayHealthEmployment[]>();
  for (const employment of active) {
    const list = byGroup.get(employment.payGroup) ?? [];
    list.push(employment);
    byGroup.set(employment.payGroup, list);

    const currentRates = employment.payTerms.filter((term) =>
      hrPeriodActive(term.effectiveFrom, term.effectiveTo, today),
    );
    if (currentRates.length === 0) {
      warnings.push(`Ставка не задана (${employmentLabel(employment)}) — розрахунок буде 0`);
    } else if (currentRates.length > 1) {
      warnings.push(`Кілька чинних ставок одночасно (${employmentLabel(employment)})`);
    }
  }

  for (const [group, list] of byGroup) {
    if (list.length > 1) {
      warnings.push(`Кілька діючих зайнятостей в групі «${payGroupLabel(group)}»`);
    }
  }

  return warnings;
}
