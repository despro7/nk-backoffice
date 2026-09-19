import { prisma, logServer } from '../lib/utils.js';
import {
  DEFAULT_SUPPORT_REPORT_CLIENT_LOG_LEVELS,
  DEFAULT_SUPPORT_REPORT_SETTINGS,
  SUPPORT_REPORT_SETTINGS_KEY,
  SUPPORT_REPORT_SETTINGS_CATEGORY,
  type SupportReportClientLogLevels,
  type SupportReportSettings,
  type SupportReportSettingsResponse,
  type SupportReportPublicConfig,
} from '../../shared/types/supportReport.js';

const CACHE_TTL_MS = 60_000;

function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 8) return '****';
  return `****…${token.slice(-4)}`;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}

function applyEnvFallback(settings: SupportReportSettings): SupportReportSettings {
  return {
    ...settings,
    telegramBotToken:
      settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '',
    telegramAlertChatId:
      settings.telegramAlertChatId || process.env.TELEGRAM_ALERT_CHAT_ID || '',
    telegramAlertsEnabled:
      settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN
        ? settings.telegramAlertsEnabled ||
          parseBool(process.env.TELEGRAM_ALERTS_ENABLED, false)
        : settings.telegramAlertsEnabled,
  };
}

function mergeClientLogLevels(
  raw?: Partial<SupportReportClientLogLevels>,
): SupportReportClientLogLevels {
  return {
    ...DEFAULT_SUPPORT_REPORT_CLIENT_LOG_LEVELS,
    ...raw,
  };
}

function mergeWithDefaults(raw: Partial<SupportReportSettings>): SupportReportSettings {
  const merged: SupportReportSettings = {
    ...DEFAULT_SUPPORT_REPORT_SETTINGS,
    ...raw,
    clientLogLevels: mergeClientLogLevels(raw.clientLogLevels),
  };
  merged.clientLogLines = Math.max(10, Math.min(500, merged.clientLogLines || 100));
  merged.serverLogLines = Math.max(0, Math.min(2000, merged.serverLogLines ?? 200));
  merged.serverMetaLogLines = Math.max(0, Math.min(50, merged.serverMetaLogLines || 15));
  merged.rateLimitSeconds = Math.max(10, Math.min(600, merged.rateLimitSeconds || 60));
  merged.maxCommentLength = Math.max(50, Math.min(2000, merged.maxCommentLength || 500));
  merged.maxScreenshotMb = Math.max(1, Math.min(20, merged.maxScreenshotMb || 5));
  return applyEnvFallback(merged);
}

export class SupportReportSettingsService {
  private cache: SupportReportSettings | null = null;
  private cacheExpiresAt = 0;

  invalidateCache(): void {
    this.cache = null;
    this.cacheExpiresAt = 0;
  }

  async getSettings(): Promise<SupportReportSettings> {
    const now = Date.now();
    if (this.cache && now < this.cacheExpiresAt) {
      return this.cache;
    }

    try {
      const record = await prisma.settingsBase.findUnique({
        where: { key: SUPPORT_REPORT_SETTINGS_KEY },
      });

      if (!record?.value) {
        const defaults = mergeWithDefaults({});
        this.cache = defaults;
        this.cacheExpiresAt = now + CACHE_TTL_MS;
        return defaults;
      }

      const parsed = JSON.parse(record.value) as Partial<SupportReportSettings>;
      const settings = mergeWithDefaults(parsed);
      this.cache = settings;
      this.cacheExpiresAt = now + CACHE_TTL_MS;
      return settings;
    } catch (error) {
      logServer('SupportReportSettingsService: failed to load settings', error);
      return mergeWithDefaults({});
    }
  }

  async getSettingsForAdmin(): Promise<SupportReportSettingsResponse> {
    const settings = await this.getSettings();
    return {
      ...settings,
      telegramBotToken: '',
      telegramBotTokenMasked: maskToken(settings.telegramBotToken),
      hasTelegramBotToken: Boolean(settings.telegramBotToken),
    };
  }

  getPublicConfig(settings: SupportReportSettings): SupportReportPublicConfig {
    return {
      clientLogLines: settings.clientLogLines,
      clientLogLevels: settings.clientLogLevels,
      maxCommentLength: settings.maxCommentLength,
      maxScreenshotMb: settings.maxScreenshotMb,
      rateLimitSeconds: settings.rateLimitSeconds,
    };
  }

  async saveSettings(
    incoming: Partial<SupportReportSettings>,
    existingToken?: string,
  ): Promise<SupportReportSettings> {
    const current = await this.getSettings();

    const next: SupportReportSettings = mergeWithDefaults({
      ...current,
      ...incoming,
      telegramBotToken:
        incoming.telegramBotToken !== undefined && incoming.telegramBotToken !== ''
          ? incoming.telegramBotToken
          : existingToken ?? current.telegramBotToken,
    });

    const toStore: SupportReportSettings = {
      ...next,
      telegramBotToken: next.telegramBotToken,
    };

    await prisma.settingsBase.upsert({
      where: { key: SUPPORT_REPORT_SETTINGS_KEY },
      update: {
        value: JSON.stringify(toStore),
        category: SUPPORT_REPORT_SETTINGS_CATEGORY,
        isActive: true,
      },
      create: {
        key: SUPPORT_REPORT_SETTINGS_KEY,
        value: JSON.stringify(toStore),
        category: SUPPORT_REPORT_SETTINGS_CATEGORY,
        description: 'Support report / Telegram alert settings',
        isActive: true,
      },
    });

    this.invalidateCache();
    return this.getSettings();
  }
}

export const supportReportSettingsService = new SupportReportSettingsService();
