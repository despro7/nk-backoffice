import { logServer } from '../../lib/utils.js';
import type {
  ChatwootBotEventSource,
  ChatwootBotProcessResult,
  ChatwootBotSettings,
  ChatwootWebhookMessageCreated,
} from '../../../shared/types/chatwootBot.js';
import type { LlmMessage } from '../../../shared/types/llm.js';
import { botMessagingCredentials, handoverAssignmentCredentials } from './chatwootCredentials.js';
import { buildLlmHistory } from './chatwootBotConversationContext.js';
import { createChatwootApiClient } from './ChatwootApiClient.js';
import { chatwootBotEventLogService } from './ChatwootBotEventLogService.js';
import { chatwootBotLlmRunner } from './ChatwootBotLlmRunner.js';
import { matchAutoReplyFromSettings } from './ChatwootBotPatternMatcher.js';
import { buildVerifyResultNote, chatwootBotVerifyService } from './ChatwootBotVerifyService.js';

type ProcessLogContext = {
  source: ChatwootBotEventSource;
  webhookEvent?: string | null;
  headersMeta?: unknown;
  payloadJson?: unknown | null;
};

function previewContent(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

async function persistEvent(
  logCtx: ProcessLogContext,
  settings: ChatwootBotSettings,
  fields: {
    action: 'echo' | 'handover' | 'ignored' | 'error';
    reason: string;
    conversationId: number | null;
    messageId: number | null;
    contentPreview: string;
    dryRun: boolean;
    details?: string;
  },
) {
  return chatwootBotEventLogService.append({
    source: logCtx.source,
    action: fields.action,
    reason: fields.reason,
    conversationId: fields.conversationId,
    messageId: fields.messageId,
    contentPreview: fields.contentPreview,
    replyMode: settings.replyMode,
    dryRun: fields.dryRun,
    details: fields.details,
    webhookEvent: logCtx.webhookEvent ?? null,
    headersMeta: (logCtx.headersMeta as never) ?? null,
    payload: logCtx.payloadJson ?? undefined,
  });
}

export type ChatwootBotReplyRouteInput = {
  settings: ChatwootBotSettings;
  logCtx: ProcessLogContext;
  conversationId: number;
  dryRun: boolean;
  contentPreview: string;
  messageId: number | null;
  content: string;
  payload: ChatwootWebhookMessageCreated;
};

export class ChatwootBotReplyRouter {
  async route(input: ChatwootBotReplyRouteInput): Promise<ChatwootBotProcessResult> {
    const {
      settings,
      logCtx,
      conversationId,
      dryRun,
      contentPreview,
      messageId,
      content,
      payload,
    } = input;

    const verify = await chatwootBotVerifyService.tryVerifyFromUserMessage(
      settings,
      payload,
      conversationId,
      content,
      messageId,
    );

    const pattern = matchAutoReplyFromSettings(content, settings);
    if (pattern) {
      return this.sendReply(
        settings,
        logCtx,
        conversationId,
        dryRun,
        contentPreview,
        messageId,
        pattern.reply,
        'pattern_match',
        `rule=${pattern.ruleId}`,
      );
    }

    const history = settings.aiEnabled
      ? await this.loadHistory(settings, conversationId, messageId)
      : [];
    const { text: llmText } = await chatwootBotLlmRunner.generateReply(settings, payload, content, {
      conversationState: verify.state,
      systemNote: verify.attempt ? buildVerifyResultNote(verify.attempt) : undefined,
      history,
    });
    if (llmText) {
      return this.sendReply(
        settings,
        logCtx,
        conversationId,
        dryRun,
        contentPreview,
        messageId,
        llmText,
        'llm_reply',
        'ai',
      );
    }

    const fallback = settings.fallbackMessage || settings.echoMessage;
    return this.sendReply(
      settings,
      logCtx,
      conversationId,
      dryRun,
      contentPreview,
      messageId,
      fallback,
      'fallback',
      'no_pattern_no_ai',
    );
  }

  /** Історія розмови з Chatwoot; помилка не блокує відповідь (LLM отримає лише поточне повідомлення). */
  private async loadHistory(
    settings: ChatwootBotSettings,
    conversationId: number,
    messageId: number | null,
  ): Promise<LlmMessage[]> {
    try {
      const client = createChatwootApiClient(handoverAssignmentCredentials(settings));
      const messages = await client.listConversationMessages(conversationId);
      return buildLlmHistory(messages, messageId);
    } catch (err) {
      logServer(`[ChatwootBot] history load failed conv=${conversationId} (non-fatal)`, err);
      return [];
    }
  }

  private async sendReply(
    settings: ChatwootBotSettings,
    logCtx: ProcessLogContext,
    conversationId: number,
    dryRun: boolean,
    contentPreview: string,
    messageId: number | null,
    text: string,
    reason: string,
    details: string,
  ): Promise<ChatwootBotProcessResult> {
    if (dryRun) {
      const event = await persistEvent(logCtx, settings, {
        action: 'echo',
        reason: `dry_run_${reason}`,
        conversationId,
        messageId,
        contentPreview,
        dryRun: true,
        details: `${details}: ${previewContent(text, 200)}`,
      });
      return {
        success: true,
        action: 'echo',
        reason: `dry_run_${reason}`,
        conversationId,
        dryRun: true,
        event,
      };
    }

    try {
      const client = createChatwootApiClient(botMessagingCredentials(settings));
      await client.createOutgoingMessage(conversationId, text, false);
      const event = await persistEvent(logCtx, settings, {
        action: 'echo',
        reason,
        conversationId,
        messageId,
        contentPreview,
        dryRun: false,
        details: `${details}: ${previewContent(text, 200)}`,
      });
      logServer(`[ChatwootBot] reply ${reason} conv=${conversationId}`);
      return {
        success: true,
        action: 'echo',
        reason,
        conversationId,
        dryRun: false,
        event,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logServer('[ChatwootBot] reply failed', err);
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
        success: false,
        action: 'error',
        reason: `${reason}_failed`,
        conversationId,
        dryRun: false,
        event,
      };
    }
  }
}

export const chatwootBotReplyRouter = new ChatwootBotReplyRouter();
