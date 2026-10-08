/** Базові seed-коди юрособ — не конкретні роботодавці з Excel. */
export const HR_SEED_LEGAL_ENTITY_CODES = new Set(['fop', 'tov', 'unofficial_cash']);

/** Шаблони типів у довіднику — не роботодавець для папки особи / поточної зайнятості. */
export const HR_LEGAL_ENTITY_TYPE_TEMPLATE_CODES = new Set(['fop', 'tov']);

export function isConcreteEmployerLegalEntityCode(code: string): boolean {
  return !HR_LEGAL_ENTITY_TYPE_TEMPLATE_CODES.has(code);
}

export type EmploymentForEmployerPick = {
  validFrom: Date;
  validTo: Date | null;
  legalEntity: { code: string };
};

/** Поточна зайнятість для роботодавця: «Нештатні» (unofficial_cash) враховуються, шаблони fop/tov — ні. */
export function pickCurrentEmploymentForEmployerContext<T extends EmploymentForEmployerPick>(
  employments: T[],
  todayUtc: Date = utcTodayDate(),
): T | null {
  const open = employments.filter((item) => !item.validTo || item.validTo >= todayUtc);
  const pool = open.length > 0 ? open : employments;
  const concrete = pool.filter((item) => isConcreteEmployerLegalEntityCode(item.legalEntity.code));
  return concrete[0] ?? null;
}

/** Поточна зайнятість у конкретного роботодавця (без seed ФОП / ТОВ / Нештатні) для списку співробітників і фільтрів. */
export function pickCurrentSelectableEmployerEmployment<T extends EmploymentForEmployerPick>(
  employments: readonly T[],
  todayUtc: Date = utcTodayDate(),
): T | null {
  const open = employments.filter((item) => !item.validTo || item.validTo >= todayUtc);
  const pool = open.length > 0 ? open : employments;
  const selectable = pool.filter((item) => !HR_SEED_LEGAL_ENTITY_CODES.has(item.legalEntity.code));
  if (selectable.length === 0) return null;
  return selectable.reduce((latest, item) => (item.validFrom > latest.validFrom ? item : latest));
}

function utcTodayDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Роботодавці для вибору в UI (без seed-типів ФОП / ТОВ / Нештатні). */
export function filterSelectableLegalEntities<T extends { code: string }>(entities: readonly T[]): T[] {
  return entities.filter((entity) => !HR_SEED_LEGAL_ENTITY_CODES.has(entity.code));
}

export type EmploymentDedupeRow = {
  id: number;
  payGroupId: number;
  employee: { id: number };
  legalEntity: { code: string; name: string };
};

export interface EmploymentDedupeResult<T extends EmploymentDedupeRow> {
  employments: T[];
  /** id дубліката → id канонічної зайнятості */
  idRemap: Map<number, number>;
}

function employmentDedupeKey(row: EmploymentDedupeRow): string {
  return `${row.employee.id}::${row.payGroupId}`;
}

function pickCanonicalEmployment<T extends EmploymentDedupeRow>(group: T[]): T {
  return [...group].sort((a, b) => {
    const aSeed = HR_SEED_LEGAL_ENTITY_CODES.has(a.legalEntity.code) ? 1 : 0;
    const bSeed = HR_SEED_LEGAL_ENTITY_CODES.has(b.legalEntity.code) ? 1 : 0;
    if (aSeed !== bSeed) return aSeed - bSeed;
    return a.id - b.id;
  })[0];
}

/** Одна зайнятість на співробітника × групу оплати — пріоритет конкретному роботодавцю. */
export function dedupeEmploymentsByEmployeePayGroup<T extends EmploymentDedupeRow>(
  employments: T[],
): EmploymentDedupeResult<T> {
  const byKey = new Map<string, T[]>();
  for (const row of employments) {
    const key = employmentDedupeKey(row);
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }

  const result: T[] = [];
  const idRemap = new Map<number, number>();

  for (const group of byKey.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    const canonical = pickCanonicalEmployment(group);
    result.push(canonical);
    for (const row of group) {
      if (row.id !== canonical.id) idRemap.set(row.id, canonical.id);
    }
  }

  return { employments: result, idRemap };
}

export function remapEmploymentId(idRemap: Map<number, number>, employmentId: number): number {
  return idRemap.get(employmentId) ?? employmentId;
}

/** Усі id зайнятостей однієї групи (співробітник × група оплати). */
export function employmentIdsInSameGroup<T extends EmploymentDedupeRow>(
  employments: T[],
  employmentId: number,
): number[] {
  const row = employments.find((item) => item.id === employmentId);
  if (!row) return [employmentId];
  const key = employmentDedupeKey(row);
  const ids = employments
    .filter((item) => employmentDedupeKey(item) === key)
    .map((item) => item.id);
  return ids.length > 0 ? ids : [employmentId];
}

/** Канонічний id зайнятості в групі (пріоритет конкретному роботодавцю). */
export function resolveCanonicalEmploymentId<T extends EmploymentDedupeRow>(
  employments: T[],
  employmentId: number,
): number {
  const groupIds = new Set(employmentIdsInSameGroup(employments, employmentId));
  const group = employments.filter((item) => groupIds.has(item.id));
  if (group.length === 0) return employmentId;
  return pickCanonicalEmployment(group).id;
}
