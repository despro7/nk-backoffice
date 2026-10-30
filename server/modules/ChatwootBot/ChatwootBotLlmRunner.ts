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
import { chatwootBotStorefrontSiteToolService } from './ChatwootBotStorefrontSiteToolService.js';
import { chatwootBotLlmToolDefinitions } from '../../../shared/constants/chatwootBotLlmTools.js';

const BOT_TOOLS = chatwootBotLlmToolDefinitions();

export type ChatwootBotGenerateReplyResult = {
  text: string | null;
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
    const state = options?.conversationState;
    const verifiedIds = state ? activeVerifiedOrderIds(state, now.getTime()) : [];
    const contextNote = buildConversationContextNote({
      now,
      verifiedOrderCount: verifiedIds.length,
      verifyExpiresAt: verifiedIds.length && state?.verifyExpiresAt ? state.verifyExpiresAt.toISOString() : null,
      channelPhoneKnown: Boolean(payload.conversation?.meta?.sender?.phone_number?.trim()),
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
              verifiedIds,
              orderNumber,
            );
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
