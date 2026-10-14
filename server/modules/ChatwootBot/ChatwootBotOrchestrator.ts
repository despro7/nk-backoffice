import { logServer } from '../../lib/utils.js';
import {
  CHATWOOT_BOT_ATTR_CALLBACK_PHONE,
  CHATWOOT_BOT_ATTR_CALLBACK_REQUESTED,
  CHATWOOT_BOT_ATTR_OOH_CALLBACK_PENDING,
  type ChatwootBotEventRecord,
  type ChatwootBotEventSource,
  type ChatwootBotProcessResult,
  type ChatwootBotSettings,
  type ChatwootBotWebhookHeadersMeta,
  type ChatwootWebhookMessageCreated,
} from '../../../shared/types/chatwootBot.js';
import { createChatwootApiClient } from './ChatwootApiClient.js';
import {
  extractCallbackPhone,
  isOohCallbackPending,
  isWithinHandoverHours,
  matchesCallbackIntent,
  matchesEmergency,
  matchesHandover,
  shouldPersistEvent,
} from './ChatwootBotHandoverUtils.js';
import { chatwootBotEventLogService } from './ChatwootBotEventLogService.js';
import { chatwootBotInboxHoursService } from './ChatwootBotInboxHoursService.js';
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

function syntheticEvent(
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
): ChatwootBotEventRecord {
  return {
    id: 'skipped',
    at: new Date().toISOString(),
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
    headersMeta: ctx.headersMeta ?? null,
    payloadJson: null,
  };
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

function getConversationCustomAttributes(
  payload: ChatwootWebhookMessageCreated,
): Record<string, unknown> {
  const attrs = payload.conversation?.custom_attributes;
  return attrs && typeof attrs === 'object' ? attrs : {};
}

function getContactId(payload: ChatwootWebhookMessageCreated): number | null {
  const senderId = payload.sender?.id;
  if (senderId && payload.sender?.type?.toLowerCase() === 'contact') return senderId;
  const metaId = payload.conversation?.meta?.sender?.id;
  return metaId ?? null;
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

    const finish = async (
      partial: Omit<ChatwootBotProcessResult, 'event' | 'success' | 'dryRun' | 'conversationId'> & {
        success?: boolean;
        details?: string;
        contentPreviewOverride?: string;
        messageIdOverride?: number | null;
        persist?: boolean;
        logLine?: boolean;
      },
    ): Promise<ChatwootBotProcessResult> => {
      const persist = partial.persist ?? shouldPersistEvent(partial.action, partial.reason);
      const eventFields = {
        action: partial.action,
        reason: partial.reason,
        conversationId,
        messageId: partial.messageIdOverride ?? messageId,
        contentPreview: partial.contentPreviewOverride ?? contentPreview,
        dryRun,
        details: partial.details,
      };
      const event = persist
        ? await persistEvent(logCtx, settings, eventFields)
        : syntheticEvent(logCtx, settings, eventFields);

      if (partial.logLine ?? persist) {
        logServer(
          `[ChatwootBot] ${partial.action}: ${partial.reason}` +
            ` (conv=${conversationId}, source=${source}, dryRun=${dryRun})`,
        );
      }

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
      return finish({ action: 'ignored', reason: 'bot_disabled' });
    }

    if (payload.event && payload.event !== 'message_created') {
      return finish({
        action: 'ignored',
        reason: `unsupported_event:${payload.event}`,
        persist: false,
        logLine: false,
      });
    }

    if (payload.private === true) {
      return finish({ action: 'ignored', reason: 'private_message', persist: false, logLine: false });
    }

    if (!isIncomingMessageType(payload.message_type)) {
      return finish({ action: 'ignored', reason: 'not_incoming', persist: false, logLine: false });
    }

    const senderType = String(payload.sender?.type ?? '').toLowerCase();
    if (senderType && senderType !== 'contact') {
      return finish({
        action: 'ignored',
        reason: `sender_not_contact:${senderType || 'unknown'}`,
        persist: false,
        logLine: false,
      });
    }

    if (!conversationId) {
      return finish({ action: 'error', reason: 'missing_conversation_id', success: false });
    }

    const inboxId =
      payload.conversation?.inbox_id ??
      payload.inbox?.id ??
      settings.handoverDefaultInboxId ??
      null;
    const hoursResult = await chatwootBotInboxHoursService.isWithinBusinessHours(
      settings,
      inboxId,
    );
    const inHours = hoursResult.inHours;
    const handoverKw = matchesHandover(content, settings.handoverKeywords);
    const emergency = matchesEmergency(content, settings);
    const customAttrs = getConversationCustomAttributes(payload);
    const callbackPending = isOohCallbackPending(customAttrs);

    if (!inHours && emergency) {
      return this.handleAgentAssign(
        settings,
        logCtx,
        conversationId,
        dryRun,
        contentPreview,
        messageId,
        settings.handoverMessageEmergency,
        'emergency',
        'Handover: екстрений виклик поза робочими годинами.',
      );
    }

    if (handoverKw && inHours) {
      return this.handleAgentAssign(
        settings,
        logCtx,
        conversationId,
        dryRun,
        contentPreview,
        messageId,
        settings.handoverMessageInHours,
        'in_hours',
        'Handover: клієнт запросив оператора (робочі години).',
      );
    }

    if (handoverKw && !inHours) {
      return this.handleOohOffer(
        settings,
        logCtx,
        conversationId,
        dryRun,
        contentPreview,
        messageId,
      );
    }

    if (!inHours && callbackPending) {
      const phone = extractCallbackPhone(content);
      const hasCallbackSignal = phone !== null || matchesCallbackIntent(content);
      if (hasCallbackSignal) {
        return this.handleOohCallback(
          settings,
          logCtx,
          payload,
          conversationId,
          dryRun,
          contentPreview,
          messageId,
          content,
          phone,
        );
      }
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

  private async handleAgentAssign(
    settings: ChatwootBotSettings,
    logCtx: ProcessLogContext,
    conversationId: number,
    dryRun: boolean,
    contentPreview: string,
    messageId: number | null,
    publicMessage: string,
    mode: 'in_hours' | 'emergency',
    privateNote: string,
  ): Promise<ChatwootBotProcessResult> {
    const assigneeId = settings.handoverAssigneeId;
    const dryReason = 'dry_run_handover';
    const doneReason = 'handover_done';
    const detailsPrefix = `mode=${mode}`;

    if (dryRun) {
      const event = await persistEvent(logCtx, settings, {
        action: 'handover',
        reason: dryReason,
        conversationId,
        messageId,
        contentPreview,
        dryRun: true,
        details:
          `${detailsPrefix} · would public msg + open + ` +
          (assigneeId ? `assign #${assigneeId}` : 'unassign'),
      });
      logServer(`[ChatwootBot] handover dry_run conv=${conversationId} ${detailsPrefix}`);
      return {
        success: true,
        action: 'handover',
        reason: dryReason,
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
      await client.createOutgoingMessage(conversationId, publicMessage, false);
      await client.toggleStatusOpen(conversationId);
      if (assigneeId) {
        await client.assignConversation(conversationId, assigneeId);
      } else {
        await client.unassignConversation(conversationId);
      }
      try {
        await client.createOutgoingMessage(conversationId, privateNote, true);
      } catch (noteErr) {
        logServer('[ChatwootBot] handover private note failed (non-fatal)', noteErr);
      }
      await client.mergeConversationCustomAttributes(conversationId, {
        [CHATWOOT_BOT_ATTR_OOH_CALLBACK_PENDING]: false,
      });

      const event = await persistEvent(logCtx, settings, {
        action: 'handover',
        reason: doneReason,
        conversationId,
        messageId,
        contentPreview,
        dryRun: false,
        details: assigneeId
          ? `${detailsPrefix} · assignee=#${assigneeId}`
          : `${detailsPrefix} · assignee=none`,
      });
      logServer(`[ChatwootBot] handover done conv=${conversationId} ${detailsPrefix}`);
      return {
        success: true,
        action: 'handover',
        reason: doneReason,
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

  private async handleOohOffer(
    settings: ChatwootBotSettings,
    logCtx: ProcessLogContext,
    conversationId: number,
    dryRun: boolean,
    contentPreview: string,
    messageId: number | null,
  ): Promise<ChatwootBotProcessResult> {
    const publicMessage = settings.handoverMessageOutOfHours;
    const dryReason = 'dry_run_ooh_offer';
    const liveReason = 'ooh_offer';

    if (dryRun) {
      const event = await persistEvent(logCtx, settings, {
        action: 'handover',
        reason: dryReason,
        conversationId,
        messageId,
        contentPreview,
        dryRun: true,
        details: 'Would send OOH offer + set callback pending (bot stays assignee)',
      });
      logServer(`[ChatwootBot] ooh_offer dry_run conv=${conversationId}`);
      return {
        success: true,
        action: 'handover',
        reason: dryReason,
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
      await client.createOutgoingMessage(conversationId, publicMessage, false);
      await client.mergeConversationCustomAttributes(conversationId, {
        [CHATWOOT_BOT_ATTR_OOH_CALLBACK_PENDING]: true,
      });
      try {
        await client.createOutgoingMessage(
          conversationId,
          'Handover OOH: клієнт просив оператора поза робочими годинами — очікуємо контакти або допомогу бота.',
          true,
        );
      } catch (noteErr) {
        logServer('[ChatwootBot] ooh_offer private note failed (non-fatal)', noteErr);
      }

      const event = await persistEvent(logCtx, settings, {
        action: 'handover',
        reason: liveReason,
        conversationId,
        messageId,
        contentPreview,
        dryRun: false,
        details: 'bot_stays_assignee',
      });
      logServer(`[ChatwootBot] ooh_offer conv=${conversationId}`);
      return {
        success: true,
        action: 'handover',
        reason: liveReason,
        conversationId,
        dryRun: false,
        event,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logServer('[ChatwootBot] ooh_offer failed', err);
      const event = await persistEvent(logCtx, settings, {
        action: 'error',
        reason: 'ooh_offer_failed',
        conversationId,
        messageId,
        contentPreview,
        dryRun: false,
        details: message,
      });
      return {
        success: false,
        action: 'error',
        reason: 'ooh_offer_failed',
        conversationId,
        dryRun: false,
        event,
      };
    }
  }

  private async handleOohCallback(
    settings: ChatwootBotSettings,
    logCtx: ProcessLogContext,
    payload: ChatwootWebhookMessageCreated,
    conversationId: number,
    dryRun: boolean,
    contentPreview: string,
    messageId: number | null,
    content: string,
    phone: string | null,
  ): Promise<ChatwootBotProcessResult> {
    const ack = settings.handoverCallbackAckMessage;
    const contactId = getContactId(payload);
    const dryReason = 'dry_run_ooh_callback';
    const liveReason = 'ooh_callback_saved';

    if (dryRun) {
      const event = await persistEvent(logCtx, settings, {
        action: 'handover',
        reason: dryReason,
        conversationId,
        messageId,
        contentPreview,
        dryRun: true,
        details: `Would ack callback phone=${phone ?? 'n/a'}`,
      });
      logServer(`[ChatwootBot] ooh_callback dry_run conv=${conversationId}`);
      return {
        success: true,
        action: 'handover',
        reason: dryReason,
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
      if (contactId && phone) {
        await client.updateContact(contactId, { phone_number: phone });
      }
      await client.mergeConversationCustomAttributes(conversationId, {
        [CHATWOOT_BOT_ATTR_OOH_CALLBACK_PENDING]: false,
        [CHATWOOT_BOT_ATTR_CALLBACK_REQUESTED]: true,
        ...(phone ? { [CHATWOOT_BOT_ATTR_CALLBACK_PHONE]: phone } : {}),
      });
      await client.createOutgoingMessage(conversationId, ack, false);
      try {
        await client.createOutgoingMessage(
          conversationId,
          `Callback OOH: ${phone ?? 'без телефону'} · ${previewContent(content, 300)}`,
          true,
        );
      } catch (noteErr) {
        logServer('[ChatwootBot] ooh_callback private note failed (non-fatal)', noteErr);
      }

      const event = await persistEvent(logCtx, settings, {
        action: 'handover',
        reason: liveReason,
        conversationId,
        messageId,
        contentPreview,
        dryRun: false,
        details: phone ? `phone=${phone}` : 'intent_only',
      });
      logServer(`[ChatwootBot] ooh_callback_saved conv=${conversationId}`);
      return {
        success: true,
        action: 'handover',
        reason: liveReason,
        conversationId,
        dryRun: false,
        event,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logServer('[ChatwootBot] ooh_callback failed', err);
      const event = await persistEvent(logCtx, settings, {
        action: 'error',
        reason: 'ooh_callback_failed',
        conversationId,
        messageId,
        contentPreview,
        dryRun: false,
        details: message,
      });
      return {
        success: false,
        action: 'error',
        reason: 'ooh_callback_failed',
        conversationId,
        dryRun: false,
        event,
      };
    }
  }
}

export const chatwootBotOrchestrator = new ChatwootBotOrchestrator();
