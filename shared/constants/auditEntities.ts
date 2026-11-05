/**
 * Реєстр entityType для загального журналу дій (`audit_log`).
 * Додаючи новий домен — додай сюди ключ; значення ≤ 32 символи.
 */
export const AUDIT_ENTITY = {
  // HR
  HR_PERSON: 'person',
  HR_EMPLOYEE: 'employee',
  HR_EMPLOYMENT: 'employment',
  HR_LEGAL_ENTITY: 'legal_entity',
  HR_PAY_GROUP: 'pay_group',
  HR_PAY_TERMS: 'pay_terms',
  HR_TIMESHEET_ENTRY: 'timesheet_entry',
  // Warehouse
  WAREHOUSE_RELEASE_SET: 'warehouse_release_set',
  WAREHOUSE_SURPLUS: 'warehouse_surplus',
  WAREHOUSE_WRITE_OFF: 'warehouse_write_off',
  // Catalog
  CATALOG_GOOD: 'catalog_good',
} as const;

export type AuditEntityType = (typeof AUDIT_ENTITY)[keyof typeof AUDIT_ENTITY];

/** Джерело зміни: дія людини в UI, pull з Dilovod, фонова система, масова операція. */
export const AUDIT_SOURCES = ['ui', 'dilovod', 'system', 'bulk'] as const;
export type AuditSource = (typeof AUDIT_SOURCES)[number];

export const AUDIT_SOURCE_LABELS: Record<AuditSource, string> = {
  ui: 'Користувач',
  dilovod: 'Dilovod',
  system: 'Система',
  bulk: 'Масова дія',
};
