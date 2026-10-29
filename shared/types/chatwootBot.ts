/** Chatwoot Agent Bot v0 – settings + webhook event types. */

/** Маркер реалізації handover у health – перевірка, що webhook б’є в актуальний код. */
export const CHATWOOT_BOT_HANDOVER_BUILD = 'handover-trace-assign-v7';

/** Маркер у content для POST probe-outgoing-webhook (без echo в Chatwoot). */
export const CHATWOOT_WEBHOOK_PROBE_CONTENT_MARKER = '[nk-backoffice webhook probe]';

/** Імена fixture payload для unit-тестів оркестратора (`fixtures/index.ts`). */
export type ChatwootBotFixtureName = 'echo' | 'handover';

export type ChatwootBotReplyMode = 'live' | 'dry_run';

export type ChatwootHandoverAssignMode = 'specific_agent' | 'auto_inbox';

export type ChatwootBotAutoReplyMatchType = 'substring' | 'regex';

export type ChatwootBotAutoReplyRule = {
  id: string;
  enabled: boolean;
  priority: number;
  matchType: ChatwootBotAutoReplyMatchType;
  pattern: string;
  reply: string;
  caseInsensitive: boolean;
};

export type ChatwootBotAiMask = {
  id: string;
  name: string;
  systemPrompt: string;
};

export type ChatwootBotAiProviderOverride = '' | 'openai' | 'google' | 'openrouter';

/** Повні налаштування бота (зберігаються в settings_base). */
export type ChatwootBotSettings = {
  enabled: boolean;
  /** Base URL інстансу Chatwoot, напр. https://chat.example.com */
  baseUrl: string;
  accountId: number;
  apiAccessToken: string;
  /** Shared secret для перевірки webhook (header X-Chatwoot-Webhook-Secret). */
  webhookSecret: string;
  /** @deprecated Alias – використовуйте fallbackMessage; синхронізується при збереженні. */
  echoMessage: string;
  /** Текст, якщо патерни та AI не дали відповіді. */
  fallbackMessage: string;
  autoReplyRules: ChatwootBotAutoReplyRule[];
  aiEnabled: boolean;
  aiMaskId: string;
  aiMasks: ChatwootBotAiMask[];
  /** Порожньо – з глобальних llm_platform_settings. */
  aiProvider: ChatwootBotAiProviderOverride;
  aiModel: string;
  verifySessionTtlHours: number;
  verifyRateLimitMaxAttempts: number;
  verifyRateLimitWindowMinutes: number;
  verifyFailMessage: string;
  verifyRequiredHint: string;
  verifyPromptOrderNumber: string;
  verifyPromptLastOrderDate: string;
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
  /** Debug: писати в журнал private notes агентів. */
  eventLogPersistPrivate: boolean;
  /**
   * Debug: писати в журнал інший «шум» –
   * not_incoming, unsupported_event:*, sender_not_contact:*.
   */
  eventLogPersistOtherNoise: boolean;
  /**
   * specific_agent – PATCH assignee_id з handoverAssigneeId;
   * auto_inbox – лише відкрити діалог і зняти assignee, далі Chatwoot auto assignment (round robin).
   */
  handoverAssignMode: ChatwootHandoverAssignMode;
  /** Chatwoot user id агента для handover (не Agent Bot id). */
  handoverAssigneeId: number | null;
  /** Inbox для симуляції / fallback, якщо в webhook немає inbox_id. */
  handoverDefaultInboxId: number | null;
  /**
   * Опційний Personal Access Token користувача Chatwoot (Profile → Access Token).
   * Потрібен для GET /agents і GET /inboxes/{id} (робочі години). Agent Bot token для цього часто недоступний.
   */
  inboxApiAccessToken: string;
  /** @deprecated Fallback, якщо inbox API недоступний. Години беруться з Chatwoot inbox. */
  handoverTimezone: string;
  /** 1=пн … 7=нд */
  handoverWorkDays: number[];
  handoverWorkStart: string;
  handoverWorkEnd: string;
  handoverMessageInHours: string;
  handoverMessageOutOfHours: string;
  handoverCallbackAckMessage: string;
  handoverEmergencyEnabled: boolean;
  handoverEmergencyKeywords: string[];
  handoverMessageEmergency: string;
  /** Увімкнути reclaim (повернення діалогу боту від людини-assignee). */
  reclaimEnabled: boolean;
  /** Reclaim, якщо assignee offline (у т.ч. в робочі години). */
  reclaimOnAssigneeOffline: boolean;
  /** Reclaim поза робочими годинами, якщо агент довго не відповідає публічно. */
  reclaimOnOohAgentSilent: boolean;
  /** Хвилин мовчання агента в OOH перед reclaim. */
  reclaimOohSilentMinutes: number;
  /** В OOH: якщо агент ще жодного разу не відповідав – одразу reclaim. */
  reclaimOohTreatNoAgentReplyAsSilent: boolean;
  /** Reclaim у робочі години за таймаутом мовчання (за замовчуванням вимк.). */
  reclaimInHoursAgentSilentEnabled: boolean;
  /** Хвилин мовчання агента в робочі години перед reclaim. */
  reclaimInHoursSilentMinutes: number;
  /** У робочі години: якщо агент ще не відповідав – вважати таймаут перевищеним. */
  reclaimInHoursTreatNoAgentReplyAsSilent: boolean;
  /** Публічне повідомлення при reclaim, коли assignee офлайн. */
  reclaimMessageOffline: string;
  /** Публічне повідомлення при reclaim в OOH (не плутати з handover OOH). */
  reclaimMessageOoh: string;
  /** Публічне повідомлення при reclaim за таймаутом у робочі години. */
  reclaimMessageInHours: string;
  /** Після reclaim обробити поточне повідомлення клієнта (echo/handover). */
  reclaimContinueWithEcho: boolean;
  /** На «Вирішити» – unassign + скинути bot_human_handover_active. */
  resolveCleanupEnabled: boolean;
};

export type ChatwootBotReclaimReason =
  | 'reclaim_offline'
  | 'reclaim_ooh'
  | 'reclaim_in_hours';

export type ChatwootBotAnalyticsEventKind =
  | 'customer_message'
  | 'agent_message'
  | 'bot_action'
  | 'resolved'
  | 'reclaim';

export type ChatwootBotAnalyticsOverview = {
  from: string;
  to: string;
  topQuestions: Array<{ contentNorm: string; contentPreview: string; count: number }>;
  agentSla: Array<{
    agentId: number;
    conversations: number;
    medianResponseSeconds: number | null;
    avgResponseSeconds: number | null;
    noReplyCount: number;
    reclaimCount: number;
  }>;
  totals: {
    customerMessages: number;
    agentMessages: number;
    reclaims: number;
    resolved: number;
  };
};

export type ChatwootBotAgentSummary = {
  id: number;
  name: string;
  email: string;
  availabilityStatus: string;
  role: string;
};

export type ChatwootInboxWorkingHourSlot = {
  day_of_week: number;
  closed_all_day: boolean;
  open_all_day: boolean;
  open_hour: number | null;
  open_minutes: number | null;
  close_hour: number | null;
  close_minutes: number | null;
};

export type ChatwootInboxSchedule = {
  inboxId: number;
  name: string;
  workingHoursEnabled: boolean;
  timezone: string;
  workingHours: ChatwootInboxWorkingHourSlot[];
};

export type ChatwootInboxHoursStatus = {
  schedule: ChatwootInboxSchedule;
  inHours: boolean;
  source: 'chatwoot_inbox' | 'settings_fallback' | 'always_open';
};

/** PUT body – порожній secret/token не змінює збережене; для очищення – clearWebhookSecret. */
export type ChatwootBotSettingsUpdate = Partial<ChatwootBotSettings> & {
  clearWebhookSecret?: boolean;
  clearInboxApiAccessToken?: boolean;
};

/** GET response – token і secret маскуються. */
export type ChatwootBotSettingsResponse = Omit<
  ChatwootBotSettings,
  'apiAccessToken' | 'webhookSecret' | 'inboxApiAccessToken'
> & {
  apiAccessToken: string;
  apiAccessTokenMasked: string;
  hasApiAccessToken: boolean;
  inboxApiAccessToken: string;
  inboxApiAccessTokenMasked: string;
  hasInboxApiAccessToken: boolean;
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
    /** У webhook це display_id (номер у UI), не internal PK. */
    id?: number;
    display_id?: number | string;
    status?: string;
    inbox_id?: number;
    assignee_id?: number | null;
    custom_attributes?: Record<string, unknown>;
    meta?: {
      assignee?: { id?: number; type?: string; name?: string } | null;
      sender?: { id?: number; name?: string; phone_number?: string | null } | null;
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

export const DEFAULT_CHATWOOT_BOT_EMERGENCY_KEYWORDS = ['терміново', 'критично'];

/** Ключ custom attribute на conversation (Chatwoot). */
export const CHATWOOT_BOT_ATTR_HUMAN_HANDOVER_ACTIVE = 'bot_human_handover_active';
export const CHATWOOT_BOT_ATTR_OOH_CALLBACK_PENDING = 'bot_ooh_callback_pending';
export const CHATWOOT_BOT_ATTR_CALLBACK_REQUESTED = 'callback_requested';
export const CHATWOOT_BOT_ATTR_CALLBACK_PHONE = 'callback_phone';
export const CHATWOOT_BOT_ATTR_VERIFY_EXPIRES_AT = 'bot_verify_expires_at';
export const CHATWOOT_BOT_ATTR_VERIFIED_ORDER_IDS = 'bot_verified_order_ids';
export const CHATWOOT_BOT_ATTR_VERIFIED_PHONE_HASH = 'bot_verified_phone_hash';
export const CHATWOOT_BOT_ATTR_VERIFY_RATE_WINDOW = 'bot_verify_rate_window';
export const CHATWOOT_BOT_ATTR_VERIFY_RATE_COUNT = 'bot_verify_rate_count';

export const DEFAULT_CHATWOOT_BOT_AI_MASK_ID = 'default_support';

export const DEFAULT_CHATWOOT_BOT_VERIFY_SESSION_TTL_HOURS = 24;
export const DEFAULT_CHATWOOT_BOT_VERIFY_RATE_MAX = 5;
export const DEFAULT_CHATWOOT_BOT_VERIFY_RATE_WINDOW_MIN = 15;

export const DEFAULT_CHATWOOT_BOT_HANDOVER_TIMEZONE = 'Europe/Kyiv';
export const DEFAULT_CHATWOOT_BOT_HANDOVER_WORK_DAYS = [1, 2, 3, 4, 5];
export const DEFAULT_CHATWOOT_BOT_HANDOVER_WORK_START = '09:00';
export const DEFAULT_CHATWOOT_BOT_HANDOVER_WORK_END = '18:00';

export const CHATWOOT_WEBHOOK_SECRET_HEADER = 'x-chatwoot-webhook-secret';
export const CHATWOOT_SIGNATURE_HEADER = 'x-chatwoot-signature';
export const CHATWOOT_TIMESTAMP_HEADER = 'x-chatwoot-timestamp';
export const CHATWOOT_DELIVERY_HEADER = 'x-chatwoot-delivery';

export const DEFAULT_CHATWOOT_BOT_EVENT_LOG_RETENTION_DAYS = 14;
export const DEFAULT_CHATWOOT_BOT_EVENT_LOG_MAX_RECORDS = 300;
/** Обрізання повного payload при збереженні в JSON. */
export const CHATWOOT_BOT_FULL_PAYLOAD_MAX_BYTES = 65_536;

/** Дефолт хвилин мовчання агента перед reclaim (OOH / in-hours). */
export const DEFAULT_CHATWOOT_BOT_RECLAIM_OOH_MINUTES = 10;

export const DEFAULT_CHATWOOT_BOT_SETTINGS: ChatwootBotSettings = {
  enabled: false,
  baseUrl: '',
  accountId: 1,
  apiAccessToken: '',
  webhookSecret: '',
  echoMessage:
    'Дякуємо за повідомлення! Наш бот поки що відповідає ехо. Напишіть «оператор», щоб звʼязатися з людиною.',
  fallbackMessage:
    'Дякуємо за повідомлення! Наш бот поки що відповідає ехо. Напишіть «оператор», щоб звʼязатися з людиною.',
  autoReplyRules: [],
  aiEnabled: false,
  aiMaskId: DEFAULT_CHATWOOT_BOT_AI_MASK_ID,
  aiMasks: [
    {
      id: DEFAULT_CHATWOOT_BOT_AI_MASK_ID,
      name: 'Підтримка NK Food',
      systemPrompt:
        'Ти лаконічний асистент магазину NK Food. Відповідай українською, коротко й по суті. Не вигадуй статус замовлення чи наявність – лише дані з інструментів. Не називай ПІБ, адресу чи телефон клієнта. Якщо інструмент повернув verification_required – поясни, що потрібні телефон і номер замовлення або дата останнього замовлення.',
    },
  ],
  aiProvider: '',
  aiModel: '',
  verifySessionTtlHours: DEFAULT_CHATWOOT_BOT_VERIFY_SESSION_TTL_HOURS,
  verifyRateLimitMaxAttempts: DEFAULT_CHATWOOT_BOT_VERIFY_RATE_MAX,
  verifyRateLimitWindowMinutes: DEFAULT_CHATWOOT_BOT_VERIFY_RATE_WINDOW_MIN,
  verifyFailMessage:
    'Не вдалося підтвердити дані. Перевірте телефон і другий параметр (номер замовлення або дату останнього замовлення).',
  verifyRequiredHint:
    'Для статусу замовлення надішліть повний номер телефону та номер замовлення, або телефон і дату останнього замовлення (наприклад 19.10.2026).',
  verifyPromptOrderNumber:
    'Надішліть повний номер телефону (380…) і номер замовлення в одному повідомленні.',
  verifyPromptLastOrderDate:
    'Надішліть повний номер телефону і дату останнього замовлення (ДД.ММ.РРРР).',
  handoverKeywords: [...DEFAULT_CHATWOOT_BOT_HANDOVER_KEYWORDS],
  replyMode: 'dry_run',
  outgoingUrlHint: 'https://your-bo-host/api/webhooks/chatwoot',
  eventLogRetentionDays: DEFAULT_CHATWOOT_BOT_EVENT_LOG_RETENTION_DAYS,
  eventLogMaxRecords: DEFAULT_CHATWOOT_BOT_EVENT_LOG_MAX_RECORDS,
  eventLogStoreFullPayload: false,
  eventLogPersistPrivate: false,
  eventLogPersistOtherNoise: false,
  handoverAssignMode: 'specific_agent',
  handoverAssigneeId: null,
  handoverDefaultInboxId: 1,
  inboxApiAccessToken: '',
  handoverTimezone: DEFAULT_CHATWOOT_BOT_HANDOVER_TIMEZONE,
  handoverWorkDays: [...DEFAULT_CHATWOOT_BOT_HANDOVER_WORK_DAYS],
  handoverWorkStart: DEFAULT_CHATWOOT_BOT_HANDOVER_WORK_START,
  handoverWorkEnd: DEFAULT_CHATWOOT_BOT_HANDOVER_WORK_END,
  handoverMessageInHours:
    'Зараз підключаю оператора. Зачекайте, будь ласка, кілька хвилин.',
  handoverMessageOutOfHours:
    'Зараз неробочий час. Можу спробувати допомогти сам – опишіть питання. Або залиште імʼя та телефон, і оператор передзвонить у робочі години. Якщо ситуація критична – напишіть «терміново».',
  handoverCallbackAckMessage:
    'Дякуємо! Передаємо контакти оператору – звʼяжемося з вами в робочі години.',
  handoverEmergencyEnabled: true,
  handoverEmergencyKeywords: [...DEFAULT_CHATWOOT_BOT_EMERGENCY_KEYWORDS],
  handoverMessageEmergency:
    'Розуміємо, що ситуація термінова. Підключаємо оператора незважаючи на неробочий час.',
  reclaimEnabled: true,
  reclaimOnAssigneeOffline: true,
  reclaimOnOohAgentSilent: true,
  reclaimOohSilentMinutes: DEFAULT_CHATWOOT_BOT_RECLAIM_OOH_MINUTES,
  reclaimOohTreatNoAgentReplyAsSilent: true,
  reclaimInHoursAgentSilentEnabled: false,
  reclaimInHoursSilentMinutes: DEFAULT_CHATWOOT_BOT_RECLAIM_OOH_MINUTES,
  reclaimInHoursTreatNoAgentReplyAsSilent: true,
  reclaimMessageOffline:
    'Оператор зараз недоступний. Я тимчасово допоможу вам – опишіть, будь ласка, ваше питання.',
  reclaimMessageOoh:
    'Оператор поки не відповів. Я знову на звʼязку – напишіть, чим можу допомогти.',
  reclaimMessageInHours:
    'Оператор ще не відповів. Тимчасово допоможу я – опишіть ваше питання.',
  reclaimContinueWithEcho: true,
  resolveCleanupEnabled: true,
};

/** @deprecated Використовуйте `settings.reclaimOohSilentMinutes`. */
export const CHATWOOT_BOT_RECLAIM_OOH_MINUTES = DEFAULT_CHATWOOT_BOT_RECLAIM_OOH_MINUTES;
