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
  // Вступні слова: «мене цікавить щось без мʼяса» і «мене цікавлять білкові страви» — різні теми.
  'мене', 'щось', 'цікавить', 'цікавлять', 'цікавило', 'хотів', 'хотіла', 'хотілося', 'хотілось',
  // Російські службові слова й ввічливість.
  'здравствуйте', 'добрый', 'доброе', 'вечер', 'утро', 'пожалуйста', 'подскажите', 'скажите', 'можно', 'мне',
  'меня', 'хочу', 'хотел', 'хотела', 'где', 'когда', 'какой', 'какая', 'какие', 'какое', 'или', 'нет', 'спасибо',
  'сколько', 'будет', 'было', 'если', 'тоже', 'еще', 'ещё', 'уже', 'вас', 'ваш', 'ваши',
]);

/**
 * Слова, що є майже в кожному питанні магазину («замовлення», «заказ»): у пошуку статті збіг лише по них
 * не означає спільної теми. Інакше «де моє замовлення» знаходило статтю про оплату («чи можна замовити
 * наложкою»). Для групування питань вони лишаються: «Де моє замовлення?» — окрема тема.
 */
const GENERIC_STEMS = new Set(['~замовлення', 'зроби', 'сдела', 'товар', 'магаз', 'сайт']);

/**
 * Синоніми предметної області: різні слова однієї теми дають одну «основу»,
 * щоб «вартість доставки» знаходила статтю «скільки коштує доставка».
 */
const SYNONYM_PREFIXES: Array<{ canonical: string; prefixes: string[] }> = [
  { canonical: '~замовлення', prefixes: ['замов', 'заказ'] },
  { canonical: '~ціна', prefixes: ['варті', 'цін', 'кошт', 'прайс', 'вартує', 'цен', 'стоим', 'стоит'] },
  { canonical: '~доставка', prefixes: ['достав', 'привез', 'привоз'] },
  { canonical: '~відправка', prefixes: ['відправ', 'надсил', 'отправ', 'отсыл'] },
  { canonical: '~оплата', prefixes: ['оплат', 'оплач', 'платіж', 'платит', 'накладен', 'наложк', 'післяплат', 'наложен'] },
  { canonical: '~скасування', prefixes: ['скасув', 'відмін', 'відмов', 'отмен', 'отказ'] },
  { canonical: '~статус', prefixes: ['стаді', 'статус', 'відстеж', 'етап', 'стади', 'отслеж'] },
  { canonical: '~знижка', prefixes: ['знижк', 'скидк', 'знижок', 'скидок', 'промокод', 'акці', 'акци'] },
  { canonical: '~військові', prefixes: ['військ', 'воєн', 'воен', 'зсу', 'всу', 'атошн', 'ветеран'] },
  { canonical: '~повернення', prefixes: ['поверн', 'возврат', 'вернут'] },
  { canonical: '~страва', prefixes: ['страв', 'блюд', 'їжа', 'їжу', 'еда', 'еду'] },
  { canonical: '~мʼясо', prefixes: ['мяс', 'мясн'] },
  { canonical: '~курка', prefixes: ['курк', 'куря', 'курин', 'куриц', 'курочк'] },
  { canonical: '~склад', prefixes: ['склад', 'состав', 'інгредієнт', 'ингредиент'] },
  { canonical: '~зберігання', prefixes: ['зберіг', 'зберег', 'хранен', 'хранит'] },
];

function canonicalStem(word: string): string {
  for (const group of SYNONYM_PREFIXES) {
    if (group.prefixes.some((prefix) => word.startsWith(prefix))) return group.canonical;
  }
  return word.length > STEM_LENGTH ? word.slice(0, STEM_LENGTH) : word;
}

/**
 * Основи значущих слів. Українські й російські форми однієї теми зводяться до спільної канонічної основи
 * (`SYNONYM_PREFIXES`), тож «скидка военным» і «знижка військовим» — одне питання.
 */
export function knowledgeStems(text: string): Set<string> {
  const stems = new Set<string>();
  for (const raw of text.toLowerCase().replace(/ё/g, 'е').split(/[^\p{L}\p{N}ʼ'’]+/u)) {
    const word = raw.replace(/[ʼ'’]/g, '');
    if (word.length < 3 || STOP_WORDS.has(word)) continue;
    stems.add(canonicalStem(word));
  }
  return stems;
}

/** Основи для пошуку статті: без загальних слів магазину. */
export function knowledgeQueryStems(text: string): Set<string> {
  const stems = knowledgeStems(text);
  for (const stem of stems) {
    if (GENERIC_STEMS.has(stem)) stems.delete(stem);
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
  const queryStems = knowledgeQueryStems(query);
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
