import type { LlmMessage, LlmProvider, LlmTestModelResponse } from '../../../shared/types/llm.js';
import type { ChatwootBotSettings, ChatwootWebhookMessageCreated } from '../../../shared/types/chatwootBot.js';
import { buildConversationContextNote } from './chatwootBotConversationContext.js';
import {
  activeVerifiedOrderIds,
  type ChatwootBotConversationStateSnapshot,
} from './chatwootBotConversationStateUtils.js';
import { logServer } from '../../lib/utils.js';
import { llmService } from '../../services/llm/LlmService.js';
import { llmSettingsService } from '../../services/llm/LlmSettingsService.js';
import { resolveLlmDefaultModel } from '../../services/llm/llmPlatformResolve.js';
import { completionToTestDiagnostics } from '../../../shared/utils/llmTestDiagnostics.js';
import { buildLlmTestWarnings } from '../../../shared/utils/llmTestWarnings.js';
import { chatwootBotCatalogToolService } from './ChatwootBotCatalogToolService.js';
import { chatwootBotOrderToolService } from './ChatwootBotOrderToolService.js';
import { chatwootBotKnowledgeService } from './ChatwootBotKnowledgeService.js';
import { chatwootBotAnalyticsService } from './ChatwootBotAnalyticsService.js';
import { chatwootBotVerifyService } from './ChatwootBotVerifyService.js';
import { isTrustedPhoneChannel } from './chatwootBotOrderLookup.js';
import { chatwootBotStorefrontSiteToolService } from './ChatwootBotStorefrontSiteToolService.js';
import { chatwootBotLlmToolDefinitions } from '../../../shared/constants/chatwootBotLlmTools.js';

const BOT_TOOLS = chatwootBotLlmToolDefinitions();

export type ChatwootBotGenerateReplyResult = {
  text: string | null;
  /** Стан розмови після ходу моделі (verify_customer міг його змінити). */
  conversationState?: ChatwootBotConversationStateSnapshot;
  /** verify_customer відповів rate_limited у цьому ході. */
  toolVerifyRateLimited?: boolean;
  /** Заповнюється після успішного виклику LLM (для адмін-тесту). */
  testMeta?: Omit<LlmTestModelResponse, 'reply'>;
};

export class ChatwootBotLlmRunner {
  async generateReply(
    settings: ChatwootBotSettings,
    payload: ChatwootWebhookMessageCreated,
    userContent: string,
    options?: {
      propagateErrors?: boolean;
      /** Стан розмови з БД (після верифікації в цьому ж повідомленні); без нього — неверифікована сесія. */
      conversationState?: ChatwootBotConversationStateSnapshot;
      /** Службовий блок, що додається до system prompt маски. */
      systemNote?: string;
      /** Попередні повідомлення розмови (без поточного). */
      history?: LlmMessage[];
      /** Потрібен для tool verify_customer (зберігає результат у стан розмови). */
      conversationId?: number;
      messageId?: number | null;
    },
  ): Promise<ChatwootBotGenerateReplyResult> {
    if (!settings.aiEnabled) return { text: null };

    const mask =
      settings.aiMasks.find((m) => m.id === settings.aiMaskId) ?? settings.aiMasks[0];
    if (!mask?.systemPrompt.trim()) return { text: null };

    const platform = await llmSettingsService.getSettings();
    const provider: LlmProvider | undefined =
      settings.aiProvider === 'openai' ||
      settings.aiProvider === 'google' ||
      settings.aiProvider === 'openrouter'
        ? settings.aiProvider
        : undefined;
    const model = settings.aiModel.trim() || undefined;
    const effectiveProvider = provider ?? platform.defaultProvider;
    const requestedModel =
      settings.aiModel.trim() || resolveLlmDefaultModel(platform, effectiveProvider);
    const now = new Date();
    const channelPhone = chatwootBotVerifyService.channelPhone(payload);
    const channelPhoneTrusted = Boolean(channelPhone) && isTrustedPhoneChannel(payload.conversation?.channel);
    // Стан змінюється, якщо модель пройде verify_customer у цьому ж ході.
    let state = options?.conversationState;
    let toolVerifyRateLimited = false;
    const verifiedIds = state ? activeVerifiedOrderIds(state, now.getTime()) : [];
    const contextNote = buildConversationContextNote({
      now,
      verifiedOrderCount: verifiedIds.length,
      verifyExpiresAt: verifiedIds.length && state?.verifyExpiresAt ? state.verifyExpiresAt.toISOString() : null,
      channelPhoneKnown: Boolean(channelPhone),
      channelPhoneTrusted,
      phoneOnFile: Boolean(state?.pendingPhone),
    });
    const system = [mask.systemPrompt, contextNote, options?.systemNote?.trim()]
      .filter((part): part is string => Boolean(part))
      .join('\n\n');
    const messages: LlmMessage[] = [...(options?.history ?? []), { role: 'user', content: userContent }];

    const started = Date.now();
    try {
      const result = await llmService.completeWithTools(
        {
          feature: 'chatwoot_bot_reply',
          provider,
          model,
          system,
          messages,
          maxOutputTokens: platform.maxOutputTokens,
          tools: BOT_TOOLS,
        },
        async (name, args) => {
          if (name === 'get_storefront_catalog') {
            const query = typeof args.query === 'string' ? args.query : undefined;
            const limit = typeof args.limit === 'number' ? args.limit : undefined;
            return await chatwootBotCatalogToolService.listStorefrontCatalog({ query, limit });
          }
          if (name === 'get_verified_order') {
            const orderNumber =
              typeof args.orderNumber === 'string' ? args.orderNumber : undefined;
            return await chatwootBotOrderToolService.getVerifiedOrderForSession(
              settings,
              {
                verifiedIds: state ? activeVerifiedOrderIds(state, Date.now()) : [],
                trustedPhone: channelPhoneTrusted ? channelPhone : null,
                unverifiedPhone: state?.pendingPhone ?? channelPhone,
              },
              orderNumber,
            );
          }
          if (name === 'verify_customer') {
            const conversationId = options?.conversationId;
            if (!state || conversationId == null) {
              return { verified: false, code: 'unavailable', hint: 'Перевірка доступна лише в розмові з клієнтом.' };
            }
            const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
            const { result, state: next } = await chatwootBotVerifyService.verifyFromTool(
              settings,
              conversationId,
              state,
              { phone: str(args.phone), orderNumber: str(args.orderNumber), dateFrom: str(args.dateFrom), dateTo: str(args.dateTo) },
              channelPhone,
              options?.messageId ?? null,
            );
            state = next;
            if (result.verified === false && result.code === 'rate_limited') toolVerifyRateLimited = true;
            return result;
          }
          if (name === 'search_knowledge_base') {
            const query = typeof args.query === 'string' ? args.query : '';
            const result = await chatwootBotKnowledgeService.searchForTool(query);
            // Запит від моделі (без PII за інструкцією tool) — для статистики «бот шукав і не знайшов».
            if (options?.conversationId != null && query.trim()) {
              chatwootBotAnalyticsService.recordBestEffort({
                kind: 'bot_action',
                conversationId: options.conversationId,
                messageId: options.messageId ?? null,
                content: query,
                meta: { kind: 'kb_lookup', found: result.found },
              });
            }
            return result;
          }
          if (name === 'get_storefront_site_pages') {
            return await chatwootBotStorefrontSiteToolService.listSitePages({
              query: typeof args.query === 'string' ? args.query : undefined,
              slugs: args.slugs,
              limit: typeof args.limit === 'number' ? args.limit : undefined,
            });
          }
          return { error: 'unknown_tool' };
        },
        { captureToolTrace: Boolean(options?.propagateErrors) },
      );
      const text = result.text.trim();
      const emptyReply = text.length === 0;
      const testMeta: Omit<LlmTestModelResponse, 'reply'> = completionToTestDiagnostics(
        requestedModel,
        result,
        Date.now() - started,
        {
          maskId: mask.id,
          maskName: mask.name,
          systemPromptChars: mask.systemPrompt.length,
          providerSource: settings.aiProvider ? 'override' : 'platform',
          warnings: emptyReply ? buildLlmTestWarnings({ finishReason: result.finishReason, emptyReply: true }) : undefined,
        },
      );
      return {
        text: emptyReply ? null : text,
        conversationState: state,
        toolVerifyRateLimited,
        testMeta,
      };
    } catch (error) {
      logServer('[ChatwootBotLlmRunner] generateReply failed', error);
      if (options?.propagateErrors) throw error;
      return { text: null };
    }
  }
}

export const chatwootBotLlmRunner = new ChatwootBotLlmRunner();
