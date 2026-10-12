import { prisma, logServer } from '../../lib/utils.js';
import {
  CHATWOOT_BOT_SETTINGS_CATEGORY,
  CHATWOOT_BOT_SETTINGS_KEY,
  DEFAULT_CHATWOOT_BOT_EVENT_LOG_MAX_RECORDS,
  DEFAULT_CHATWOOT_BOT_EVENT_LOG_RETENTION_DAYS,
  DEFAULT_CHATWOOT_BOT_SETTINGS,
  type ChatwootBotReplyMode,
  type ChatwootBotSettings,
  type ChatwootBotSettingsResponse,
  type ChatwootBotSettingsUpdate,
} from '../../../shared/types/chatwootBot.js';

const CACHE_TTL_MS = 60_000;

function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '****';
  return `****…${value.slice(-4)}`;
}

function normalizeKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [...DEFAULT_CHATWOOT_BOT_SETTINGS.handoverKeywords];
  }
  const cleaned = raw
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
  return cleaned.length > 0 ? cleaned : [...DEFAULT_CHATWOOT_BOT_SETTINGS.handoverKeywords];
}

function normalizeReplyMode(raw: unknown): ChatwootBotReplyMode {
  return raw === 'live' ? 'live' : 'dry_run';
}

function normalizeRetentionDays(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_CHATWOOT_BOT_EVENT_LOG_RETENTION_DAYS;
  return Math.max(1, Math.min(90, Math.floor(n)));
}

function normalizeMaxRecords(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_CHATWOOT_BOT_EVENT_LOG_MAX_RECORDS;
  return Math.max(10, Math.min(5000, Math.floor(n)));
}

function applyEnvFallback(settings: ChatwootBotSettings): ChatwootBotSettings {
  return {
    ...settings,
    baseUrl: settings.baseUrl || process.env.CHATWOOT_BASE_URL || '',
    apiAccessToken: settings.apiAccessToken || process.env.CHATWOOT_API_ACCESS_TOKEN || '',
    webhookSecret: settings.webhookSecret || process.env.CHATWOOT_WEBHOOK_SECRET || '',
    accountId:
      settings.accountId ||
      (process.env.CHATWOOT_ACCOUNT_ID ? Number(process.env.CHATWOOT_ACCOUNT_ID) : 1),
  };
}

function mergeWithDefaults(raw: Partial<ChatwootBotSettings>): ChatwootBotSettings {
  const accountId = Number(raw.accountId ?? DEFAULT_CHATWOOT_BOT_SETTINGS.accountId);
  const merged: ChatwootBotSettings = {
    ...DEFAULT_CHATWOOT_BOT_SETTINGS,
    ...raw,
    accountId: Number.isFinite(accountId) && accountId > 0 ? Math.floor(accountId) : 1,
    echoMessage:
      typeof raw.echoMessage === 'string' && raw.echoMessage.trim()
        ? raw.echoMessage.trim()
        : DEFAULT_CHATWOOT_BOT_SETTINGS.echoMessage,
    handoverKeywords: normalizeKeywords(raw.handoverKeywords),
    replyMode: normalizeReplyMode(raw.replyMode),
    enabled: Boolean(raw.enabled ?? DEFAULT_CHATWOOT_BOT_SETTINGS.enabled),
    baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl.trim().replace(/\/+$/, '') : '',
    apiAccessToken: typeof raw.apiAccessToken === 'string' ? raw.apiAccessToken.trim() : '',
    webhookSecret: typeof raw.webhookSecret === 'string' ? raw.webhookSecret.trim() : '',
    outgoingUrlHint:
      typeof raw.outgoingUrlHint === 'string'
        ? raw.outgoingUrlHint.trim()
        : DEFAULT_CHATWOOT_BOT_SETTINGS.outgoingUrlHint,
    eventLogRetentionDays: normalizeRetentionDays(
      raw.eventLogRetentionDays ?? DEFAULT_CHATWOOT_BOT_SETTINGS.eventLogRetentionDays,
    ),
    eventLogMaxRecords: normalizeMaxRecords(
      raw.eventLogMaxRecords ?? DEFAULT_CHATWOOT_BOT_SETTINGS.eventLogMaxRecords,
    ),
    eventLogStoreFullPayload: Boolean(
      raw.eventLogStoreFullPayload ?? DEFAULT_CHATWOOT_BOT_SETTINGS.eventLogStoreFullPayload,
    ),
  };
  return applyEnvFallback(merged);
}

export class ChatwootBotSettingsService {
  private cache: ChatwootBotSettings | null = null;
  private cacheExpiresAt = 0;

  invalidateCache(): void {
    this.cache = null;
    this.cacheExpiresAt = 0;
  }

  async getSettings(): Promise<ChatwootBotSettings> {
    const now = Date.now();
    if (this.cache && now < this.cacheExpiresAt) {
      return this.cache;
    }

    try {
      const record = await prisma.settingsBase.findUnique({
        where: { key: CHATWOOT_BOT_SETTINGS_KEY },
      });

      if (!record?.value) {
        const defaults = mergeWithDefaults({});
        this.cache = defaults;
        this.cacheExpiresAt = now + CACHE_TTL_MS;
        return defaults;
      }

      const parsed = JSON.parse(record.value) as Partial<ChatwootBotSettings>;
      const settings = mergeWithDefaults(parsed);
      this.cache = settings;
      this.cacheExpiresAt = now + CACHE_TTL_MS;
      return settings;
    } catch (error) {
      logServer('ChatwootBotSettingsService: failed to load settings', error);
      return mergeWithDefaults({});
    }
  }

  async getSettingsForAdmin(revealSecrets = false): Promise<ChatwootBotSettingsResponse> {
    const settings = await this.getSettings();
    return {
      ...settings,
      apiAccessToken: revealSecrets ? settings.apiAccessToken : '',
      apiAccessTokenMasked: maskSecret(settings.apiAccessToken),
      hasApiAccessToken: Boolean(settings.apiAccessToken),
      webhookSecret: revealSecrets ? settings.webhookSecret : '',
      webhookSecretMasked: maskSecret(settings.webhookSecret),
      hasWebhookSecret: Boolean(settings.webhookSecret),
    };
  }

  async saveSettings(incoming: ChatwootBotSettingsUpdate): Promise<ChatwootBotSettings> {
    const current = await this.getSettings();
    const { clearWebhookSecret, ...rest } = incoming;

    const next = mergeWithDefaults({
      ...current,
      ...rest,
      apiAccessToken:
        rest.apiAccessToken !== undefined && rest.apiAccessToken !== ''
          ? rest.apiAccessToken
          : current.apiAccessToken,
      webhookSecret: clearWebhookSecret
        ? ''
        : rest.webhookSecret !== undefined && rest.webhookSecret !== ''
          ? rest.webhookSecret
          : current.webhookSecret,
    });

    await prisma.settingsBase.upsert({
      where: { key: CHATWOOT_BOT_SETTINGS_KEY },
      update: {
        value: JSON.stringify(next),
        category: CHATWOOT_BOT_SETTINGS_CATEGORY,
        isActive: true,
      },
      create: {
        key: CHATWOOT_BOT_SETTINGS_KEY,
        value: JSON.stringify(next),
        category: CHATWOOT_BOT_SETTINGS_CATEGORY,
        description: 'Chatwoot Agent Bot v0 settings',
        isActive: true,
      },
    });

    this.invalidateCache();
    return this.getSettings();
  }
}

export const chatwootBotSettingsService = new ChatwootBotSettingsService();
