import {
  QUESTION_TOPIC_SIMILARITY,
  clusterBySeed,
  createQuestionSimilarity,
  topicStems,
} from './chatwootBotQuestionClusters.js';

/**
 * Перша лінія розкладки питань по збережених темах: нове питання йде в тему з найближчим
 * учасником; що не підійшло нікуди — кластеризується між собою в нові теми.
 * Чиста функція: БД і ручні призначення — у ChatwootBotQuestionTopicsService.
 */

export type TopicAssignQuestion = { key: string; text: string; count: number };
export type TopicAssignTopic = { id: number; memberKeys: string[] };

export type TopicAssignResult = {
  assigned: Array<{ key: string; topicId: number; score: number }>;
  /** Нові теми з питань, яким не знайшлося місця; label — найчастіше формулювання. */
  newTopics: Array<{ label: string; keys: string[] }>;
  /** Без змістовних слів (телефон, «дякую») — шум. */
  noise: string[];
};

export function assignQuestionsToTopics(
  questions: TopicAssignQuestion[],
  topics: TopicAssignTopic[],
  pendingKeys: string[],
  threshold = QUESTION_TOPIC_SIMILARITY,
): TopicAssignResult {
  const byKey = new Map(questions.map((q) => [q.key, { ...q, stems: topicStems(q.text) }]));
  const similarity = createQuestionSimilarity([...byKey.values()].map((q) => q.stems));

  const topicMembers = topics.map((topic) => ({
    id: topic.id,
    members: topic.memberKeys
      .map((key) => byKey.get(key)?.stems)
      .filter((stems): stems is Set<string> => Boolean(stems && stems.size > 0)),
  }));

  const result: TopicAssignResult = { assigned: [], newTopics: [], noise: [] };
  const leftovers: Array<{ item: string; stems: Set<string>; count: number; text: string }> = [];

  const pending = pendingKeys
    .map((key) => byKey.get(key))
    .filter((q): q is NonNullable<typeof q> => Boolean(q))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));

  for (const question of pending) {
    if (question.stems.size === 0) {
      result.noise.push(question.key);
      continue;
    }
    let bestId: number | null = null;
    let bestScore = 0;
    for (const topic of topicMembers) {
      for (const member of topic.members) {
        const score = similarity.score(question.stems, member);
        if (score > bestScore) {
          bestScore = score;
          bestId = topic.id;
        }
      }
    }
    if (bestId != null && bestScore >= threshold) {
      result.assigned.push({ key: question.key, topicId: bestId, score: Math.min(1, bestScore) });
    } else {
      leftovers.push({ item: question.key, stems: question.stems, count: question.count, text: question.text });
    }
  }

  result.newTopics = clusterBySeed(leftovers, similarity, threshold).map(({ label, items }) => ({
    label,
    keys: items,
  }));
  return result;
}
