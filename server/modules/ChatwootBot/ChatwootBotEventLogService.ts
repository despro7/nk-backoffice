import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma, logServer } from '../../lib/utils.js';
import {
  CHATWOOT_BOT_FULL_PAYLOAD_MAX_BYTES,
  DEFAULT_CHATWOOT_BOT_EVENT_LOG_MAX_RECORDS,
  DEFAULT_CHATWOOT_BOT_EVENT_LOG_RETENTION_DAYS,
  type ChatwootBotEventRecord,
  type ChatwootBotEventSource,
  type ChatwootBotProcessAction,
  type ChatwootBotReplyMode,
  type ChatwootBotSettings,
  type ChatwootBotWebhookHeadersMeta,
} from '../../../shared/types/chatwootBot.js';
import { chatwootBotSettingsService } from './ChatwootBotSettingsService.js';

export type CreateChatwootBotEventInput = {
  source: ChatwootBotEventSource;
  action: ChatwootBotProcessAction;
  reason: string;
  conversationId: number | null;
  messageId: number | null;
  contentPreview: string;
  replyMode: ChatwootBotReplyMode;
  dryRun: boolean;
  details?: string;
  webhookEvent?: string | null;
  headersMeta?: ChatwootBotWebhookHeadersMeta | null;
  payload?: unknown;
};

function clampRetentionDays(days: number): number {
  return Math.max(1, Math.min(90, Math.floor(days)));
}

function clampMaxRecords(max: number): number {
  return Math.max(10, Math.min(5000, Math.floor(max)));
}

function truncatePayload(payload: unknown): Prisma.InputJsonValue {
  try {
    const json = JSON.stringify(payload);
    if (json.length <= CHATWOOT_BOT_FULL_PAYLOAD_MAX_BYTES) {
      return JSON.parse(json) as Prisma.InputJsonValue;
    }
    return {
      _truncated: true,
      _originalBytes: json.length,
      _preview: json.slice(0, CHATWOOT_BOT_FULL_PAYLOAD_MAX_BYTES),
    };
  } catch {
    return { _unserializable: true };
  }
}

function rowToRecord(row: {
  id: string;
  source: string;
  action: string;
  reason: string;
  conversationId: number | null;
  messageId: number | null;
  contentPreview: string | null;
  replyMode: string;
  dryRun: boolean;
  details: string | null;
  webhookEvent: string | null;
  headersMeta: unknown;
  payloadJson: unknown;
  createdAt: Date;
}): ChatwootBotEventRecord {
  return {
    id: row.id,
    at: row.createdAt.toISOString(),
    source: row.source === 'simulate' ? 'simulate' : 'webhook',
    action: row.action as ChatwootBotProcessAction,
    reason: row.reason,
    conversationId: row.conversationId,
    messageId: row.messageId,
    contentPreview: row.contentPreview ?? '',
    replyMode: row.replyMode === 'live' ? 'live' : 'dry_run',
    dryRun: row.dryRun,
    details: row.details ?? undefined,
    webhookEvent: row.webhookEvent,
    headersMeta: (row.headersMeta as ChatwootBotWebhookHeadersMeta | null) ?? null,
    payloadJson: row.payloadJson ?? null,
  };
}

export class ChatwootBotEventLogService {
  async append(input: CreateChatwootBotEventInput): Promise<ChatwootBotEventRecord> {
    const settings = await chatwootBotSettingsService.getSettings();
    const id = randomUUID();
    const payloadJson =
      settings.eventLogStoreFullPayload && input.payload !== undefined
        ? truncatePayload(input.payload)
        : null;

    const created = await prisma.chatwootBotWebhookLog.create({
      data: {
        id,
        source: input.source,
        action: input.action,
        reason: input.reason,
        conversationId: input.conversationId,
        messageId: input.messageId,
        contentPreview: input.contentPreview.slice(0, 512),
        replyMode: input.replyMode,
        dryRun: input.dryRun,
        details: input.details ?? null,
        webhookEvent: input.webhookEvent ?? null,
        headersMeta: input.headersMeta ?? undefined,
        payloadJson: payloadJson ?? undefined,
      },
    });

    void this.runRetention(settings).catch((err) => {
      logServer('[ChatwootBot] event log retention failed', err);
    });

    return rowToRecord(created);
  }

  async clearAll(): Promise<number> {
    const result = await prisma.chatwootBotWebhookLog.deleteMany({});
    return result.count;
  }

  async recent(limit = 20): Promise<ChatwootBotEventRecord[]> {
    const take = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = await prisma.chatwootBotWebhookLog.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map(rowToRecord);
  }

  async runRetention(settings?: ChatwootBotSettings): Promise<void> {
    const cfg = settings ?? await chatwootBotSettingsService.getSettings();
    const retentionDays = clampRetentionDays(
      cfg.eventLogRetentionDays || DEFAULT_CHATWOOT_BOT_EVENT_LOG_RETENTION_DAYS,
    );
    const maxRecords = clampMaxRecords(
      cfg.eventLogMaxRecords || DEFAULT_CHATWOOT_BOT_EVENT_LOG_MAX_RECORDS,
    );

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    await prisma.chatwootBotWebhookLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    const count = await prisma.chatwootBotWebhookLog.count();
    if (count <= maxRecords) return;

    const excess = count - maxRecords;
    const oldest = await prisma.chatwootBotWebhookLog.findMany({
      orderBy: { createdAt: 'asc' },
      take: excess,
      select: { id: true },
    });
    if (oldest.length === 0) return;

    await prisma.chatwootBotWebhookLog.deleteMany({
      where: { id: { in: oldest.map((r) => r.id) } },
    });
  }
}

export const chatwootBotEventLogService = new ChatwootBotEventLogService();
