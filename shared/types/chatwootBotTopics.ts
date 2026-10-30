/** Теми питань клієнтів у статистиці Chatwoot Bot (збережені, з ручним керуванням). */

export type ChatwootBotTopicOrigin = 'auto' | 'manual';
export type ChatwootBotTopicAssignSource = 'auto' | 'manual';

export type ChatwootBotTopicQuestionDto = {
  /** sha256(contentNorm) — ідентифікатор питання для ручних дій. */
  hash: string;
  text: string;
  /** Скільки разів питання поставили за обраний період. */
  count: number;
  source: ChatwootBotTopicAssignSource;
};

export type ChatwootBotTopicRef = {
  id: number;
  title: string;
};

export type ChatwootBotTopicQuestionsAction =
  /** Перенести в тему (ручне призначення). */
  | { action: 'move'; hashes: string[]; topicId: number }
  /** Шум: не рахувати в темах. */
  | { action: 'noise'; hashes: string[] }
  /** Повернути алгоритму: розкладе заново. */
  | { action: 'auto'; hashes: string[] };

/** reassign — питання розкладе алгоритм заново; ignore — питання стають шумом. */
export type ChatwootBotTopicDeleteMode = 'reassign' | 'ignore';

export const CHATWOOT_BOT_TOPIC_LIMITS = {
  titleMax: 255,
  descriptionMax: 2000,
  hashesMax: 500,
} as const;
