import { JEV_MAX_CHOICES } from '../../services/llm/typesafeJevClient.js';

/**
 * Теми питань як варіанти `choice` для TypeSafe Jev: назва, опис і приклади учасників.
 * Чисті функції; виклик API — у ChatwootBotQuestionTopicsService.
 */

export const JEV_NONE_CHOICE = 'none';
const CHOICE_PREFIX = 't';
const CRITERION_MAX_CHARS = 400;
const DEFAULT_EXAMPLES_PER_TOPIC = 4;

export const JEV_TOPIC_INSTRUCTIONS =
  'До якої теми належить це повідомлення клієнта інтернет-магазину готової їжі? ' +
  'Порівнюй суть питання, а не окремі слова. Обери «none», якщо жодна тема не описує суть питання.';

export type JevTopicInput = {
  id: number;
  title: string;
  description: string | null;
  /** Формулювання учасників, від найважливіших (ручні, часті). */
  examples: string[];
  /** Для відбору, якщо тем більше за ліміт API. */
  weight: number;
};

export function jevChoiceKey(topicId: number): string {
  return `${CHOICE_PREFIX}${topicId}`;
}

/** `t12` → 12; `none` чи невідомий ключ → null. */
export function topicIdFromJevChoice(choice: string): number | null {
  if (!choice.startsWith(CHOICE_PREFIX)) return null;
  const id = Number(choice.slice(CHOICE_PREFIX.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function describeTopic(topic: JevTopicInput, examplesPerTopic: number): string {
  const parts = [topic.title.trim()];
  if (topic.description?.trim()) parts.push(topic.description.trim());
  const examples = [...new Set(topic.examples.map((e) => e.trim()).filter(Boolean))]
    .filter((e) => e !== topic.title.trim())
    .slice(0, examplesPerTopic);
  if (examples.length > 0) parts.push(`Приклади: ${examples.map((e) => `«${e}»`).join('; ')}`);
  const text = parts.join('. ');
  return text.length > CRITERION_MAX_CHARS ? `${text.slice(0, CRITERION_MAX_CHARS - 1)}…` : text;
}

/** Варіанти для Jev; якщо тем забагато — лишаються найвагоміші. */
export function buildJevTopicCriteria(
  topics: JevTopicInput[],
  examplesPerTopic = DEFAULT_EXAMPLES_PER_TOPIC,
): Record<string, string> {
  const criteria: Record<string, string> = {};
  const kept = [...topics].sort((a, b) => b.weight - a.weight).slice(0, JEV_MAX_CHOICES - 1);
  for (const topic of kept) criteria[jevChoiceKey(topic.id)] = describeTopic(topic, examplesPerTopic);
  criteria[JEV_NONE_CHOICE] = 'Жодна з тем не підходить: інше питання';
  return criteria;
}
