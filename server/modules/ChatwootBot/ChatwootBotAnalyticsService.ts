import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma, logServer } from '../../lib/utils.js';
import type {
  ChatwootBotAnalyticsEventKind,
  ChatwootBotAnalyticsOverview,
} from '../../../shared/types/chatwootBot.js';
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

    const topQuestions = [...questionCounts.entries()]
      .map(([contentNorm, v]) => ({
        contentNorm,
        contentPreview: v.preview,
        count: v.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

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
      topQuestions,
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
