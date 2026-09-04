import type { HrLegalEntityKind } from '../types/hr.js';

/** Детермінований code роботодавця з назви (для імпорту та зіставлення). */
export function slugifyLegalEntityCodeFromName(name: string, kind: HrLegalEntityKind | string): string {
  const normalized = name
    .trim()
    .toLocaleLowerCase('uk')
    .replace(/[^a-z0-9а-яіїєґ]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  return `${kind}_${normalized || 'entity'}`.slice(0, 32);
}

/** Нормалізована назва роботодавця з комірки Excel. */
export function normalizeHrImportEmployerName(raw: string, fallback: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  return trimmed || fallback;
}
