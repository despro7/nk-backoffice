/** Базові seed-коди юрособ — не конкретні роботодавці з Excel. */
export const HR_SEED_LEGAL_ENTITY_CODES = new Set(['fop', 'tov', 'unofficial_cash']);

export type EmploymentDedupeRow = {
  id: number;
  payGroup: string;
  employee: { id: number };
  legalEntity: { code: string; name: string };
};

export interface EmploymentDedupeResult<T extends EmploymentDedupeRow> {
  employments: T[];
  /** id дубліката → id канонічної зайнятості */
  idRemap: Map<number, number>;
}

function employmentDedupeKey(row: EmploymentDedupeRow): string {
  return `${row.employee.id}::${row.payGroup}`;
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
