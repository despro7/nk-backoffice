import { logServer } from '../../lib/utils.js';
import {
  CHATWOOT_BOT_ATTR_CALLBACK_PHONE,
  CHATWOOT_BOT_ATTR_CALLBACK_REQUESTED,
  CHATWOOT_BOT_ATTR_HUMAN_HANDOVER_ACTIVE,
  CHATWOOT_BOT_ATTR_OOH_CALLBACK_PENDING,
  CHATWOOT_BOT_HANDOVER_BUILD,
  type ChatwootBotEventRecord,
  type ChatwootBotEventSource,
  type ChatwootBotProcessResult,
  type ChatwootBotReclaimReason,
  type ChatwootBotSettings,
  CHATWOOT_WEBHOOK_PROBE_CONTENT_MARKER,
  type ChatwootBotWebhookHeadersMeta,
  type ChatwootWebhookMessageCreated,
} from '../../../shared/types/chatwootBot.js';
import {
  botMessagingCredentials,
  handoverAssignmentCredentials,
  hasHandoverUserPat,
} from './chatwootCredentials.js';
import { createChatwootApiClient } from './ChatwootApiClient.js';
import {
  extractCallbackPhone,
  getConversationHumanAssigneeId,
  isConversationHandledByHuman,
  isOohCallbackPending,
  isWithinHandoverHours,
  matchesCallbackIntent,
  matchesEmergency,
  matchesHandover,
  resolveHandoverAssigneeId,
  shouldPersistEvent,
} from './ChatwootBotHandoverUtils.js';
import { chatwootBotAnalyticsService } from './ChatwootBotAnalyticsService.js';
import { evaluateHumanHandoverReclaim } from './chatwootReclaimDecision.js';
import { resetHumanHandoverOnConversation } from './chatwootHandoverReset.js';
import { chatwootBotEventLogService } from './ChatwootBotEventLogService.js';
import { chatwootBotInboxHoursService } from './ChatwootBotInboxHoursService.js';
import { chatwootBotSettingsService } from './ChatwootBotSettingsService.js';
import { sanitizeChatwootApiToken } from './chatwootHttp.js';
import { resolveConversationApiId } from './chatwootConversationId.js';
import { assignHumanAgentWithBotFallback } from './chatwootHandoverAssign.js';
import { ChatwootHandoverTrace } from './chatwootHandoverTrace.js';
import { getChatwootProcessorStamp } from './chatwootProcessorStamp.js';
import { runWithConversationLock } from './conversationWebhookQueue.js';
import {
  claimHumanAgentActivePersistSlot,
  releaseHumanAgentActivePersistSlot,
} from './humanAgentActivePersistGate.js';
import { chatwootBotReplyRouter } from './ChatwootBotReplyRouter.js';
import { isDuplicateWebhookMessage } from './webhookMessageDedup.js';

type ProcessLogContext = {
  source: ChatwootBotEventSource;
  headersMeta?: ChatwootBotWebhookHeadersMeta | null;
  payload: ChatwootWebhookMessageCreated;
  webhookEvent: string | null;
};

export function isConversationResolvedStatusEvent(
  payload: ChatwootWebhookMessageCreated,
): boolean {
  const event = String(payload.event ?? '').toLowerCase();
  if (event === 'conversation_resolved') return true;
  if (event === 'conversation_status_changed') {
    const status = String(payload.conversation?.status ?? '').toLowerCase();
    return status === 'resolved';
  }
  return false;
}

export function isAgentPublicOutgoingMessage(payload: ChatwootWebhookMessageCreated): boolean {
  if (payload.private === true) return false;
  const senderType = String(payload.sender?.type ?? '').toLowerCase();
  if (senderType !== 'user') return false;
  if (isIncomingMessageType(payload.message_type)) return false;
  const mt = payload.message_type;
  if (typeof mt === 'number') return mt === 1;
  if (mt === undefined || mt === null) return false;
  const normalized = String(mt).toLowerCase();
  return normalized === 'outgoing' || normalized === '1';
}

function isIncomingMessageType(messageType: string | number | undefined): boolean {
  if (messageType === undefined || messageType === null) return false;
  if (typeof messageType === 'number') return messageType === 0;
  const normalized = String(messageType).toLowerCase();
  return normalized === 'incoming' || normalized === '0';
}

/** Agent Bot / частина account webhook не передає message_type – лише contact + text. */
export function isIncomingContactMessage(payload: ChatwootWebhookMessageCreated): boolean {
  if (payload.private === true) return false;
  if (isIncomingMessageType(payload.message_type)) return true;

  const event = payload.event ?? 'message_created';
  if (event !== 'message_created') return false;

  const senderType = String(payload.sender?.type ?? '').toLowerCase();
  if (senderType && senderType !== 'contact') return false;

  if (payload.message_type === undefined || payload.message_type === null) {
    return Boolean(String(payload.content ?? '').trim());
  }
  return false;
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
    const conversationId = resolveConversationApiId(payload);
    if (conversationId != null) {
      return runWithConversationLock(conversationId, () =>
        this.processWebhookUnlocked(payload, options),
      );
    }
    return this.processWebhookUnlocked(payload, options);
  }

  private async processWebhookUnlocked(
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
    const conversationId = resolveConversationApiId(payload);
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
      const persist =
        partial.persist ??
        shouldPersistEvent(partial.action, partial.reason, {
          persistPrivate: settings.eventLogPersistPrivate,
          persistOtherNoise: settings.eventLogPersistOtherNoise,
        });
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

    if (content.includes(CHATWOOT_WEBHOOK_PROBE_CONTENT_MARKER)) {
      logServer(
        `[ChatwootBot] webhook probe OK conv=${conversationId ?? 'n/a'} (без echo в Chatwoot)`,
      );
      return finish({
        action: 'ignored',
        reason: 'webhook_probe',
        details: 'Доставка webhook OK – echo не викликається для probe',
        persist: true,
      });
    }

    if (isConversationResolvedStatusEvent(payload)) {
      if (!conversationId) {
        return finish({ action: 'error', reason: 'missing_conversation_id', success: false });
      }
      if (!settings.resolveCleanupEnabled) {
        return finish({
          action: 'ignored',
          reason: 'resolve_cleanup_disabled',
          persist: false,
          logLine: false,
        });
      }
      const reset = await resetHumanHandoverOnConversation(settings, conversationId, dryRun);
      releaseHumanAgentActivePersistSlot(conversationId);
      chatwootBotAnalyticsService.recordBestEffort({
        kind: 'resolved',
        conversationId,
        inboxId:
          payload.conversation?.inbox_id ??
          payload.inbox?.id ??
          settings.handoverDefaultInboxId ??
          null,
      });
      return finish({
        action: 'ignored',
        reason: 'resolve_cleanup',
        details: `unassign=${reset.unassigned}; attr_cleared=${reset.humanHandoverAttrCleared}; typing_off=${reset.typingOff}`,
      });
    }

    if (!settings.enabled) {
      logServer(
        `[ChatwootBot] webhook ignored: bot_disabled conv=${conversationId ?? 'n/a'} msg=${messageId ?? 'n/a'} (увімкніть «Бот увімкнено»)`,
      );
      return finish({ action: 'ignored', reason: 'bot_disabled' });
    }

    if (payload.event && payload.event !== 'message_created') {
      return finish({
        action: 'ignored',
        reason: `unsupported_event:${payload.event}`,
      });
    }

    if (payload.private === true) {
      return finish({ action: 'ignored', reason: 'private_message' });
    }

    if (!isIncomingContactMessage(payload)) {
      if (isAgentPublicOutgoingMessage(payload) && conversationId) {
        chatwootBotAnalyticsService.recordBestEffort({
          kind: 'agent_message',
          conversationId,
          messageId,
          inboxId:
            payload.conversation?.inbox_id ??
            payload.inbox?.id ??
            settings.handoverDefaultInboxId ??
            null,
          agentId: payload.sender?.id ?? null,
          content,
        });
      }
      return finish({ action: 'ignored', reason: 'not_incoming' });
    }

    if (source === 'webhook' && isDuplicateWebhookMessage(messageId)) {
      return finish({
        action: 'ignored',
        reason: 'duplicate_message',
        persist: false,
        logLine: false,
      });
    }

    const senderType = String(payload.sender?.type ?? '').toLowerCase();
    if (senderType && senderType !== 'contact') {
      return finish({
        action: 'ignored',
        reason: `sender_not_contact:${senderType || 'unknown'}`,
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
      undefined,
      { skipCache: true },
    );
    const inHours = hoursResult.inHours;

    chatwootBotAnalyticsService.recordBestEffort({
      kind: 'customer_message',
      conversationId,
      messageId,
      inboxId,
      content,
      inHours,
    });

    const customAttrsEarly = getConversationCustomAttributes(payload);
    if (isConversationHandledByHuman(payload, customAttrsEarly)) {
      const reclaimDecision = await evaluateHumanHandoverReclaim(
        settings,
        payload,
        conversationId,
        inHours,
      );
      if (!reclaimDecision.shouldReclaim) {
        let typingOff: 'ok' | 'fail' | 'skipped' | 'dry_run' = 'skipped';
        if (dryRun) {
          typingOff = 'dry_run';
        } else if (
          settings.baseUrl.trim() &&
          sanitizeChatwootApiToken(settings.apiAccessToken)
        ) {
          const client = createChatwootApiClient(botMessagingCredentials(settings));
          const ok = await client.toggleTypingStatusBestEffort(conversationId, 'off');
          typingOff = ok ? 'ok' : 'fail';
        }

        const persist = claimHumanAgentActivePersistSlot(conversationId);
        return finish({
          action: 'ignored',
          reason: 'human_agent_active',
          persist,
          logLine: true,
          details: `human assignee; typing_off=${typingOff}${persist ? '' : '; journal=dedup'}`,
        });
      }

      const assigneeId = getConversationHumanAssigneeId(payload);
      const reclaimResult = await this.performHardReclaim(
        settings,
        logCtx,
        conversationId,
        dryRun,
        contentPreview,
        messageId,
        reclaimDecision.reason,
        reclaimDecision.publicMessage,
        assigneeId,
        inHours,
      );
      if (!reclaimResult.continueFlow) {
        return reclaimResult.result!;
      }
    }
    const hoursLog = `hours=${inHours ? 'in' : 'ooh'};source=${hoursResult.source};inbox=${inboxId ?? 'n/a'}`;
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
        hoursLog,
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
        hoursLog,
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
        hoursLog,
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

    return chatwootBotReplyRouter.route({
      settings,
      logCtx,
      conversationId,
      dryRun,
      contentPreview,
      messageId,
      content: content,
      payload,
    });
  }

  private async performHardReclaim(
    settings: ChatwootBotSettings,
    logCtx: ProcessLogContext,
    conversationId: number,
    dryRun: boolean,
    contentPreview: string,
    messageId: number | null,
    reason: ChatwootBotReclaimReason,
    publicMessage: string,
    assigneeId: number | null,
    inHours: boolean,
  ): Promise<{ continueFlow: boolean; result?: ChatwootBotProcessResult }> {
    releaseHumanAgentActivePersistSlot(conversationId);
    chatwootBotAnalyticsService.recordBestEffort({
      kind: 'reclaim',
      conversationId,
      messageId,
      agentId: assigneeId,
      inHours,
      meta: { reason, assigneeId },
    });

    const continueFlow = settings.reclaimContinueWithEcho;

    if (dryRun) {
      const event = await persistEvent(logCtx, settings, {
        action: 'handover',
        reason: `dry_run_${reason}`,
        conversationId,
        messageId,
        contentPreview,
        dryRun: true,
        details: `Would reclaim + public: ${previewContent(publicMessage, 120)}`,
      });
      logServer(`[ChatwootBot] reclaim dry_run ${reason} conv=${conversationId}`);
      return {
        continueFlow,
        result: continueFlow
          ? undefined
          : {
              success: true,
              action: 'handover',
              reason: `dry_run_${reason}`,
              conversationId,
              dryRun: true,
              event,
            },
      };
    }

    try {
      const reset = await resetHumanHandoverOnConversation(settings, conversationId, false);
      const botClient = createChatwootApiClient(botMessagingCredentials(settings));
      await botClient.createOutgoingMessage(conversationId, publicMessage, false);
      const event = await persistEvent(logCtx, settings, {
        action: 'handover',
        reason,
        conversationId,
        messageId,
        contentPreview,
        dryRun: false,
        details: `reclaim; typing_off=${reset.typingOff}; msg=${previewContent(publicMessage, 120)}`,
      });
      logServer(`[ChatwootBot] reclaim ${reason} conv=${conversationId}`);
      return {
        continueFlow,
        result: continueFlow
          ? undefined
          : {
              success: true,
              action: 'handover',
              reason,
              conversationId,
              dryRun: false,
              event,
            },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logServer('[ChatwootBot] reclaim failed', err);
      const event = await persistEvent(logCtx, settings, {
        action: 'error',
        reason: `${reason}_failed`,
        conversationId,
        messageId,
        contentPreview,
        dryRun: false,
        details: message,
      });
      return {
        continueFlow: false,
        result: {
          success: false,
          action: 'error',
          reason: `${reason}_failed`,
          conversationId,
          dryRun: false,
          event,
        },
      };
    }
  }

  private async handleEcho(
    settings: ChatwootBotSettings,
    logCtx: ProcessLogContext,
    conversationId: number,
    dryRun: boolean,
    contentPreview: string,
    messageId: number | null,
  ): Promise<ChatwootBotProcessResult> {
    const echoText = settings.fallbackMessage || settings.echoMessage;
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
      const client = createChatwootApiClient(botMessagingCredentials(settings));
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
    hoursLog?: string,
  ): Promise<ChatwootBotProcessResult> {
    const assigneeId = resolveHandoverAssigneeId(settings);
    const assignDetail =
      settings.handoverAssignMode === 'auto_inbox'
        ? 'assign=auto_inbox'
        : assigneeId
          ? `assignee=#${assigneeId}`
          : 'assignee=none';
    const dryReason = 'dry_run_handover';
    const doneReason = 'handover_done';
    const detailsPrefix = hoursLog ? `mode=${mode} · ${hoursLog}` : `mode=${mode}`;

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
          (settings.handoverAssignMode === 'auto_inbox'
            ? 'auto inbox assignment'
            : assigneeId
              ? `assign #${assigneeId}`
              : 'unassign'),
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
      const botClient = createChatwootApiClient(botMessagingCredentials(settings));
      const patClient = hasHandoverUserPat(settings)
        ? createChatwootApiClient(handoverAssignmentCredentials(settings))
        : null;
      const trace = new ChatwootHandoverTrace();
      trace.plan(`${assignDetail} · build=${CHATWOOT_BOT_HANDOVER_BUILD}`);
      let step = 'assign';
      let verifiedAssignee: number | null = null;
      let assignVia: 'bot' | 'pat' | 'auto' | 'none' = 'none';
      try {
        const isAuto = settings.handoverAssignMode === 'auto_inbox' || !assigneeId;
        if (isAuto) {
          step = 'bot_handoff';
          trace.ok('bot_handoff:start');
          await botClient.botHandoffOpen(conversationId);
          trace.ok('bot_handoff:ok');
          step = 'auto_inbox_check';
          trace.ok('auto_inbox:check_assignee');
          verifiedAssignee =
            (await botClient.getConversationAssigneeId(conversationId)) ??
            (patClient ? await patClient.getConversationAssigneeId(conversationId) : null);
          assignVia = 'auto';
          if (verifiedAssignee != null) {
            trace.ok(`auto_inbox:assignee=#${verifiedAssignee}`);
          } else {
            trace.skip('auto_inbox:assignee=none (увімкніть auto assignment у inbox Chatwoot)');
          }
        } else {
          step = 'assign';
          trace.ok(`assign:start target=#${assigneeId}`);
          const assignResult = await assignHumanAgentWithBotFallback(
            conversationId,
            assigneeId,
            botClient,
            patClient,
          );
          verifiedAssignee = assignResult.assigneeId;
          assignVia = assignResult.via;
          trace.ok(`assign:via_${assignResult.via}`);
          if (verifiedAssignee != null) {
            trace.ok(`assign:verified=#${verifiedAssignee}`);
          } else {
            trace.skip('assign:verified=none');
          }
          if (verifiedAssignee !== assigneeId) {
            logServer(
              `[ChatwootBot] assign verify conv=${conversationId} expected=${assigneeId} got=${verifiedAssignee ?? 'null'}`,
            );
          }
        }
        step = 'public_message';
        trace.ok('public_message:start');
        await botClient.createOutgoingMessage(conversationId, publicMessage, false);
        trace.ok('public_message:ok');
        step = 'private_note';
        try {
          await botClient.createOutgoingMessage(conversationId, privateNote, true);
          trace.ok('private_note:ok');
        } catch (noteErr) {
          trace.skip('private_note:failed');
          logServer('[ChatwootBot] handover private note failed (non-fatal)', noteErr);
        }
      } catch (stepErr) {
        const base = stepErr instanceof Error ? stepErr.message : String(stepErr);
        throw new Error(`handover step=${step} · ${trace.toDetailsFragment()} · ${base}`);
      }

      step = 'custom_attributes';
      try {
        await botClient.mergeConversationCustomAttributesBestEffort(conversationId, {
          [CHATWOOT_BOT_ATTR_OOH_CALLBACK_PENDING]: false,
          [CHATWOOT_BOT_ATTR_HUMAN_HANDOVER_ACTIVE]: true,
        });
        trace.ok('custom_attributes:ok');
      } catch (attrErr) {
        trace.skip('custom_attributes:failed');
        logServer('[ChatwootBot] handover custom attributes failed (non-fatal)', attrErr);
      }

      const assignSummary =
        assignVia === 'auto'
          ? verifiedAssignee != null
            ? `auto_inbox:#${verifiedAssignee}`
            : 'auto_inbox:none'
          : `manual:${assignVia}:#${verifiedAssignee ?? assigneeId ?? '?'}`;

      const event = await persistEvent(logCtx, settings, {
        action: 'handover',
        reason: doneReason,
        conversationId,
        messageId,
        contentPreview,
        dryRun: false,
        details: `${detailsPrefix} · ${assignSummary} · ${trace.toDetailsFragment()}`,
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
      const processor = getChatwootProcessorStamp();
      logServer(`[ChatwootBot] handover failed · ${processor}`, err);
      const event = await persistEvent(logCtx, settings, {
        action: 'error',
        reason: 'handover_failed',
        conversationId,
        messageId,
        contentPreview,
        dryRun: false,
        details: `${processor} · ${message}`,
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
    hoursLog?: string,
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
        details:
          (hoursLog ? `${hoursLog} · ` : '') +
          'Would send OOH offer + set callback pending (bot stays assignee)',
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
      const client = createChatwootApiClient(botMessagingCredentials(settings));
      let step = 'public_message';
      try {
        await client.createOutgoingMessage(conversationId, publicMessage, false);
        step = 'custom_attributes';
        await client.mergeConversationCustomAttributesBestEffort(conversationId, {
          [CHATWOOT_BOT_ATTR_OOH_CALLBACK_PENDING]: true,
        });
        step = 'private_note';
        try {
          await client.createOutgoingMessage(
            conversationId,
            'Handover OOH: клієнт просив оператора поза робочими годинами – очікуємо контакти або допомогу бота.',
            true,
          );
        } catch (noteErr) {
          logServer('[ChatwootBot] ooh_offer private note failed (non-fatal)', noteErr);
        }
      } catch (stepErr) {
        const base = stepErr instanceof Error ? stepErr.message : String(stepErr);
        throw new Error(`ooh step=${step}: ${base}`);
      }

      const event = await persistEvent(logCtx, settings, {
        action: 'handover',
        reason: liveReason,
        conversationId,
        messageId,
        contentPreview,
        dryRun: false,
        details: hoursLog ? `${hoursLog} · bot_stays_assignee` : 'bot_stays_assignee',
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
      const client = createChatwootApiClient(botMessagingCredentials(settings));
      if (contactId && phone) {
        await client.updateContact(contactId, { phone_number: phone });
      }
      await client.mergeConversationCustomAttributesBestEffort(conversationId, {
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
