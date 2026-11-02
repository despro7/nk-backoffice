import { buildActionRequests } from './chatwootBotActionRequests.js';
import type { ChatwootBotActionRequestDto } from '../../../shared/types/chatwootBotScenarios.js';
import { chatwootBotIntentService } from './ChatwootBotIntentService.js';
import { intentQuestionText } from './chatwootBotIntents.js';
import { createChatwootApiClient } from './ChatwootApiClient.js';
import { handoverAssignmentCredentials } from './chatwootCredentials.js';
import { chatwootBotSettingsService } from './ChatwootBotSettingsService.js';
import { buildQuestionContexts } from './chatwootBotQuestionContext.js';
import type { ChatwootBotQuestionContextDto } from '../../../shared/types/chatwootBotTopics.js';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma, logServer } from '../../lib/utils.js';
import type {
  ChatwootBotAnalyticsEventKind,
  ChatwootBotAnalyticsOverview,
  ChatwootBotQuestionClusterDto,
} from '../../../shared/types/chatwootBot.js';
import type { ChatwootBotTopicQuestionDto, ChatwootBotTopicRef } from '../../../shared/types/chatwootBotTopics.js';
import { chatwootBotQuestionTopicsService, questionHash, type TopicsSnapshot } from './ChatwootBotQuestionTopicsService.js';
import { chatwootBotKnowledgeService } from './ChatwootBotKnowledgeService.js';
import { clusterQuestions, type QuestionCluster, type QuestionSample } from './chatwootBotQuestionClusters.js';
import {
  normalizeChatwootMessageContent,
  displayQuestionText,
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
      if (input.kind === 'customer_message' && contentNorm) chatwootBotQuestionTopicsService.scheduleSync();
    } catch (err) {
      logServer('[ChatwootBotAnalytics] record failed', err);
    }
  }

  recordBestEffort(input: RecordAnalyticsInput): void {
    void this.record(input);
  }

  /**
   * Контекст питання з історії Chatwoot — для старих даних, де відповіді бота ще не записувались.
   * Беремо останнє повідомлення клієнта з цим текстом і публічне повідомлення безпосередньо перед ним.
   */
  async questionContextFromChatwoot(questionHash: string): Promise<ChatwootBotQuestionContextDto | null> {
    const assignment = await prisma.chatwootBotQuestionAssignment.findUnique({
      where: { questionHash },
      select: { contentNorm: true },
    });
    if (!assignment) return null;
    const event = await prisma.chatwootBotAnalyticsEvent.findFirst({
      where: { kind: 'customer_message', contentNorm: assignment.contentNorm, conversationId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { conversationId: true, messageId: true, createdAt: true },
    });
    if (!event?.conversationId) return null;
    const settings = await chatwootBotSettingsService.getSettings();
    const client = createChatwootApiClient(handoverAssignmentCredentials(settings));
    const messages = (await client.listConversationMessages(event.conversationId))
      .filter((m) => !m.private && (m.content ?? '').trim())
      .sort((a, b) => a.id - b.id);
    const index = event.messageId != null
      ? messages.findIndex((m) => m.id === event.messageId)
      : messages.findIndex((m) => m.createdAt.getTime() >= event.createdAt.getTime());
    const prev = index > 0 ? messages[index - 1] : null;
    if (!prev) return null;
    const incoming = prev.message_type === 0 || prev.message_type === 'incoming';
    const senderType = String(prev.sender?.type ?? '').toLowerCase();
    const text = (prev.content ?? '').replace(/\s+/g, ' ').trim();
    return {
      by: incoming ? 'client' : senderType === 'user' ? 'agent' : 'bot',
      text: text.length > 200 ? `${text.slice(0, 200)}…` : text,
    };
  }

  /** Частини `action` з розбору повідомлень періоду → групи запитів на дію з рішенням. */
  private async buildActionRequestsForPeriod(
    questionCounts: Map<string, { count: number; preview: string }>,
  ): Promise<ChatwootBotActionRequestDto[]> {
    const norms = [...questionCounts.keys()];
    const intents = await chatwootBotIntentService.loadIntents(norms.map(questionHash));
    const samples: QuestionSample[] = [];
    for (const norm of norms) {
      const parts = intents.get(questionHash(norm));
      for (const part of parts ?? []) {
        if (part.kind === 'action' && part.text) samples.push({ text: part.text, count: questionCounts.get(norm)!.count });
      }
    }
    if (samples.length === 0) return [];
    const settings = await chatwootBotSettingsService.getSettings();
    return buildActionRequests(samples, settings);
  }

  /** Публічна відповідь бота клієнту — контекст для наступного питання в статистиці тем. */
  recordBotReply(conversationId: number, text: string, messageId: number | null = null): void {
    if (!text.trim()) return;
    this.recordBestEffort({ kind: 'bot_action', conversationId, messageId, content: text, meta: { kind: 'reply' } });
  }

  /** Для кожної теми — стаття, яку знайде бот (той самий пошук, що й у tool). */
  private async withKnowledgeCoverage<T extends QuestionCluster>(clusters: T[]): Promise<Array<T & ChatwootBotQuestionClusterDto>> {
    try {
      return await Promise.all(
        clusters.map(async (cluster) => {
          const [hit] = await chatwootBotKnowledgeService.search(cluster.label, 1);
          return { ...cluster, knowledgeEntry: hit ? { id: hit.id, title: hit.title, tags: hit.tags } : null };
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
  private async buildQuestionTopics(
    questionCounts: Map<string, { count: number; preview: string }>,
    contexts: Map<string, ChatwootBotQuestionContextDto>,
    toolsByNorm: Map<string, Map<string, number>>,
  ): Promise<{
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
    const toolsByTopic = new Map<number, Map<string, number>>();
    const ignoredQuestions: ChatwootBotTopicQuestionDto[] = [];
    const intents = await chatwootBotIntentService.loadIntents(
      [...questionCounts.keys()].flatMap((norm) => snapshot.assignments.get(norm)?.questionHash ?? []),
    );
    for (const [norm, { count, preview }] of questionCounts) {
      const row = snapshot.assignments.get(norm);
      if (!row) continue;
      const parts = intents.get(row.questionHash);
      const questionText = parts ? intentQuestionText(parts) : null;
      const question: ChatwootBotTopicQuestionDto = {
        hash: row.questionHash,
        text: questionText ?? preview,
        ...(questionText && questionText !== preview ? { original: preview } : {}),
        ...(parts ? { kinds: [...new Set(parts.map((p) => p.kind))] } : {}),
        count,
        source: row.source === 'manual' ? 'manual' : 'auto',
        context: contexts.get(norm) ?? null,
      };
      if (row.ignored) {
        ignoredQuestions.push(question);
      } else if (row.topicId != null) {
        const list = byTopic.get(row.topicId) ?? [];
        list.push(question);
        byTopic.set(row.topicId, list);
        const used = toolsByNorm.get(norm);
        if (used) {
          const acc = toolsByTopic.get(row.topicId) ?? new Map<string, number>();
          for (const [name, n] of used) acc.set(name, (acc.get(name) ?? 0) + n);
          toolsByTopic.set(row.topicId, acc);
        }
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
          label: displayQuestionText(topic.title),
          count: questions.reduce((sum, q) => sum + q.count, 0),
          examples: [...new Set(questions.map((q) => q.text))].slice(0, 5),
          questions,
          tools: [...(toolsByTopic.get(topic.id) ?? [])]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count),
        };
      })
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    return {
      questionClusters: await this.withKnowledgeCoverage(clusters),
      topics: snapshot.topics.map((topic) => ({ ...topic, title: displayQuestionText(topic.title) })),
      ignoredQuestions: ignoredQuestions.sort(byCount),
    };
  }

  async getOverview(from: Date, to: Date): Promise<ChatwootBotAnalyticsOverview> {
    const firstEvent = await prisma.chatwootBotAnalyticsEvent.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
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
    /** contentNorm повідомлення клієнта → інструмент → скільки разів бот ним відповів. */
    const toolsByNorm = new Map<string, Map<string, number>>();
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
                preview: displayQuestionText(row.contentPreview ?? row.contentNorm),
              });
            }
          }
          break;
        case 'agent_message':
          agentMessages += 1;
          break;
        case 'bot_action': {
          const meta = row.meta as { kind?: string; found?: boolean; tools?: unknown } | null;
          if (meta?.kind === 'tool_use' && row.contentNorm && Array.isArray(meta.tools)) {
            const used = toolsByNorm.get(row.contentNorm) ?? new Map<string, number>();
            for (const name of meta.tools) if (typeof name === 'string') used.set(name, (used.get(name) ?? 0) + 1);
            toolsByNorm.set(row.contentNorm, used);
            break;
          }
          if (meta?.kind !== 'kb_lookup') break;
          knowledgeLookups += 1;
          if (meta.found) {
            knowledgeFound += 1;
          } else if (row.contentNorm) {
            const prev = missCounts.get(row.contentNorm);
            if (prev) prev.count += 1;
            else missCounts.set(row.contentNorm, { count: 1, preview: displayQuestionText(row.contentPreview ?? row.contentNorm) });
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
    const { questionClusters, topics, ignoredQuestions } = await this.buildQuestionTopics(
      questionCounts,
      buildQuestionContexts(rows),
      toolsByNorm,
    );
    // Стаття могла зʼявитись пізніше (або пошук покращився): покажемо, що відповідь уже є.
    const knowledgeMisses = await this.withKnowledgeCoverage(clusterQuestions(toSamples(missCounts), { maxClusters: 10 }));
    const actionRequests = await this.buildActionRequestsForPeriod(questionCounts);

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
      actionRequests,
      knowledgeLookups: { total: knowledgeLookups, found: knowledgeFound },
      firstEventAt: firstEvent?.createdAt.toISOString() ?? null,
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
