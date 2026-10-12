/** Chatwoot Agent Bot v0 — settings + webhook event types. */

export type ChatwootBotReplyMode = 'live' | 'dry_run';

/** Повні налаштування бота (зберігаються в settings_base). */
export type ChatwootBotSettings = {
  enabled: boolean;
  /** Base URL інстансу Chatwoot, напр. https://chat.example.com */
  baseUrl: string;
  accountId: number;
  apiAccessToken: string;
  /** Shared secret для перевірки webhook (header X-Chatwoot-Webhook-Secret). */
  webhookSecret: string;
  echoMessage: string;
  /** Keywords для handover (case-insensitive substring match). */
  handoverKeywords: string[];
  /** live = POST у Chatwoot; dry_run = лише лог. */
  replyMode: ChatwootBotReplyMode;
  /** Hint для Agent Bot outgoing_url (не використовується кодом). */
  outgoingUrlHint: string;
  /** Скільки днів тримати записи журналу (видалення за віком). */
  eventLogRetentionDays: number;
  /** Максимум записів у таблиці (старіші видаляються після insert). */
  eventLogMaxRecords: number;
  /** Зберігати повний JSON payload у БД (для діагностики). */
  eventLogStoreFullPayload: boolean;
};

/** PUT body — порожній secret/token не змінює збережене; для очищення — clearWebhookSecret. */
export type ChatwootBotSettingsUpdate = Partial<ChatwootBotSettings> & {
  clearWebhookSecret?: boolean;
};

/** GET response — token і secret маскуються. */
export type ChatwootBotSettingsResponse = Omit<
  ChatwootBotSettings,
  'apiAccessToken' | 'webhookSecret'
> & {
  apiAccessToken: string;
  apiAccessTokenMasked: string;
  hasApiAccessToken: boolean;
  webhookSecret: string;
  webhookSecretMasked: string;
  hasWebhookSecret: boolean;
};

export type ChatwootBotProcessAction = 'echo' | 'handover' | 'ignored' | 'error';

export type ChatwootBotEventSource = 'webhook' | 'simulate';

export type ChatwootWebhookAuthScheme = 'hmac' | 'plain_secret' | 'unsigned' | 'unknown';

export type ChatwootBotWebhookHeadersMeta = {
  hasSignature: boolean;
  hasTimestamp: boolean;
  hasDelivery: boolean;
  hasPlainWebhookSecretHeader: boolean;
  detectedScheme: ChatwootWebhookAuthScheme;
};

export type ChatwootBotEventRecord = {
  id: string;
  at: string;
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
  /** Лише якщо в налаштуваннях увімкнено eventLogStoreFullPayload. */
  payloadJson?: unknown | null;
};

export type ChatwootBotConnectionTestResult = {
  ok: boolean;
  message: string;
  inboxCount?: number;
  error?: string;
};

export type ChatwootBotProcessResult = {
  success: boolean;
  action: ChatwootBotProcessAction;
  reason: string;
  conversationId: number | null;
  dryRun: boolean;
  event: ChatwootBotEventRecord;
};

/** Спрощений payload Chatwoot Agent Bot `message_created`. */
export type ChatwootWebhookMessageCreated = {
  event?: string;
  id?: number;
  content?: string | null;
  message_type?: string | number;
  private?: boolean;
  content_type?: string;
  conversation?: {
    id?: number;
    status?: string;
    inbox_id?: number;
    meta?: {
      assignee?: { id?: number; type?: string } | null;
    };
  };
  sender?: {
    id?: number;
    type?: string;
    name?: string;
  };
  account?: {
    id?: number;
  };
  inbox?: {
    id?: number;
  };
};

export const CHATWOOT_BOT_SETTINGS_KEY = 'chatwoot_bot_settings';
export const CHATWOOT_BOT_SETTINGS_CATEGORY = 'chatwoot_bot';

export const DEFAULT_CHATWOOT_BOT_HANDOVER_KEYWORDS = [
  'оператор',
  'людина',
  'менеджер',
];

export const CHATWOOT_WEBHOOK_SECRET_HEADER = 'x-chatwoot-webhook-secret';
export const CHATWOOT_SIGNATURE_HEADER = 'x-chatwoot-signature';
export const CHATWOOT_TIMESTAMP_HEADER = 'x-chatwoot-timestamp';
export const CHATWOOT_DELIVERY_HEADER = 'x-chatwoot-delivery';

export const DEFAULT_CHATWOOT_BOT_EVENT_LOG_RETENTION_DAYS = 14;
export const DEFAULT_CHATWOOT_BOT_EVENT_LOG_MAX_RECORDS = 300;
/** Обрізання повного payload при збереженні в JSON. */
export const CHATWOOT_BOT_FULL_PAYLOAD_MAX_BYTES = 65_536;

export const DEFAULT_CHATWOOT_BOT_SETTINGS: ChatwootBotSettings = {
  enabled: false,
  baseUrl: '',
  accountId: 1,
  apiAccessToken: '',
  webhookSecret: '',
  echoMessage:
    'Дякуємо за повідомлення! Наш бот поки що відповідає ехо. Напишіть «оператор», щоб звʼязатися з людиною.',
  handoverKeywords: [...DEFAULT_CHATWOOT_BOT_HANDOVER_KEYWORDS],
  replyMode: 'dry_run',
  outgoingUrlHint: 'https://your-bo-host/api/webhooks/chatwoot',
  eventLogRetentionDays: DEFAULT_CHATWOOT_BOT_EVENT_LOG_RETENTION_DAYS,
  eventLogMaxRecords: DEFAULT_CHATWOOT_BOT_EVENT_LOG_MAX_RECORDS,
  eventLogStoreFullPayload: false,
};
