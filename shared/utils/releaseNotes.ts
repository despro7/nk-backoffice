import { hasPermission } from '../constants/permissions';
import type { Release } from '../types/releaseNotes';

/** Порівняння версій X.Y.Z: >0, якщо `a` новіша за `b`. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Лишає тільки доступні користувачу пункти; релізи без пунктів прибирає. */
export function filterReleasesByPermissions(
  releases: Release[],
  permissions: Iterable<string> | undefined | null,
): Release[] {
  const set = new Set(permissions ?? []);
  return releases
    .map((release) => ({
      ...release,
      items: release.items.filter((item) => hasPermission(set, item.permission)),
    }))
    .filter((release) => release.items.length > 0);
}

/** «26 листопада 2026» */
export function formatReleaseDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, day))
    .replace(/\s*р\.$/, '');
}
