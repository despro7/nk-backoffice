import type { LlmProvider } from '../../../shared/types/llm.js';
import type { ChatwootBotSettings, ChatwootWebhookMessageCreated } from '../../../shared/types/chatwootBot.js';
import { logServer } from '../../lib/utils.js';
import { llmService } from '../../services/llm/LlmService.js';
import { llmSettingsService } from '../../services/llm/LlmSettingsService.js';
import { chatwootBotCatalogToolService } from './ChatwootBotCatalogToolService.js';
import { chatwootBotOrderToolService } from './ChatwootBotOrderToolService.js';

const BOT_TOOLS = [
  {
    name: 'get_storefront_catalog',
    description: 'Публічний каталог вітрини з приблизною наявністю (без персональних даних).',
    parameters: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Пошук за назвою або SKU' },
        limit: { type: 'number', description: 'Максимум позицій (1-30)' },
      },
    },
  },
  {
    name: 'get_verified_order',
    description:
      'Статус замовлення після верифікації клієнта. Не приймає телефон – лише номер замовлення серед уже підтверджених.',
    parameters: {
      type: 'object' as const,
      properties: {
        orderNumber: { type: 'string', description: 'Номер замовлення (опційно)' },
      },
    },
  },
];

export class ChatwootBotLlmRunner {
  async generateReply(
    settings: ChatwootBotSettings,
    payload: ChatwootWebhookMessageCreated,
    userContent: string,
    options?: { propagateErrors?: boolean },
  ): Promise<string | null> {
    if (!settings.aiEnabled) return null;

    const mask =
      settings.aiMasks.find((m) => m.id === settings.aiMaskId) ?? settings.aiMasks[0];
    if (!mask?.systemPrompt.trim()) return null;

    const platform = await llmSettingsService.getSettings();
    const provider: LlmProvider | undefined =
      settings.aiProvider === 'openai' || settings.aiProvider === 'google'
        ? settings.aiProvider
        : undefined;
    const model = settings.aiModel.trim() || undefined;
    const customAttrs = (payload.conversation?.custom_attributes ?? {}) as Record<string, unknown>;

    try {
      const result = await llmService.completeWithTools(
        {
          provider,
          model,
          system: mask.systemPrompt,
          messages: [{ role: 'user', content: userContent }],
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
              customAttrs,
              orderNumber,
            );
          }
          return { error: 'unknown_tool' };
        },
      );
      const text = result.text.trim();
      return text.length > 0 ? text : null;
    } catch (error) {
      logServer('[ChatwootBotLlmRunner] generateReply failed', error);
      if (options?.propagateErrors) throw error;
      return null;
    }
  }
}

export const chatwootBotLlmRunner = new ChatwootBotLlmRunner();
