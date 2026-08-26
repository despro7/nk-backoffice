/**
 * Навчання ключових слів виду розрахунків за призначенням платежу.
 * Унікальне слово з поточного призначення (відсутнє в інших рядках)
 * додається до словника відповідного виду.
 */

const STOP_WORDS = new Set([
  'оплата', 'платіж', 'платежу', 'платежів', 'сплата',
  'за', 'від', 'для', 'без', 'під', 'при', 'про',
  'згід', 'згідно', 'накл', 'накладна', 'накладної', 'накладною',
  'рах', 'рахунок', 'рахунку', 'рахунком',
  'договір', 'договору', 'дог',
  'грн', 'uah', 'пдв', 'безпдв',
  'комісія', 'комісії',
  'номер', 'дата', 'рок', 'року',
  'та', 'на', 'до', 'по', 'або',
  'тов', 'фоп', 'тзов',
]);

export function tokenizePurpose(purpose: string): string[] {
  if (!purpose) return [];
  return purpose
    .toLowerCase()
    .replace(/[№#]/g, ' ')
    .replace(/\d+[.,]?\d*/g, ' ')
    .replace(/[^\p{L}\s-]/gu, ' ')
    .split(/[\s-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

export function learnUniqueKeywords(purpose: string, otherPurposes: string[]): string[] {
  const tokens = [...new Set(tokenizePurpose(purpose))];
  if (tokens.length === 0) return [];

  const otherTokenSet = new Set<string>();
  for (const other of otherPurposes) {
    for (const token of tokenizePurpose(other)) {
      otherTokenSet.add(token);
    }
  }

  return tokens.filter((token) => !otherTokenSet.has(token));
}

export function addKeywordsToDict(
  dict: Record<string, string[]>,
  kindId: string,
  keywords: string[],
): Record<string, string[]> {
  if (!kindId || keywords.length === 0) return dict;
  const existing = dict[kindId] ?? [];
  const next = [...existing];
  for (const raw of keywords) {
    const keyword = raw.toLowerCase().trim();
    if (!keyword) continue;
    if (!next.some((x) => x.toLowerCase() === keyword)) {
      next.push(keyword);
    }
  }
  return { ...dict, [kindId]: next };
}

export function removeKeywordFromDict(
  dict: Record<string, string[]>,
  kindId: string,
  keyword: string,
): Record<string, string[]> {
  const existing = dict[kindId] ?? [];
  const next = existing.filter((x) => x.toLowerCase() !== keyword.toLowerCase());
  const copy = { ...dict };
  if (next.length === 0) delete copy[kindId];
  else copy[kindId] = next;
  return copy;
}

function purposeMatchesKeyword(purpose: string, keyword: string): boolean {
  const k = keyword.toLowerCase().trim();
  if (!k) return false;
  const lower = purpose.toLowerCase();
  if (k.includes(' ')) return lower.includes(k);
  return tokenizePurpose(purpose).includes(k) || lower.includes(k);
}

export function matchSettlementsKind(
  purpose: string,
  dict: Record<string, string[]>,
): string | null {
  let bestId: string | null = null;
  let bestScore = 0;
  let tied = false;

  for (const [kindId, keywords] of Object.entries(dict)) {
    if (!kindId || !Array.isArray(keywords) || keywords.length === 0) continue;
    let score = 0;
    for (const keyword of keywords) {
      if (purposeMatchesKeyword(purpose, keyword)) score += 1;
    }
    if (score === 0) continue;
    if (score > bestScore) {
      bestScore = score;
      bestId = kindId;
      tied = false;
    } else if (score === bestScore) {
      tied = true;
    }
  }

  return tied ? null : bestId;
}

export function applySettlementsKindKeywords<T extends { purpose: string; direction: 'expense' | 'income'; settlementsKind: string }>(
  rows: T[],
  dict: Record<string, string[]>,
  defaultKind: (direction: T['direction']) => string,
  options?: { onlyDefault?: boolean },
): T[] {
  if (!dict || Object.keys(dict).length === 0) return rows;
  return rows.map((row) => {
    if (options?.onlyDefault) {
      const fallback = defaultKind(row.direction);
      if (row.settlementsKind && row.settlementsKind !== fallback) return row;
    }
    const matched = matchSettlementsKind(row.purpose, dict);
    if (!matched || matched === row.settlementsKind) return row;
    return { ...row, settlementsKind: matched };
  });
}
