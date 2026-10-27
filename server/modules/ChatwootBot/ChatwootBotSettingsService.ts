import { prisma, logServer } from '../../lib/utils.js';
import {
  CHATWOOT_BOT_SETTINGS_CATEGORY,
  CHATWOOT_BOT_SETTINGS_KEY,
  DEFAULT_CHATWOOT_BOT_EVENT_LOG_MAX_RECORDS,
  DEFAULT_CHATWOOT_BOT_EVENT_LOG_RETENTION_DAYS,
  DEFAULT_CHATWOOT_BOT_HANDOVER_TIMEZONE,
  DEFAULT_CHATWOOT_BOT_HANDOVER_WORK_DAYS,
  DEFAULT_CHATWOOT_BOT_HANDOVER_WORK_END,
  DEFAULT_CHATWOOT_BOT_HANDOVER_WORK_START,
  DEFAULT_CHATWOOT_BOT_SETTINGS,
  DEFAULT_CHATWOOT_BOT_VERIFY_RATE_MAX,
  DEFAULT_CHATWOOT_BOT_VERIFY_RATE_WINDOW_MIN,
  DEFAULT_CHATWOOT_BOT_VERIFY_SESSION_TTL_HOURS,
  type ChatwootBotAutoReplyRule,
  type ChatwootBotAiMask,
  type ChatwootBotReplyMode,
  type ChatwootBotSettings,
  type ChatwootBotSettingsResponse,
  type ChatwootBotSettingsUpdate,
} from '../../../shared/types/chatwootBot.js';
import { resolveGoogleLlmModelId } from '../../../shared/constants/googleLlmModelAliases.js';

const CACHE_TTL_MS = 60_000;

function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '****';
  return `****…${value.slice(-4)}`;
}

function normalizeKeywords(raw: unknown, fallback = DEFAULT_CHATWOOT_BOT_SETTINGS.handoverKeywords): string[] {
  if (!Array.isArray(raw)) {
    return [...fallback];
  }
  const cleaned = raw
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
  return cleaned.length > 0 ? cleaned : [...fallback];
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

function normalizeHandoverAssignMode(raw: unknown): ChatwootBotSettings['handoverAssignMode'] {
  if (raw === 'auto_inbox' || raw === 'specific_agent') return raw;
  return DEFAULT_CHATWOOT_BOT_SETTINGS.handoverAssignMode;
}

function normalizeAssigneeId(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function normalizeDefaultInboxId(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function normalizeWorkDays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [...DEFAULT_CHATWOOT_BOT_HANDOVER_WORK_DAYS];
  const days = raw
    .map((d) => Number(d))
    .filter((d) => Number.isFinite(d) && d >= 1 && d <= 7);
  return days.length > 0 ? [...new Set(days)].sort((a, b) => a - b) : [...DEFAULT_CHATWOOT_BOT_HANDOVER_WORK_DAYS];
}

function normalizeHm(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  return /^\d{1,2}:\d{2}$/.test(trimmed) ? trimmed : fallback;
}

function normalizeMessage(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeReclaimMinutes(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(120, Math.floor(n)));
}

function normalizeAutoReplyRules(raw: unknown): ChatwootBotAutoReplyRule[] {
  if (!Array.isArray(raw)) return [];
  const rules: ChatwootBotAutoReplyRule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Partial<ChatwootBotAutoReplyRule>;
    const pattern = String(row.pattern ?? '').trim();
    const reply = String(row.reply ?? '').trim();
    if (!pattern || !reply) continue;
    const matchType = row.matchType === 'regex' ? 'regex' : 'substring';
    if (matchType === 'regex') {
      try {
        new RegExp(pattern);
      } catch {
        continue;
      }
    }
    rules.push({
      id: String(row.id ?? `rule_${rules.length + 1}`),
      enabled: row.enabled !== false,
      priority: Number.isFinite(Number(row.priority)) ? Math.floor(Number(row.priority)) : 100,
      matchType,
      pattern,
      reply,
      caseInsensitive: row.caseInsensitive !== false,
    });
  }
  return rules.sort((a, b) => a.priority - b.priority);
}

function normalizeAiMasks(raw: unknown, fallback: ChatwootBotAiMask[]): ChatwootBotAiMask[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...fallback];
  const masks: ChatwootBotAiMask[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Partial<ChatwootBotAiMask>;
    const id = String(row.id ?? '').trim();
    const name = String(row.name ?? '').trim();
    const systemPrompt = String(row.systemPrompt ?? '').trim();
    if (!id || !systemPrompt) continue;
    masks.push({ id, name: name || id, systemPrompt });
  }
  return masks.length > 0 ? masks : [...fallback];
}

function normalizeAiProvider(raw: unknown): ChatwootBotSettings['aiProvider'] {
  if (raw === 'openai' || raw === 'google') return raw;
  return '';
}

function normalizePositiveInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function resolveFallbackAndEcho(raw: Partial<ChatwootBotSettings>): { echoMessage: string; fallbackMessage: string } {
  const fallbackRaw =
    typeof raw.fallbackMessage === 'string' && raw.fallbackMessage.trim()
      ? raw.fallbackMessage.trim()
      : typeof raw.echoMessage === 'string' && raw.echoMessage.trim()
        ? raw.echoMessage.trim()
        : DEFAULT_CHATWOOT_BOT_SETTINGS.fallbackMessage;
  return { echoMessage: fallbackRaw, fallbackMessage: fallbackRaw };
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
  const { echoMessage, fallbackMessage } = resolveFallbackAndEcho(raw);
  const merged: ChatwootBotSettings = {
    ...DEFAULT_CHATWOOT_BOT_SETTINGS,
    ...raw,
    accountId: Number.isFinite(accountId) && accountId > 0 ? Math.floor(accountId) : 1,
    echoMessage,
    fallbackMessage,
    autoReplyRules: normalizeAutoReplyRules(raw.autoReplyRules),
    aiEnabled: Boolean(raw.aiEnabled ?? DEFAULT_CHATWOOT_BOT_SETTINGS.aiEnabled),
    aiMaskId:
      typeof raw.aiMaskId === 'string' && raw.aiMaskId.trim()
        ? raw.aiMaskId.trim()
        : DEFAULT_CHATWOOT_BOT_SETTINGS.aiMaskId,
    aiMasks: normalizeAiMasks(raw.aiMasks, DEFAULT_CHATWOOT_BOT_SETTINGS.aiMasks),
    aiProvider: normalizeAiProvider(raw.aiProvider),
    aiModel:
      typeof raw.aiModel === 'string' && raw.aiModel.trim()
        ? resolveGoogleLlmModelId(raw.aiModel.trim())
        : '',
    verifySessionTtlHours: normalizePositiveInt(
      raw.verifySessionTtlHours,
      DEFAULT_CHATWOOT_BOT_VERIFY_SESSION_TTL_HOURS,
      1,
      168,
    ),
    verifyRateLimitMaxAttempts: normalizePositiveInt(
      raw.verifyRateLimitMaxAttempts,
      DEFAULT_CHATWOOT_BOT_VERIFY_RATE_MAX,
      1,
      30,
    ),
    verifyRateLimitWindowMinutes: normalizePositiveInt(
      raw.verifyRateLimitWindowMinutes,
      DEFAULT_CHATWOOT_BOT_VERIFY_RATE_WINDOW_MIN,
      5,
      120,
    ),
    verifyFailMessage: normalizeMessage(
      raw.verifyFailMessage,
      DEFAULT_CHATWOOT_BOT_SETTINGS.verifyFailMessage,
    ),
    verifyRequiredHint: normalizeMessage(
      raw.verifyRequiredHint,
      DEFAULT_CHATWOOT_BOT_SETTINGS.verifyRequiredHint,
    ),
    verifyPromptOrderNumber: normalizeMessage(
      raw.verifyPromptOrderNumber,
      DEFAULT_CHATWOOT_BOT_SETTINGS.verifyPromptOrderNumber,
    ),
    verifyPromptLastOrderDate: normalizeMessage(
      raw.verifyPromptLastOrderDate,
      DEFAULT_CHATWOOT_BOT_SETTINGS.verifyPromptLastOrderDate,
    ),
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
    eventLogPersistPrivate: Boolean(
      raw.eventLogPersistPrivate ?? DEFAULT_CHATWOOT_BOT_SETTINGS.eventLogPersistPrivate,
    ),
    eventLogPersistOtherNoise: Boolean(
      raw.eventLogPersistOtherNoise ?? DEFAULT_CHATWOOT_BOT_SETTINGS.eventLogPersistOtherNoise,
    ),
    handoverAssignMode: normalizeHandoverAssignMode(raw.handoverAssignMode),
    handoverAssigneeId: normalizeAssigneeId(raw.handoverAssigneeId),
    handoverDefaultInboxId: normalizeDefaultInboxId(
      raw.handoverDefaultInboxId ?? DEFAULT_CHATWOOT_BOT_SETTINGS.handoverDefaultInboxId,
    ),
    inboxApiAccessToken:
      typeof raw.inboxApiAccessToken === 'string' ? raw.inboxApiAccessToken.trim() : '',
    handoverTimezone:
      typeof raw.handoverTimezone === 'string' && raw.handoverTimezone.trim()
        ? raw.handoverTimezone.trim()
        : DEFAULT_CHATWOOT_BOT_HANDOVER_TIMEZONE,
    handoverWorkDays: normalizeWorkDays(raw.handoverWorkDays),
    handoverWorkStart: normalizeHm(
      raw.handoverWorkStart,
      DEFAULT_CHATWOOT_BOT_HANDOVER_WORK_START,
    ),
    handoverWorkEnd: normalizeHm(raw.handoverWorkEnd, DEFAULT_CHATWOOT_BOT_HANDOVER_WORK_END),
    handoverMessageInHours: normalizeMessage(
      raw.handoverMessageInHours,
      DEFAULT_CHATWOOT_BOT_SETTINGS.handoverMessageInHours,
    ),
    handoverMessageOutOfHours: normalizeMessage(
      raw.handoverMessageOutOfHours,
      DEFAULT_CHATWOOT_BOT_SETTINGS.handoverMessageOutOfHours,
    ),
    handoverCallbackAckMessage: normalizeMessage(
      raw.handoverCallbackAckMessage,
      DEFAULT_CHATWOOT_BOT_SETTINGS.handoverCallbackAckMessage,
    ),
    handoverEmergencyEnabled: Boolean(
      raw.handoverEmergencyEnabled ?? DEFAULT_CHATWOOT_BOT_SETTINGS.handoverEmergencyEnabled,
    ),
    handoverEmergencyKeywords: normalizeKeywords(
      raw.handoverEmergencyKeywords,
      DEFAULT_CHATWOOT_BOT_SETTINGS.handoverEmergencyKeywords,
    ),
    handoverMessageEmergency: normalizeMessage(
      raw.handoverMessageEmergency,
      DEFAULT_CHATWOOT_BOT_SETTINGS.handoverMessageEmergency,
    ),
    reclaimEnabled: Boolean(raw.reclaimEnabled ?? DEFAULT_CHATWOOT_BOT_SETTINGS.reclaimEnabled),
    reclaimOnAssigneeOffline: Boolean(
      raw.reclaimOnAssigneeOffline ?? DEFAULT_CHATWOOT_BOT_SETTINGS.reclaimOnAssigneeOffline,
    ),
    reclaimOnOohAgentSilent: Boolean(
      raw.reclaimOnOohAgentSilent ?? DEFAULT_CHATWOOT_BOT_SETTINGS.reclaimOnOohAgentSilent,
    ),
    reclaimOohSilentMinutes: normalizeReclaimMinutes(
      raw.reclaimOohSilentMinutes,
      DEFAULT_CHATWOOT_BOT_SETTINGS.reclaimOohSilentMinutes,
    ),
    reclaimOohTreatNoAgentReplyAsSilent: Boolean(
      raw.reclaimOohTreatNoAgentReplyAsSilent ??
        DEFAULT_CHATWOOT_BOT_SETTINGS.reclaimOohTreatNoAgentReplyAsSilent,
    ),
    reclaimInHoursAgentSilentEnabled: Boolean(
      raw.reclaimInHoursAgentSilentEnabled ??
        DEFAULT_CHATWOOT_BOT_SETTINGS.reclaimInHoursAgentSilentEnabled,
    ),
    reclaimInHoursSilentMinutes: normalizeReclaimMinutes(
      raw.reclaimInHoursSilentMinutes,
      DEFAULT_CHATWOOT_BOT_SETTINGS.reclaimInHoursSilentMinutes,
    ),
    reclaimInHoursTreatNoAgentReplyAsSilent: Boolean(
      raw.reclaimInHoursTreatNoAgentReplyAsSilent ??
        DEFAULT_CHATWOOT_BOT_SETTINGS.reclaimInHoursTreatNoAgentReplyAsSilent,
    ),
    reclaimMessageOffline: normalizeMessage(
      raw.reclaimMessageOffline,
      DEFAULT_CHATWOOT_BOT_SETTINGS.reclaimMessageOffline,
    ),
    reclaimMessageOoh: normalizeMessage(
      raw.reclaimMessageOoh,
      DEFAULT_CHATWOOT_BOT_SETTINGS.reclaimMessageOoh,
    ),
    reclaimMessageInHours: normalizeMessage(
      raw.reclaimMessageInHours,
      DEFAULT_CHATWOOT_BOT_SETTINGS.reclaimMessageInHours,
    ),
    reclaimContinueWithEcho: Boolean(
      raw.reclaimContinueWithEcho ?? DEFAULT_CHATWOOT_BOT_SETTINGS.reclaimContinueWithEcho,
    ),
    resolveCleanupEnabled: Boolean(
      raw.resolveCleanupEnabled ?? DEFAULT_CHATWOOT_BOT_SETTINGS.resolveCleanupEnabled,
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
      inboxApiAccessToken: revealSecrets ? settings.inboxApiAccessToken : '',
      inboxApiAccessTokenMasked: maskSecret(settings.inboxApiAccessToken),
      hasInboxApiAccessToken: Boolean(settings.inboxApiAccessToken),
      webhookSecret: revealSecrets ? settings.webhookSecret : '',
      webhookSecretMasked: maskSecret(settings.webhookSecret),
      hasWebhookSecret: Boolean(settings.webhookSecret),
    };
  }

  async saveSettings(incoming: ChatwootBotSettingsUpdate): Promise<ChatwootBotSettings> {
    const current = await this.getSettings();
    const { clearWebhookSecret, clearInboxApiAccessToken, ...rest } = incoming;

    const next = mergeWithDefaults({
      ...current,
      ...rest,
      apiAccessToken:
        rest.apiAccessToken !== undefined && rest.apiAccessToken !== ''
          ? rest.apiAccessToken
          : current.apiAccessToken,
      inboxApiAccessToken: clearInboxApiAccessToken
        ? ''
        : rest.inboxApiAccessToken !== undefined && rest.inboxApiAccessToken !== ''
          ? rest.inboxApiAccessToken
          : current.inboxApiAccessToken,
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
