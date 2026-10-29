import type { LlmToolDefinition } from '../types/llm.js';

export type ChatwootBotLlmToolExample = {
  label: string;
  arguments: Record<string, unknown>;
  resultSample: unknown;
};

export type ChatwootBotLlmToolMeta = {
  name: string;
  description: string;
  parameters: LlmToolDefinition['parameters'];
  examples: ChatwootBotLlmToolExample[];
  /** POST шлях від /api/chatwoot-bot (admin). */
  adminTestPath?: string;
  adminTestNote?: string;
};

export const CHATWOOT_BOT_LLM_TOOLS: ChatwootBotLlmToolMeta[] = [
  {
    name: 'get_storefront_catalog',
    description: 'Публічний каталог вітрини з приблизною наявністю (без персональних даних).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Пошук за назвою або SKU' },
        limit: { type: 'number', description: 'Максимум позицій (1-30)' },
      },
    },
    adminTestPath: '/tools/catalog',
    examples: [
      {
        label: 'Пошук супу',
        arguments: { query: 'гречаний суп', limit: 5 },
        resultSample: [
          {
            name: 'Суп гречаний з куркою',
            sku: '01013',
            retailPrice: 95,
            stockTier: 'enough',
          },
        ],
      },
    ],
  },
  {
    name: 'get_verified_order',
    description:
      'Статус замовлення після верифікації клієнта. Не приймає телефон – лише номер замовлення серед уже підтверджених.',
    parameters: {
      type: 'object',
      properties: {
        orderNumber: { type: 'string', description: 'Номер замовлення (опційно)' },
      },
    },
    adminTestNote:
      'Спочатку verify у чаті (телефон + номер або дата). Tool повертає дані лише для підтвердженої сесії.',
    examples: [
      {
        label: 'Після verify',
        arguments: { orderNumber: '24155' },
        resultSample: {
          verified: true,
          order: {
            orderNumber: '24155',
            status: 'processing',
            statusText: 'В обробці',
            ttn: '',
            items: [{ name: 'Плов зі свининою', sku: '03002', quantity: 2 }],
          },
        },
      },
    ],
  },
  {
    name: 'get_storefront_site_pages',
    description:
      'Текст публічних сторінок сайту (доставка, акції, FAQ тощо). Не каталог SKU — для загальної інформації з вітрини.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Фільтр за заголовком, slug або текстом' },
        slugs: {
          type: 'string',
          description: 'Slug сторінок WordPress через кому (опційно)',
        },
        limit: { type: 'number', description: 'Максимум сторінок у відповіді (1-20)' },
      },
    },
    adminTestPath: '/tools/site-pages',
    examples: [
      {
        label: 'Доставка',
        arguments: { query: 'достав', limit: 3 },
        resultSample: {
          source: 'wp_rest',
          cachedUntil: '2026-10-28T12:00:00.000Z',
          pages: [{ slug: 'dostavka', title: 'Доставка', excerpt: '…', text: '…' }],
        },
      },
    ],
  },
];

export function chatwootBotLlmToolDefinitions(): LlmToolDefinition[] {
  return CHATWOOT_BOT_LLM_TOOLS.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));
}

export function findChatwootBotLlmToolMeta(name: string): ChatwootBotLlmToolMeta | undefined {
  return CHATWOOT_BOT_LLM_TOOLS.find((t) => t.name === name);
}
