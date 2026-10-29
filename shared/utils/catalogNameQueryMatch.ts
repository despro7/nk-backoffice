/** Пошук у каталозі: цілий рядок як підрядок, інакше всі слова запиту (AND) у полях. */
export function textMatchesCatalogQuery(
  query: string,
  ...fields: (string | null | undefined)[]
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystacks = fields
    .filter((f): f is string => typeof f === 'string' && f.length > 0)
    .map((f) => f.toLowerCase());
  if (haystacks.length === 0) return false;

  const someIncludes = (needle: string) => haystacks.some((h) => h.includes(needle));

  if (someIncludes(q)) return true;

  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return false;

  return tokens.every(someIncludes);
}
