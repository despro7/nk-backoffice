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

const DEFAULT_SIMILARITY = 0.5;

/** Основи без цифр: телефони й номери замовлень не мають склеювати теми. */
function topicStems(text: string): Set<string> {
  return new Set([...knowledgeStems(text)].filter((stem) => /\p{L}/u.test(stem)));
}

export function clusterQuestions(samples: QuestionSample[], options: ClusterOptions = {}): QuestionCluster[] {
  const similarity = options.similarity ?? DEFAULT_SIMILARITY;
  const maxClusters = options.maxClusters ?? 20;
  const maxExamples = options.maxExamples ?? 5;

  const prepared = samples
    .map((s) => ({ ...s, stems: topicStems(s.text) }))
    .filter((s) => s.stems.size > 0)
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
  if (prepared.length === 0) return [];

  const df = new Map<string, number>();
  for (const s of prepared) for (const stem of s.stems) df.set(stem, (df.get(stem) ?? 0) + 1);
  const idf = (stem: string): number => Math.log(1 + prepared.length / (df.get(stem) ?? 1));
  const weight = (stems: Set<string>): number => [...stems].reduce((sum, stem) => sum + idf(stem), 0);

  type Working = { seed: Set<string>; seedWeight: number; label: string; count: number; examples: string[] };
  const clusters: Working[] = [];

  for (const sample of prepared) {
    const sampleWeight = weight(sample.stems);
    let best: Working | null = null;
    let bestScore = 0;
    for (const cluster of clusters) {
      let shared = 0;
      for (const stem of sample.stems) if (cluster.seed.has(stem)) shared += idf(stem);
      // max, а не min: «скасувати замовлення» не має вливатися в «де моє замовлення» лише через «замовлення».
      const score = shared / Math.max(sampleWeight, cluster.seedWeight);
      if (score > bestScore || (score === bestScore && best && cluster.count > best.count)) {
        best = cluster;
        bestScore = score;
      }
    }
    if (best && bestScore >= similarity) {
      best.count += sample.count;
      if (best.examples.length < maxExamples && !best.examples.includes(sample.text)) best.examples.push(sample.text);
    } else {
      clusters.push({
        seed: sample.stems,
        seedWeight: sampleWeight,
        label: sample.text,
        count: sample.count,
        examples: [sample.text],
      });
    }
  }

  return clusters
    .sort((a, b) => b.count - a.count)
    .slice(0, maxClusters)
    .map(({ label, count, examples }) => ({ label, count, examples }));
}
