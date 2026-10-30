/**
 * Пошук у базі знань без зовнішніх сервісів: збіг основ слів (перші 5 літер) запиту
 * з питаннями, назвою й тегами статті. Для десятків статей цього досить; embeddings — за потреби.
 */

const STEM_LENGTH = 5;
/** Мінімальний бал: хоча б одне значуще слово збіглося з питанням, назвою або тегом. */
const MIN_SCORE = 2;
const STRONG_WEIGHT = 2;
const WEAK_WEIGHT = 0.5;

const STOP_WORDS = new Set([
  'або', 'але', 'без', 'будь', 'вам', 'вас', 'ваш', 'ваше', 'вже', 'від', 'все', 'для', 'добрий', 'день',
  'дякую', 'його', 'коли', 'мені', 'мій', 'моє', 'можна', 'над', 'нас', 'нам', 'них', 'під', 'при',
  'про', 'так', 'там', 'тут', 'хочу', 'цей', 'цього', 'що', 'як', 'який', 'яка', 'яке', 'які', 'ласка',
  'привіт', 'вітаю', 'скажіть', 'підкажіть', 'есть', 'это', 'как', 'что', 'скільки',
  'доброго', 'дня', 'вечора', 'ранку', 'дізнатися', 'дізнатись', 'якій', 'яким', 'якому', 'точно', 'памʼятаю', "пам'ятаю", 'памятаю',
]);

/**
 * Синоніми предметної області: різні слова однієї теми дають одну «основу»,
 * щоб «вартість доставки» знаходила статтю «скільки коштує доставка».
 */
const SYNONYM_PREFIXES: Array<{ canonical: string; prefixes: string[] }> = [
  { canonical: '~ціна', prefixes: ['варті', 'цін', 'кошт', 'прайс', 'вартує'] },
  { canonical: '~доставка', prefixes: ['достав', 'привез', 'привоз'] },
  { canonical: '~оплата', prefixes: ['оплат', 'оплач', 'платіж', 'платит', 'накладен'] },
  { canonical: '~скасування', prefixes: ['скасув', 'відмін', 'відмов'] },
  { canonical: '~статус', prefixes: ['стаді', 'статус', 'відстеж', 'етап'] },
];

function canonicalStem(word: string): string {
  for (const group of SYNONYM_PREFIXES) {
    if (group.prefixes.some((prefix) => word.startsWith(prefix))) return group.canonical;
  }
  return word.length > STEM_LENGTH ? word.slice(0, STEM_LENGTH) : word;
}

export function knowledgeStems(text: string): Set<string> {
  const stems = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}ʼ']+/u)) {
    const word = raw.replace(/[ʼ']/g, '');
    if (word.length < 3 || STOP_WORDS.has(word)) continue;
    stems.add(canonicalStem(word));
  }
  return stems;
}

export type KnowledgeSearchDoc = {
  id: number;
  title: string;
  questions: string[];
  tags: string[];
  answer: string;
};

export type KnowledgeSearchIndexEntry<T extends KnowledgeSearchDoc> = {
  doc: T;
  strong: Set<string>;
  weak: Set<string>;
};

export function indexKnowledgeDoc<T extends KnowledgeSearchDoc>(doc: T): KnowledgeSearchIndexEntry<T> {
  return {
    doc,
    strong: knowledgeStems([doc.title, ...doc.questions, ...doc.tags].join(' ')),
    weak: knowledgeStems(doc.answer),
  };
}

export function searchKnowledgeIndex<T extends KnowledgeSearchDoc>(
  index: KnowledgeSearchIndexEntry<T>[],
  query: string,
  limit = 3,
): Array<{ doc: T; score: number }> {
  const queryStems = knowledgeStems(query);
  if (queryStems.size === 0) return [];
  return index
    .map((entry) => {
      let score = 0;
      for (const stem of queryStems) {
        if (entry.strong.has(stem)) score += STRONG_WEIGHT;
        else if (entry.weak.has(stem)) score += WEAK_WEIGHT;
      }
      return { doc: entry.doc, score };
    })
    .filter((r) => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.doc.id - b.doc.id)
    .slice(0, limit);
}
