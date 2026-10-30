/**
 * Перемикач Chatwoot Agent Bot outgoing_url між продом і локальним BO (тунель chatwoot-dev).
 * Стан зберігається окремим ключем у settings_base, спільним для проду й локального BO.
 */

export const CHATWOOT_BOT_DEV_WEBHOOK_KEY = 'chatwoot_bot_dev_webhook';

/** Webhook локального BO через cloudflared (`config/cloudflared/chatwoot-dev.yml`). */
export const CHATWOOT_BOT_DEV_WEBHOOK_URL = 'https://chatwoot-dev.nk-food.shop/api/webhooks/chatwoot';

/** Через скільки режим вимикається сам. */
export const CHATWOOT_BOT_DEV_WEBHOOK_TTL_HOURS = 2;

/** Скільки невдалих health-перевірок поспіль (cron на проді, раз на 2 хв) до автоповернення. */
export const CHATWOOT_BOT_DEV_WEBHOOK_MAX_FAILED_CHECKS = 3;

export type ChatwootBotDevWebhookChangeReason =
  | 'manual_on'
  | 'manual_off'
  | 'ttl_expired'
  | 'health_failed'
  | 'shutdown';

export interface ChatwootBotDevWebhookState {
  enabled: boolean;
  agentBotId: number | null;
  /** outgoing_url до перемикання — куди повертаємо. */
  prodOutgoingUrl: string | null;
  devOutgoingUrl: string | null;
  enabledAt: string | null;
  expiresAt: string | null;
  /** Host процесу, що увімкнув режим (з processor stamp). */
  enabledByHost: string | null;
  failedChecks: number;
  lastChangeAt: string | null;
  lastChangeReason: ChatwootBotDevWebhookChangeReason | null;
  lastError: string | null;
}

export const DEFAULT_CHATWOOT_BOT_DEV_WEBHOOK_STATE: ChatwootBotDevWebhookState = {
  enabled: false,
  agentBotId: null,
  prodOutgoingUrl: null,
  devOutgoingUrl: null,
  enabledAt: null,
  expiresAt: null,
  enabledByHost: null,
  failedChecks: 0,
  lastChangeAt: null,
  lastChangeReason: null,
  lastError: null,
};

export interface ChatwootBotDevWebhookStatus extends ChatwootBotDevWebhookState {
  /** Увімкнути можна лише з локального BO (NODE_ENV !== production). */
  canEnable: boolean;
  /** Поточний outgoing_url Agent Bot у Chatwoot (null — не вдалося прочитати). */
  liveOutgoingUrl: string | null;
  agentBotName: string | null;
  /** Помилка читання Agent Bot (наприклад, PAT без ролі адміністратора). */
  agentBotError: string | null;
}
