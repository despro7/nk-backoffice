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

/** «білкові», «протеїн» — сортування за білком; «легкі», «дієтичні», «низькокалорійні» — за калорійністю. */
const HIGH_PROTEIN_PATTERN = /(білк|белк|протеїн|протеин)\p{L}*/gu;
const LOW_CALORIE_PATTERN = /(низькокалор|малокалор|низкокалор|калорійн|калорийн|дієт|диет|легк|худн|схуд)\p{L}*/gu;

export type CatalogNutritionSort = 'protein_desc' | 'kcal_asc' | null;

/** КБЖВ на 100 г (числа); null — немає даних. */
export type CatalogNutrition = { kcal: number; protein: number; fat: number; carbs: number; salt?: number };

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
  nutrition?: CatalogNutrition | null;
};

/** null — склад невідомий, судити не можемо. */
export function isMeatFree(ingredients: string[]): boolean | null {
  if (ingredients.length === 0) return null;
  return !ingredients.some((i) => MEAT_PATTERN.test(normalize(i)));
}

export function parseCatalogQuery(query: string): {
  stems: string[];
  meatFreeOnly: boolean;
  nutritionSort: CatalogNutritionSort;
} {
  const q = normalize(query);
  const meatFreeOnly = MEAT_FREE_PATTERN.test(q);
  let cleaned = meatFreeOnly ? q.replace(MEAT_FREE_PATTERN, ' ').replace(/(вегетаріан|веган|пісн)\p{L}*/gu, ' ') : q;
  let nutritionSort: CatalogNutritionSort = null;
  if (new RegExp(HIGH_PROTEIN_PATTERN.source, 'u').test(cleaned)) {
    nutritionSort = 'protein_desc';
    cleaned = cleaned.replace(HIGH_PROTEIN_PATTERN, ' ');
  } else if (new RegExp(LOW_CALORIE_PATTERN.source, 'u').test(cleaned)) {
    nutritionSort = 'kcal_asc';
    cleaned = cleaned.replace(LOW_CALORIE_PATTERN, ' ');
  }
  return { stems: catalogStems(cleaned), meatFreeOnly, nutritionSort };
}

function nutritionValue(doc: CatalogSearchDoc, sort: Exclude<CatalogNutritionSort, null>): number | null {
  if (!doc.nutrition) return null;
  return sort === 'protein_desc' ? doc.nutrition.protein : doc.nutrition.kcal;
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
  const { stems, meatFreeOnly, nutritionSort } = parseCatalogQuery(query);
  const scored = docs
    .map((doc, index) => ({ doc, index, ...scoreCatalogDoc(doc, query, stems) }))
    .filter(({ doc, score }) => score > 0 && (!meatFreeOnly || isMeatFree(doc.ingredients) === true))
    // «білкові» / «легкі»: без КБЖВ страву не порадиш — пропускаємо.
    .filter(({ doc }) => !nutritionSort || nutritionValue(doc, nutritionSort) != null);
  const bestCoverage = Math.max(0, ...scored.map((r) => r.matched));
  return scored
    .filter((r) => r.matched === bestCoverage || r.score >= EXACT_BONUS)
    .sort((a, b) => {
      if (nutritionSort) {
        const diff = nutritionValue(a.doc, nutritionSort)! - nutritionValue(b.doc, nutritionSort)!;
        const ordered = nutritionSort === 'protein_desc' ? -diff : diff;
        if (ordered !== 0) return ordered;
      }
      return b.score - a.score || a.index - b.index;
    })
    .map(({ doc }) => doc);
}

/** `productNutritionJson` (рядки на 100 г) → числа; без калорійності або білка — null. */
export function parseCatalogNutrition(raw: string | null | undefined): CatalogNutrition | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const num = (v: unknown): number | null => {
      const n = Number.parseFloat(String(v ?? '').replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    };
    const kcal = num(value.energy);
    const protein = num(value.proteins);
    const fat = num(value.fats);
    const carbs = num(value.carbs);
    if (kcal == null || protein == null || fat == null || carbs == null) return null;
    const salt = num(value.salt);
    return { kcal, protein, fat, carbs, ...(salt != null ? { salt } : {}) };
  } catch {
    return null;
  }
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
