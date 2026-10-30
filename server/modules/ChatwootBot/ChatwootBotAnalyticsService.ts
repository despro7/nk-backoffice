import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma, logServer } from '../../lib/utils.js';
import type {
  ChatwootBotAnalyticsEventKind,
  ChatwootBotAnalyticsOverview,
  ChatwootBotQuestionClusterDto,
} from '../../../shared/types/chatwootBot.js';
import type { ChatwootBotTopicQuestionDto, ChatwootBotTopicRef } from '../../../shared/types/chatwootBotTopics.js';
import { chatwootBotQuestionTopicsService, type TopicsSnapshot } from './ChatwootBotQuestionTopicsService.js';
import { chatwootBotKnowledgeService } from './ChatwootBotKnowledgeService.js';
import { clusterQuestions, type QuestionCluster, type QuestionSample } from './chatwootBotQuestionClusters.js';
import {
  normalizeChatwootMessageContent,
  previewChatwootContent,
} from './chatwootBotContentNorm.js';

export type RecordAnalyticsInput = {
  kind: ChatwootBotAnalyticsEventKind;
  conversationId?: number | null;
  messageId?: number | null;
  inboxId?: number | null;
  agentId?: number | null;
  content?: string | null;
  inHours?: boolean | null;
  meta?: Record<string, unknown> | null;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export class ChatwootBotAnalyticsService {
  async record(input: RecordAnalyticsInput): Promise<void> {
    const contentPreview = previewChatwootContent(input.content, 200);
    const contentNorm = normalizeChatwootMessageContent(input.content);
    try {
      await prisma.chatwootBotAnalyticsEvent.create({
        data: {
          id: randomUUID(),
          kind: input.kind,
          conversationId: input.conversationId ?? null,
          messageId: input.messageId ?? null,
          inboxId: input.inboxId ?? null,
          agentId: input.agentId ?? null,
          contentPreview: contentPreview || null,
          contentNorm: contentNorm || null,
          inHours: input.inHours ?? null,
          meta: (input.meta ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err) {
      logServer('[ChatwootBotAnalytics] record failed', err);
    }
  }

  recordBestEffort(input: RecordAnalyticsInput): void {
    void this.record(input);
  }

  /** Для кожної теми — стаття, яку знайде бот (той самий пошук, що й у tool). */
  private async withKnowledgeCoverage<T extends QuestionCluster>(clusters: T[]): Promise<Array<T & ChatwootBotQuestionClusterDto>> {
    try {
      return await Promise.all(
        clusters.map(async (cluster) => {
          const [hit] = await chatwootBotKnowledgeService.search(cluster.label, 1);
          return { ...cluster, knowledgeEntry: hit ? { id: hit.id, title: hit.title } : null };
        }),
      );
    } catch (err) {
      logServer('[ChatwootBotAnalytics] knowledge coverage failed (non-fatal)', err);
      return clusters;
    }
  }

  /**
   * Теми з БД (алгоритм + ручні правки) з підрахунком за період. Якщо таблиці тем недоступні —
   * кластеризація на льоту, як раніше.
   */
  private async buildQuestionTopics(questionCounts: Map<string, { count: number; preview: string }>): Promise<{
    questionClusters: ChatwootBotQuestionClusterDto[];
    topics: ChatwootBotTopicRef[];
    ignoredQuestions: ChatwootBotTopicQuestionDto[];
  }> {
    let snapshot: TopicsSnapshot;
    try {
      snapshot = await chatwootBotQuestionTopicsService.snapshot();
    } catch (err) {
      logServer('[ChatwootBotAnalytics] topics unavailable, clustering on the fly', err);
      const samples = [...questionCounts.values()].map((v) => ({ text: v.preview, count: v.count }));
      return {
        questionClusters: await this.withKnowledgeCoverage(clusterQuestions(samples)),
        topics: [],
        ignoredQuestions: [],
      };
    }

    const byTopic = new Map<number, ChatwootBotTopicQuestionDto[]>();
    const ignoredQuestions: ChatwootBotTopicQuestionDto[] = [];
    for (const [norm, { count, preview }] of questionCounts) {
      const row = snapshot.assignments.get(norm);
      if (!row) continue;
      const question: ChatwootBotTopicQuestionDto = {
        hash: row.questionHash,
        text: preview,
        count,
        source: row.source === 'manual' ? 'manual' : 'auto',
      };
      if (row.ignored) {
        ignoredQuestions.push(question);
      } else if (row.topicId != null) {
        const list = byTopic.get(row.topicId) ?? [];
        list.push(question);
        byTopic.set(row.topicId, list);
      }
    }

    const byCount = (a: ChatwootBotTopicQuestionDto, b: ChatwootBotTopicQuestionDto) =>
      b.count - a.count || a.text.localeCompare(b.text);
    const clusters = snapshot.topics
      .filter((topic) => byTopic.has(topic.id))
      .map((topic) => {
        const questions = byTopic.get(topic.id)!.sort(byCount);
        return {
          topicId: topic.id,
          label: topic.title,
          count: questions.reduce((sum, q) => sum + q.count, 0),
          examples: [...new Set(questions.map((q) => q.text))].slice(0, 5),
          questions,
        };
      })
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    return {
      questionClusters: await this.withKnowledgeCoverage(clusters),
      topics: snapshot.topics,
      ignoredQuestions: ignoredQuestions.sort(byCount),
    };
  }

  async getOverview(from: Date, to: Date): Promise<ChatwootBotAnalyticsOverview> {
    const rows = await prisma.chatwootBotAnalyticsEvent.findMany({
      where: {
        createdAt: { gte: from, lte: to },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        kind: true,
        conversationId: true,
        agentId: true,
        contentNorm: true,
        contentPreview: true,
        createdAt: true,
        meta: true,
      },
    });

    const questionCounts = new Map<string, { count: number; preview: string }>();
    const missCounts = new Map<string, { count: number; preview: string }>();
    let knowledgeLookups = 0;
    let knowledgeFound = 0;
    let customerMessages = 0;
    let agentMessages = 0;
    let reclaims = 0;
    let resolved = 0;

    for (const row of rows) {
      switch (row.kind) {
        case 'customer_message':
          customerMessages += 1;
          if (row.contentNorm) {
            const prev = questionCounts.get(row.contentNorm);
            if (prev) {
              prev.count += 1;
            } else {
              questionCounts.set(row.contentNorm, {
                count: 1,
                preview: row.contentPreview ?? row.contentNorm,
              });
            }
          }
          break;
        case 'agent_message':
          agentMessages += 1;
          break;
        case 'bot_action': {
          const meta = row.meta as { kind?: string; found?: boolean } | null;
          if (meta?.kind !== 'kb_lookup') break;
          knowledgeLookups += 1;
          if (meta.found) {
            knowledgeFound += 1;
          } else if (row.contentNorm) {
            const prev = missCounts.get(row.contentNorm);
            if (prev) prev.count += 1;
            else missCounts.set(row.contentNorm, { count: 1, preview: row.contentPreview ?? row.contentNorm });
          }
          break;
        }
        case 'reclaim':
          reclaims += 1;
          break;
        case 'resolved':
          resolved += 1;
          break;
        default:
          break;
      }
    }

    const toSamples = (counts: Map<string, { count: number; preview: string }>): QuestionSample[] =>
      [...counts.values()].map((v) => ({ text: v.preview, count: v.count }));
    const { questionClusters, topics, ignoredQuestions } = await this.buildQuestionTopics(questionCounts);
    const knowledgeMisses = clusterQuestions(toSamples(missCounts), { maxClusters: 10 });

    const pendingByConv = new Map<number, Date[]>();
    const responseSecondsByAgent = new Map<number, number[]>();
    const conversationsByAgent = new Map<number, Set<number>>();
    const noReplyByAgent = new Map<number, number>();
    const reclaimByAgent = new Map<number, number>();

    for (const row of rows) {
      const convId = row.conversationId;
      if (convId == null) continue;

      if (row.kind === 'customer_message') {
        const queue = pendingByConv.get(convId) ?? [];
        queue.push(row.createdAt);
        pendingByConv.set(convId, queue);
        continue;
      }

      if (row.kind === 'agent_message' && row.agentId != null) {
        const queue = pendingByConv.get(convId);
        if (!queue?.length) continue;
        const customerAt = queue.shift()!;
        if (queue.length === 0) {
          pendingByConv.delete(convId);
        }
        const seconds = (row.createdAt.getTime() - customerAt.getTime()) / 1000;
        if (seconds < 0) continue;
        const list = responseSecondsByAgent.get(row.agentId) ?? [];
        list.push(seconds);
        responseSecondsByAgent.set(row.agentId, list);
        const convSet = conversationsByAgent.get(row.agentId) ?? new Set();
        convSet.add(convId);
        conversationsByAgent.set(row.agentId, convSet);
        continue;
      }

      if (row.kind === 'reclaim') {
        const meta = row.meta as { assigneeId?: number } | null;
        const agentId =
          row.agentId ??
          (typeof meta?.assigneeId === 'number' ? meta.assigneeId : null);
        if (agentId != null) {
          reclaimByAgent.set(agentId, (reclaimByAgent.get(agentId) ?? 0) + 1);
        }
        pendingByConv.delete(convId);
        continue;
      }

      if (row.kind === 'resolved') {
        pendingByConv.delete(convId);
      }
    }

    for (const [convId, queue] of pendingByConv) {
      if (queue.length === 0) continue;
      void convId;
      // Без assignee в pending – пропускаємо noReply без agentId
    }

    const agentIds = new Set<number>([
      ...responseSecondsByAgent.keys(),
      ...reclaimByAgent.keys(),
    ]);

    const agentSla = [...agentIds]
      .sort((a, b) => a - b)
      .map((agentId) => ({
        agentId,
        conversations: conversationsByAgent.get(agentId)?.size ?? 0,
        medianResponseSeconds: median(responseSecondsByAgent.get(agentId) ?? []),
        avgResponseSeconds: average(responseSecondsByAgent.get(agentId) ?? []),
        noReplyCount: noReplyByAgent.get(agentId) ?? 0,
        reclaimCount: reclaimByAgent.get(agentId) ?? 0,
      }));

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      questionClusters,
      topics,
      ignoredQuestions,
      knowledgeMisses,
      knowledgeLookups: { total: knowledgeLookups, found: knowledgeFound },
      agentSla,
      totals: {
        customerMessages,
        agentMessages,
        reclaims,
        resolved,
      },
    };
  }
}

export const chatwootBotAnalyticsService = new ChatwootBotAnalyticsService();
