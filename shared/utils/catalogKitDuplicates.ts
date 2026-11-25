export interface KitComponentIdentity {
  id?: string | null;
  sku?: string | null;
  name?: string | null;
}

export interface KitDuplicateComponent {
  id: string | null;
  sku: string | null;
  name: string;
  count: number;
}

function identityKey(row: KitComponentIdentity): string | null {
  const id = String(row.id ?? '').trim();
  if (id) return `id:${id}`;
  const sku = String(row.sku ?? '').trim();
  return sku ? `sku:${sku}` : null;
}

/** Компоненти, які у складі комплекту вказані більше одного разу (за id, інакше за sku). */
export function findKitDuplicateComponents(rows: readonly KitComponentIdentity[]): KitDuplicateComponent[] {
  const byKey = new Map<string, KitDuplicateComponent>();
  for (const row of rows) {
    const key = identityKey(row);
    if (!key) continue;
    const found = byKey.get(key);
    if (found) {
      found.count += 1;
      if (!found.name && row.name) found.name = String(row.name).trim();
      continue;
    }
    byKey.set(key, {
      id: String(row.id ?? '').trim() || null,
      sku: String(row.sku ?? '').trim() || null,
      name: String(row.name ?? '').trim(),
      count: 1,
    });
  }
  return [...byKey.values()].filter((d) => d.count > 1);
}

function formatOne(d: KitDuplicateComponent): string {
  const label = d.name || d.sku || '–';
  return d.sku && d.name ? `${label} (${d.sku})` : label;
}

/** «Каша гречана з печерицями (03007)», кілька через кому. */
export function formatKitDuplicateList(dups: readonly KitDuplicateComponent[]): string {
  return dups.map(formatOne).join(', ');
}

export function kitDuplicatesWarning(dups: readonly KitDuplicateComponent[]): string {
  return `У складі є дублі: ${formatKitDuplicateList(dups)}. Обʼєднайте рядки`;
}

export const KIT_DUPLICATE_ADD_REFUSED = 'Товар уже є в складі комплекту, змініть кількість';

export function kitDuplicatesServerError(dups: readonly KitDuplicateComponent[]): string {
  return `Склад комплекту містить дублі: ${formatKitDuplicateList(dups)}. Обʼєднайте рядки та змініть кількість`;
}

/** Мітка для іконки уваги в каталозі: «Склад комплекту: дублі (03007)». */
export function kitDuplicatesAttentionLabel(skus: readonly string[]): string {
  return `Склад комплекту: дублі (${skus.join(', ')})`;
}

export function kitReleaseDuplicateMessage(setName: string, dup: KitDuplicateComponent): string {
  const sku = dup.sku ? ` (${dup.sku})` : '';
  return `Комплектування неможливе: у складі набору «${setName}» товар «${dup.name || dup.sku || '–'}»${sku} вказано двічі. Обʼєднайте рядки в картці товару.`;
}
