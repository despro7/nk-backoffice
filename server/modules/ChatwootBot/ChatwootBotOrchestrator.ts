import { logServer } from '../../lib/utils.js';
import {
  type ChatwootBotEventRecord,
  type ChatwootBotEventSource,
  type ChatwootBotProcessResult,
  type ChatwootBotSettings,
  type ChatwootBotWebhookHeadersMeta,
  type ChatwootWebhookMessageCreated,
} from '../../../shared/types/chatwootBot.js';
import { createChatwootApiClient } from './ChatwootApiClient.js';
import { chatwootBotEventLogService } from './ChatwootBotEventLogService.js';
import { chatwootBotSettingsService } from './ChatwootBotSettingsService.js';

type ProcessLogContext = {
  source: ChatwootBotEventSource;
  headersMeta?: ChatwootBotWebhookHeadersMeta | null;
  payload: ChatwootWebhookMessageCreated;
  webhookEvent: string | null;
};

function isIncomingMessageType(messageType: string | number | undefined): boolean {
  if (messageType === undefined || messageType === null) return false;
  if (typeof messageType === 'number') return messageType === 0;
  const normalized = String(messageType).toLowerCase();
  return normalized === 'incoming' || normalized === '0';
}

function previewContent(content: string | null | undefined, max = 120): string {
  const text = (content ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function matchesHandover(content: string, keywords: string[]): boolean {
  const lower = content.toLowerCase();
  return keywords.some((kw) => {
    const needle = kw.trim().toLowerCase();
    return needle.length > 0 && lower.includes(needle);
  });
}

async function persistEvent(
  ctx: ProcessLogContext,
  settings: ChatwootBotSettings,
  fields: {
    action: ChatwootBotEventRecord['action'];
    reason: string;
    conversationId: number | null;
    messageId: number | null;
    contentPreview: string;
    dryRun: boolean;
    details?: string;
  },
): Promise<ChatwootBotEventRecord> {
  return chatwootBotEventLogService.append({
    source: ctx.source,
    action: fields.action,
    reason: fields.reason,
    conversationId: fields.conversationId,
    messageId: fields.messageId,
    contentPreview: fields.contentPreview,
    replyMode: settings.replyMode,
    dryRun: fields.dryRun,
    details: fields.details,
    webhookEvent: ctx.webhookEvent,
    headersMeta: ctx.headersMeta,
    payload: ctx.payload,
  });
}

export class ChatwootBotOrchestrator {
  async processWebhook(
    payload: ChatwootWebhookMessageCreated,
    options: {
      source?: ChatwootBotEventSource;
      headersMeta?: ChatwootBotWebhookHeadersMeta | null;
    } = {},
  ): Promise<ChatwootBotProcessResult> {
    const settings = await chatwootBotSettingsService.getSettings();
    const dryRun = settings.replyMode === 'dry_run';
    const source = options.source ?? 'webhook';
    const logCtx: ProcessLogContext = {
      source,
      headersMeta: options.headersMeta,
      payload,
      webhookEvent: payload.event ?? null,
    };
    const conversationId = payload.conversation?.id ?? null;
    const messageId = payload.id ?? null;
    const content = typeof payload.content === 'string' ? payload.content : '';
    const contentPreview = previewContent(content);

    const recordAndReturn = async (
      partial: Omit<ChatwootBotProcessResult, 'event' | 'success' | 'dryRun' | 'conversationId'> & {
        success?: boolean;
        details?: string;
        contentPreviewOverride?: string;
        messageIdOverride?: number | null;
      },
    ): Promise<ChatwootBotProcessResult> => {
      const event = await persistEvent(logCtx, settings, {
        action: partial.action,
        reason: partial.reason,
        conversationId,
        messageId: partial.messageIdOverride ?? messageId,
        contentPreview: partial.contentPreviewOverride ?? contentPreview,
        dryRun,
        details: partial.details,
      });
      logServer(
        `[ChatwootBot] ${partial.action}: ${partial.reason}` +
          ` (conv=${conversationId}, source=${source}, dryRun=${dryRun})`,
      );
      return {
        success: partial.success ?? partial.action !== 'error',
        action: partial.action,
        reason: partial.reason,
        conversationId,
        dryRun,
        event,
      };
    };

    if (!settings.enabled) {
      return recordAndReturn({ action: 'ignored', reason: 'bot_disabled' });
    }

    if (payload.event && payload.event !== 'message_created') {
      return recordAndReturn({
        action: 'ignored',
        reason: `unsupported_event:${payload.event}`,
      });
    }

    if (payload.private === true) {
      return recordAndReturn({ action: 'ignored', reason: 'private_message' });
    }

    if (!isIncomingMessageType(payload.message_type)) {
      return recordAndReturn({ action: 'ignored', reason: 'not_incoming' });
    }

    const senderType = String(payload.sender?.type ?? '').toLowerCase();
    if (senderType && senderType !== 'contact') {
      return recordAndReturn({
        action: 'ignored',
        reason: `sender_not_contact:${senderType || 'unknown'}`,
      });
    }

    if (!conversationId) {
      return recordAndReturn({ action: 'error', reason: 'missing_conversation_id', success: false });
    }

    if (matchesHandover(content, settings.handoverKeywords)) {
      return this.handleHandover(
        settings,
        logCtx,
        conversationId,
        dryRun,
        contentPreview,
        messageId,
      );
    }

    return this.handleEcho(settings, logCtx, conversationId, dryRun, contentPreview, messageId);
  }

  private async handleEcho(
    settings: ChatwootBotSettings,
    logCtx: ProcessLogContext,
    conversationId: number,
    dryRun: boolean,
    contentPreview: string,
    messageId: number | null,
  ): Promise<ChatwootBotProcessResult> {
    const echoText = settings.echoMessage;
    const source = logCtx.source;

    if (dryRun) {
      const event = await persistEvent(logCtx, settings, {
        action: 'echo',
        reason: 'dry_run_echo',
        conversationId,
        messageId,
        contentPreview,
        dryRun: true,
        details: `Would send: ${previewContent(echoText, 200)}`,
      });
      logServer(
        `[ChatwootBot] echo dry_run conv=${conversationId} source=${source}: ${previewContent(echoText, 80)}`,
      );
      return {
        success: true,
        action: 'echo',
        reason: 'dry_run_echo',
        conversationId,
        dryRun: true,
        event,
      };
    }

    try {
      const client = createChatwootApiClient({
        baseUrl: settings.baseUrl,
        accountId: settings.accountId,
        apiAccessToken: settings.apiAccessToken,
      });
      await client.createOutgoingMessage(conversationId, echoText, false);
      const event = await persistEvent(logCtx, settings, {
        action: 'echo',
        reason: 'echo_sent',
        conversationId,
        messageId,
        contentPreview,
        dryRun: false,
        details: previewContent(echoText, 200),
      });
      logServer(`[ChatwootBot] echo sent conv=${conversationId}`);
      return {
        success: true,
        action: 'echo',
        reason: 'echo_sent',
        conversationId,
        dryRun: false,
        event,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logServer('[ChatwootBot] echo failed', err);
      const event = await persistEvent(logCtx, settings, {
        action: 'error',
        reason: 'echo_failed',
        conversationId,
        messageId,
        contentPreview,
        dryRun: false,
        details: message,
      });
      return {
        success: false,
        action: 'error',
        reason: 'echo_failed',
        conversationId,
        dryRun: false,
        event,
      };
    }
  }

  private async handleHandover(
    settings: ChatwootBotSettings,
    logCtx: ProcessLogContext,
    conversationId: number,
    dryRun: boolean,
    contentPreview: string,
    messageId: number | null,
  ): Promise<ChatwootBotProcessResult> {
    const note = 'Handover: клієнт запросив оператора (Agent Bot v0).';
    const source = logCtx.source;

    if (dryRun) {
      const event = await persistEvent(logCtx, settings, {
        action: 'handover',
        reason: 'dry_run_handover',
        conversationId,
        messageId,
        contentPreview,
        dryRun: true,
        details: 'Would toggle_status=open + private note + unassign',
      });
      logServer(`[ChatwootBot] handover dry_run conv=${conversationId} source=${source}`);
      return {
        success: true,
        action: 'handover',
        reason: 'dry_run_handover',
        conversationId,
        dryRun: true,
        event,
      };
    }

    try {
      const client = createChatwootApiClient({
        baseUrl: settings.baseUrl,
        accountId: settings.accountId,
        apiAccessToken: settings.apiAccessToken,
      });
      await client.toggleStatusOpen(conversationId);
      try {
        await client.createOutgoingMessage(conversationId, note, true);
      } catch (noteErr) {
        logServer('[ChatwootBot] handover private note failed (non-fatal)', noteErr);
      }
      await client.unassignConversation(conversationId);

      const event = await persistEvent(logCtx, settings, {
        action: 'handover',
        reason: 'handover_done',
        conversationId,
        messageId,
        contentPreview,
        dryRun: false,
        details: 'status=open',
      });
      logServer(`[ChatwootBot] handover done conv=${conversationId}`);
      return {
        success: true,
        action: 'handover',
        reason: 'handover_done',
        conversationId,
        dryRun: false,
        event,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logServer('[ChatwootBot] handover failed', err);
      const event = await persistEvent(logCtx, settings, {
        action: 'error',
        reason: 'handover_failed',
        conversationId,
        messageId,
        contentPreview,
        dryRun: false,
        details: message,
      });
      return {
        success: false,
        action: 'error',
        reason: 'handover_failed',
        conversationId,
        dryRun: false,
        event,
      };
    }
  }
}

export const chatwootBotOrchestrator = new ChatwootBotOrchestrator();
