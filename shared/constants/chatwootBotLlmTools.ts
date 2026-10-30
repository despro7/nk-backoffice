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
    name: 'verify_customer',
    description:
      'Перевіряє клієнта для доступу до його замовлення. Передавай лише те, що клієнт назвав у розмові: телефон (якщо ще не збережено), номер замовлення та/або дату замовлення. Дату переводь у YYYY-MM-DD за Києвом відносно сьогоднішньої дати з контексту («у понеділок» – одна дата; «у понеділок чи вівторок» – dateFrom і dateTo, не більше 3 днів). Не вигадуй дані. Після verified: true викликай get_verified_order.',
    parameters: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Телефон клієнта, якщо він його щойно назвав' },
        orderNumber: { type: 'string', description: 'Номер замовлення (24155 або SD24155)' },
        dateFrom: { type: 'string', description: 'Перший день, коли могли оформити замовлення (YYYY-MM-DD)' },
        dateTo: { type: 'string', description: 'Останній день інтервалу (YYYY-MM-DD), якщо клієнт не впевнений' },
      },
    },
    adminTestNote:
      'Працює лише в розмові (потрібен conversationId). Телефон бекенд бере з аргументів, збереженого в розмові або з профілю контакту.',
    examples: [
      {
        label: '«Замовляв у понеділок чи вівторок»',
        arguments: { dateFrom: '2026-10-26', dateTo: '2026-10-27' },
        resultSample: { verified: true, ordersVerified: 1, hint: 'Верифікацію пройдено. Викликай get_verified_order…' },
      },
      {
        label: 'Телефон ще невідомий',
        arguments: { orderNumber: '24155' },
        resultSample: { verified: false, code: 'phone_required', hint: 'Попроси номер телефону…' },
      },
    ],
  },
  {
    name: 'get_verified_order',
    description:
      'Статус замовлення клієнта. Після верифікації – повні дані (склад, ТТН). Якщо відомий лише телефон – code: phone_only з коротким статусом останнього замовлення без номера, дати, складу й ТТН; номер і дату замовлення клієнту не підказуй. Не приймає телефон.',
    parameters: {
      type: 'object',
      properties: {
        orderNumber: { type: 'string', description: 'Номер замовлення (опційно)' },
      },
    },
    adminTestNote:
      'Повні дані – після verify у чаті (телефон + номер або дата) або для телефону з довіреного каналу (WhatsApp/SMS). Лише телефон – короткий статус.',
    examples: [
      {
        label: 'Лише телефон',
        arguments: {},
        resultSample: {
          verified: false,
          code: 'phone_only',
          latestOrder: { status: '4', statusText: 'Відправлено' },
          hint: 'Короткий статус за телефоном…',
        },
      },
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
    name: 'search_knowledge_base',
    description:
      'Внутрішня база знань магазину: доставка, оплата, умови, зберігання, часті питання. Викликай першою для загальних питань. Відповідай своїми словами лише за фактами з answer; якщо found: false – спробуй get_storefront_site_pages.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Суть питання клієнта своїми словами (без телефону та імені)' },
      },
      required: ['query'],
    },
    adminTestNote: 'Перевірити, що знайде бот, можна на сторінці «База знань» (кнопка «Перевірити пошук»).',
    examples: [
      {
        label: 'Доставка',
        arguments: { query: 'скільки коштує доставка' },
        resultSample: {
          found: true,
          entries: [{ title: 'Вартість і терміни доставки', answer: 'Доставка Новою Поштою 1–3 дні…' }],
          hint: 'Сформулюй відповідь своїми словами…',
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
