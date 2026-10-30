import { knowledgeStems } from './chatwootBotKnowledgeSearch.js';

/**
 * Кластеризація питань клієнтів без зовнішніх сервісів: «скільки коштує доставка» і
 * «яка ціна доставки до Києва» — одна тема. Схожість — IDF-зважена частка спільних основ слів
 * (із синонімами) із «зерном» кластера (найчастішим формулюванням), тож часті слова на кшталт
 * «замовлення» важать менше за змістовні («скасувати», «доставка»).
 */

export type QuestionSample = {
  /** Текст для показу (preview повідомлення). */
  text: string;
  count: number;
};

export type QuestionCluster = {
  /** Найчастіше формулювання теми. */
  label: string;
  count: number;
  /** Різні формулювання, від найчастішого. */
  examples: string[];
};

export type ClusterOptions = {
  similarity?: number;
  maxClusters?: number;
  maxExamples?: number;
};

export const QUESTION_TOPIC_SIMILARITY = 0.5;

/** Основи без цифр: телефони й номери замовлень не мають склеювати теми. */
export function topicStems(text: string): Set<string> {
  return new Set([...knowledgeStems(text)].filter((stem) => /\p{L}/u.test(stem)));
}

export type QuestionSimilarity = {
  weight: (stems: Set<string>) => number;
  /** 0–1. max, а не min: «скасувати замовлення» не має вливатися в «де моє замовлення» лише через «замовлення». */
  score: (a: Set<string>, b: Set<string>, aWeight?: number, bWeight?: number) => number;
};

/** IDF рахується по всьому корпусу питань, щоб часті слова важили менше. */
export function createQuestionSimilarity(corpus: Set<string>[]): QuestionSimilarity {
  const docs = corpus.filter((stems) => stems.size > 0);
  const df = new Map<string, number>();
  for (const stems of docs) for (const stem of stems) df.set(stem, (df.get(stem) ?? 0) + 1);
  const total = Math.max(docs.length, 1);
  const idf = (stem: string): number => Math.log(1 + total / (df.get(stem) ?? 1));
  const weight = (stems: Set<string>): number => [...stems].reduce((sum, stem) => sum + idf(stem), 0);
  return {
    weight,
    score(a, b, aWeight = weight(a), bWeight = weight(b)) {
      const denominator = Math.max(aWeight, bWeight);
      if (denominator <= 0) return 0;
      let shared = 0;
      for (const stem of a) if (b.has(stem)) shared += idf(stem);
      return shared / denominator;
    },
  };
}

type ClusterInput<T> = { item: T; stems: Set<string>; count: number; text: string };
export type ClusterGroup<T> = { label: string; count: number; items: T[] };

/**
 * Жадібна кластеризація: від найчастішого формулювання, кожне приєднується до найближчого
 * зерна або стає новим кластером. Повертає всі елементи кластерів (без обрізання).
 */
export function clusterBySeed<T>(
  inputs: ClusterInput<T>[],
  similarity: QuestionSimilarity,
  threshold = QUESTION_TOPIC_SIMILARITY,
): ClusterGroup<T>[] {
  const sorted = inputs
    .filter((s) => s.stems.size > 0)
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));

  type Working = { seed: Set<string>; seedWeight: number; label: string; count: number; items: T[] };
  const clusters: Working[] = [];

  for (const sample of sorted) {
    const sampleWeight = similarity.weight(sample.stems);
    let best: Working | null = null;
    let bestScore = 0;
    for (const cluster of clusters) {
      const score = similarity.score(sample.stems, cluster.seed, sampleWeight, cluster.seedWeight);
      if (score > bestScore || (score === bestScore && best && cluster.count > best.count)) {
        best = cluster;
        bestScore = score;
      }
    }
    if (best && bestScore >= threshold) {
      best.count += sample.count;
      best.items.push(sample.item);
    } else {
      clusters.push({
        seed: sample.stems,
        seedWeight: sampleWeight,
        label: sample.text,
        count: sample.count,
        items: [sample.item],
      });
    }
  }

  return clusters
    .sort((a, b) => b.count - a.count)
    .map(({ label, count, items }) => ({ label, count, items }));
}

export function clusterQuestions(samples: QuestionSample[], options: ClusterOptions = {}): QuestionCluster[] {
  const maxClusters = options.maxClusters ?? 20;
  const maxExamples = options.maxExamples ?? 5;

  const inputs = samples.map((s) => ({ item: s, stems: topicStems(s.text), count: s.count, text: s.text }));
  const similarity = createQuestionSimilarity(inputs.map((s) => s.stems));

  return clusterBySeed(inputs, similarity, options.similarity ?? QUESTION_TOPIC_SIMILARITY)
    .slice(0, maxClusters)
    .map(({ label, count, items }) => ({
      label,
      count,
      examples: [...new Set(items.map((s) => s.text))].slice(0, maxExamples),
    }));
}
