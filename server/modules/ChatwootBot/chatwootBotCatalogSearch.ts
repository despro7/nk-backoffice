/**
 * Пошук страв для LLM tool: основи слів (перші 4 літери) запиту в назві, категорії, складі й описі.
 * «друга страва з куркою» знаходить «Другі страви» з куркою у складі, а не лише збіг назви.
 */

const STEM_LENGTH = 4;
const NAME_WEIGHT = 3;
const INGREDIENT_WEIGHT = 2;
const DESCRIPTION_WEIGHT = 1;
const EXACT_BONUS = 10;

const STOP_WORDS = new Set([
  'або', 'але', 'без', 'для', 'щось', 'які', 'яка', 'яке', 'який', 'хочу', 'можна', 'маєте', 'є',
  'страва', 'страви', 'страву', 'страв', 'продукт', 'продукти', 'товар', 'товари', 'щоб', 'дуже',
  'порадьте', 'підкажіть', 'покажіть', 'цікавить', 'мене', 'вас', 'ваші', 'ваш', 'що', 'має',
]);

/** Мʼясо, птиця, риба у складі — страва не підходить для запитів «без мʼяса». */
const MEAT_PATTERN =
  /(^|[^\p{L}])(курк|кур[яи]|свин|ялов|мяс|фарш|індич|риб|фрикад|бекон|ковбас|сосис|печін|телят|качк|баранин|тунц|лосос|оселед)/u;

/** «без мʼяса», «вегетаріанське», «пісне» — фільтр замість пошуку слів. */
const MEAT_FREE_PATTERN = /(вегет|веган|пісн|без\s+мяс|без\s+мʼяс|не\s+їм\s+мяс)/u;

/** Різні форми одного інгредієнта → одна основа: «куркою» і «курятиною» — одне. */
const SYNONYM_PREFIXES: Array<{ canonical: string; prefixes: string[] }> = [
  { canonical: '~кур', prefixes: ['курк', 'куря', 'кура', 'кури', 'курч', 'філе'] },
  { canonical: '~гриб', prefixes: ['гриб', 'печер'] },
  { canonical: '~ялов', prefixes: ['ялов', 'телят'] },
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[ʼ'’`]/g, '');
}

export function catalogStems(text: string): string[] {
  const stems = new Set<string>();
  for (const word of normalize(text).split(/[^\p{L}\p{N}]+/u)) {
    if (word.length < 3 || STOP_WORDS.has(word)) continue;
    const synonym = SYNONYM_PREFIXES.find((g) => g.prefixes.some((prefix) => word.startsWith(prefix)));
    stems.add(synonym ? synonym.canonical : word.length > STEM_LENGTH ? word.slice(0, STEM_LENGTH) : word);
  }
  return [...stems];
}

export type CatalogSearchDoc = {
  name: string;
  sku: string;
  category: string | null;
  ingredients: string[];
  description: string;
};

/** null — склад невідомий, судити не можемо. */
export function isMeatFree(ingredients: string[]): boolean | null {
  if (ingredients.length === 0) return null;
  return !ingredients.some((i) => MEAT_PATTERN.test(normalize(i)));
}

export function parseCatalogQuery(query: string): { stems: string[]; meatFreeOnly: boolean } {
  const q = normalize(query);
  const meatFreeOnly = MEAT_FREE_PATTERN.test(q);
  const cleaned = meatFreeOnly ? q.replace(MEAT_FREE_PATTERN, ' ').replace(/(вегетаріан|веган|пісн)\p{L}*/gu, ' ') : q;
  return { stems: catalogStems(cleaned), meatFreeOnly };
}

function stemsOf(text: string): Set<string> {
  return new Set(catalogStems(text));
}

/** Бал документа і скільки слів запиту збіглося; бал 0 — не підходить. Порожній запит — усі з балом 1. */
export function scoreCatalogDoc(
  doc: CatalogSearchDoc,
  query: string,
  stems: string[],
): { score: number; matched: number } {
  if (stems.length === 0) return { score: 1, matched: 0 };
  const q = normalize(query.trim());
  let score = 0;
  let matched = 0;
  if (q && (normalize(doc.name).includes(q) || doc.sku.toLowerCase() === q)) score += EXACT_BONUS;

  const nameStems = stemsOf(`${doc.name} ${doc.category ?? ''}`);
  const ingredientStems = stemsOf(doc.ingredients.join(' '));
  const descriptionStems = stemsOf(doc.description);
  for (const stem of stems) {
    const weight = nameStems.has(stem)
      ? NAME_WEIGHT
      : ingredientStems.has(stem)
        ? INGREDIENT_WEIGHT
        : descriptionStems.has(stem)
          ? DESCRIPTION_WEIGHT
          : 0;
    score += weight;
    if (weight > 0) matched += 1;
  }
  return { score, matched };
}

/**
 * Документи за спаданням балу (стабільно щодо вхідного порядку).
 * Лише ті, що покривають найбільше слів запиту: «друга страва з куркою» не повертає плов зі свининою.
 */
export function searchCatalogDocs<T extends CatalogSearchDoc>(docs: T[], query: string): T[] {
  const { stems, meatFreeOnly } = parseCatalogQuery(query);
  const scored = docs
    .map((doc, index) => ({ doc, index, ...scoreCatalogDoc(doc, query, stems) }))
    .filter(({ doc, score }) => score > 0 && (!meatFreeOnly || isMeatFree(doc.ingredients) === true));
  const bestCoverage = Math.max(0, ...scored.map((r) => r.matched));
  return scored
    .filter((r) => r.matched === bestCoverage || r.score >= EXACT_BONUS)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ doc }) => doc);
}

/** HTML-опис → короткий текст для моделі. */
export function plainCatalogDescription(html: string | null | undefined, max = 240): string {
  if (!html) return '';
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&#8217;|&rsquo;/g, '’')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, '')}…` : text;
}

export function parseIngredientsJson(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : [];
  } catch {
    return [];
  }
}
