import { logServer, prisma } from '../../lib/utils.js';
import {
  CHATWOOT_BOT_DEV_WEBHOOK_KEY,
  CHATWOOT_BOT_DEV_WEBHOOK_TTL_HOURS,
  CHATWOOT_BOT_DEV_WEBHOOK_URL,
  DEFAULT_CHATWOOT_BOT_DEV_WEBHOOK_STATE,
  type ChatwootBotDevWebhookChangeReason,
  type ChatwootBotDevWebhookState,
  type ChatwootBotDevWebhookStatus,
} from '../../../shared/types/chatwootBotDevWebhook.js';
import type { ChatwootBotSettings } from '../../../shared/types/chatwootBot.js';
import {
  createChatwootApiClient,
  type ChatwootAgentBotSummary,
  type ChatwootApiCredentials,
} from './ChatwootApiClient.js';
import { chatwootBotSettingsService } from './ChatwootBotSettingsService.js';
import { handoverAssignmentCredentials, hasHandoverUserPat } from './chatwootCredentials.js';
import { getChatwootProcessorStamp, parseProcessorHost } from './chatwootProcessorStamp.js';
import {
  chatwootWebhookHealthUrlFromOutgoingHint,
  chatwootWebhookPostUrlFromOutgoingHint,
} from './chatwootWebhookHealthUrl.js';
import {
  decideDevWebhookGuard,
  isSameWebhookUrl,
  pickAccountAgentBot,
} from './chatwootDevWebhookDecision.js';

const DEV_WEBHOOK_SETTINGS_CATEGORY = 'chatwoot_bot';

type DevHealthProbe = { ok: boolean; host: string | null; error: string | null };

/** Дані для повернення URL під час зупинки процесу, коли БД (SSH-тунель) вже може бути недоступна. */
type ShutdownRevertContext = {
  creds: ChatwootApiCredentials;
  agentBotId: number;
  prodOutgoingUrl: string;
};

function isProductionProcess(): boolean {
  return process.env.NODE_ENV === 'production';
}

function localHost(): string | null {
  return parseProcessorHost(getChatwootProcessorStamp());
}

async function probeDevHealth(devOutgoingUrl: string): Promise<DevHealthProbe> {
  const healthUrl = chatwootWebhookHealthUrlFromOutgoingHint(devOutgoingUrl);
  if (!healthUrl) return { ok: false, host: null, error: 'Невалідний dev URL' };
  try {
    const res = await fetch(healthUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'NK-Backoffice-ChatwootBot/1' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, host: null, error: `HTTP ${res.status}` };
    const json = (await res.json()) as { processor?: string };
    return { ok: true, host: parseProcessorHost(json.processor), error: null };
  } catch (err) {
    return { ok: false, host: null, error: err instanceof Error ? err.message : String(err) };
  }
}

function patCredentials(settings: ChatwootBotSettings): ChatwootApiCredentials {
  if (!hasHandoverUserPat(settings)) {
    throw new Error('Потрібен User PAT адміністратора Chatwoot (поле «Inbox API token»).');
  }
  return handoverAssignmentCredentials(settings);
}

function prodUrlFromHint(settings: ChatwootBotSettings): string | null {
  const url = chatwootWebhookPostUrlFromOutgoingHint(settings.outgoingUrlHint);
  return url && !isSameWebhookUrl(url, CHATWOOT_BOT_DEV_WEBHOOK_URL) ? url : null;
}

// Vite HMR перезавантажує модуль, а shutdown-handler у server/index.ts підключається один раз,
// тому контекст тримаємо на рівні процесу (як cron registry).
const SHUTDOWN_CTX_KEY = '__chatwootDevWebhookShutdownCtx__';
const processState = globalThis as typeof globalThis & {
  [SHUTDOWN_CTX_KEY]?: ShutdownRevertContext | null;
};

export class ChatwootBotDevWebhookService {
  private get shutdownCtx(): ShutdownRevertContext | null {
    return processState[SHUTDOWN_CTX_KEY] ?? null;
  }

  private set shutdownCtx(ctx: ShutdownRevertContext | null) {
    processState[SHUTDOWN_CTX_KEY] = ctx;
  }

  async getState(): Promise<ChatwootBotDevWebhookState> {
    const record = await prisma.settingsBase.findUnique({ where: { key: CHATWOOT_BOT_DEV_WEBHOOK_KEY } });
    if (!record?.value) return { ...DEFAULT_CHATWOOT_BOT_DEV_WEBHOOK_STATE };
    try {
      const parsed = JSON.parse(record.value) as Partial<ChatwootBotDevWebhookState>;
      return { ...DEFAULT_CHATWOOT_BOT_DEV_WEBHOOK_STATE, ...parsed };
    } catch (err) {
      logServer('[ChatwootDevWebhook] state JSON parse failed', err);
      return { ...DEFAULT_CHATWOOT_BOT_DEV_WEBHOOK_STATE };
    }
  }

  private async saveState(state: ChatwootBotDevWebhookState): Promise<void> {
    const value = JSON.stringify(state);
    await prisma.settingsBase.upsert({
      where: { key: CHATWOOT_BOT_DEV_WEBHOOK_KEY },
      update: { value, category: DEV_WEBHOOK_SETTINGS_CATEGORY, isActive: true },
      create: {
        key: CHATWOOT_BOT_DEV_WEBHOOK_KEY,
        value,
        category: DEV_WEBHOOK_SETTINGS_CATEGORY,
        description: 'Chatwoot Agent Bot outgoing_url → локальний BO (dev)',
        isActive: true,
      },
    });
  }

  private async resolveAgentBot(
    creds: ChatwootApiCredentials,
    settings: ChatwootBotSettings,
    state: ChatwootBotDevWebhookState,
  ): Promise<ChatwootAgentBotSummary> {
    const bots = await createChatwootApiClient(creds).listAgentBots();
    const pick = pickAccountAgentBot(bots, settings.accountId, state.agentBotId, [
      state.prodOutgoingUrl,
      prodUrlFromHint(settings),
      CHATWOOT_BOT_DEV_WEBHOOK_URL,
    ]);
    if (pick.ok === false) throw new Error(pick.error);
    return pick.bot;
  }

  async getStatus(): Promise<ChatwootBotDevWebhookStatus> {
    const state = await this.getState();
    const status: ChatwootBotDevWebhookStatus = {
      ...state,
      canEnable: !isProductionProcess(),
      liveOutgoingUrl: null,
      agentBotName: null,
      agentBotError: null,
    };
    try {
      const settings = await chatwootBotSettingsService.getSettings();
      const creds = patCredentials(settings);
      const bot = await this.resolveAgentBot(creds, settings, state);
      status.liveOutgoingUrl = bot.outgoingUrl;
      status.agentBotName = bot.name;
      if (state.enabled && state.prodOutgoingUrl && state.enabledByHost === localHost()) {
        this.shutdownCtx = { creds, agentBotId: bot.id, prodOutgoingUrl: state.prodOutgoingUrl };
      }
    } catch (err) {
      status.agentBotError = err instanceof Error ? err.message : String(err);
    }
    return status;
  }

  async enable(): Promise<ChatwootBotDevWebhookStatus> {
    if (isProductionProcess()) {
      throw new Error('Увімкнути локальні вебхуки можна лише з локального BO (npm run dev:chatwoot).');
    }
    const settings = await chatwootBotSettingsService.getSettings();
    const creds = patCredentials(settings);
    const devUrl = CHATWOOT_BOT_DEV_WEBHOOK_URL;
    const host = localHost();

    const health = await probeDevHealth(devUrl);
    if (!health.ok) {
      throw new Error(`Тунель chatwoot-dev недоступний (${health.error}). Запустіть: npm run dev:chatwoot`);
    }
    if (health.host !== host) {
      throw new Error(
        `Тунель chatwoot-dev веде на «${health.host ?? '?'}», а не на цей BO («${host ?? '?'}»). Зупиніть інший cloudflared.`,
      );
    }

    const state = await this.getState();
    const bot = await this.resolveAgentBot(creds, settings, state);
    const prodOutgoingUrl =
      bot.outgoingUrl && !isSameWebhookUrl(bot.outgoingUrl, devUrl)
        ? bot.outgoingUrl
        : state.prodOutgoingUrl ?? prodUrlFromHint(settings);
    if (!prodOutgoingUrl) {
      throw new Error('Невідомий прод Outgoing URL — заповніть «Outgoing URL hint» прод-адресою.');
    }

    await createChatwootApiClient(creds).updateAgentBotOutgoingUrl(bot.id, devUrl);
    const now = new Date();
    await this.saveState({
      enabled: true,
      agentBotId: bot.id,
      prodOutgoingUrl,
      devOutgoingUrl: devUrl,
      enabledAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + CHATWOOT_BOT_DEV_WEBHOOK_TTL_HOURS * 3600_000).toISOString(),
      enabledByHost: host,
      failedChecks: 0,
      lastChangeAt: now.toISOString(),
      lastChangeReason: 'manual_on',
      lastError: null,
    });
    this.shutdownCtx = { creds, agentBotId: bot.id, prodOutgoingUrl };
    logServer(`[ChatwootDevWebhook] outgoing_url → ${devUrl} (bot=${bot.id}, host=${host})`);
    return this.getStatus();
  }

  async disable(reason: ChatwootBotDevWebhookChangeReason = 'manual_off'): Promise<ChatwootBotDevWebhookStatus> {
    const settings = await chatwootBotSettingsService.getSettings();
    const creds = patCredentials(settings);
    const state = await this.getState();
    const prodOutgoingUrl = state.prodOutgoingUrl ?? prodUrlFromHint(settings);
    if (!prodOutgoingUrl) {
      throw new Error('Невідомий прод Outgoing URL — заповніть «Outgoing URL hint» прод-адресою.');
    }
    const bot = await this.resolveAgentBot(creds, settings, state);

    await createChatwootApiClient(creds).updateAgentBotOutgoingUrl(bot.id, prodOutgoingUrl);
    await this.saveState({
      ...DEFAULT_CHATWOOT_BOT_DEV_WEBHOOK_STATE,
      agentBotId: bot.id,
      prodOutgoingUrl,
      lastChangeAt: new Date().toISOString(),
      lastChangeReason: reason,
    });
    this.shutdownCtx = null;
    logServer(`[ChatwootDevWebhook] outgoing_url → ${prodOutgoingUrl} (bot=${bot.id}, reason=${reason})`);
    return this.getStatus();
  }

  /** Prod-cron: повертає outgoing_url на прод після TTL або кількох невдалих health поспіль. */
  async runGuard(): Promise<void> {
    const state = await this.getState();
    if (!state.enabled) return;

    const health = await probeDevHealth(state.devOutgoingUrl ?? CHATWOOT_BOT_DEV_WEBHOOK_URL);
    const decision = decideDevWebhookGuard(state, Date.now(), health.ok);
    if (decision.action === 'none') return;

    if (decision.action === 'update_failed_checks') {
      await this.saveState({ ...state, failedChecks: decision.failedChecks, lastError: health.error });
      return;
    }

    try {
      await this.disable(decision.reason);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logServer('[ChatwootDevWebhook] auto-revert failed', err);
      await this.saveState({ ...state, lastError: `auto-revert: ${message}` });
    }
  }

  /** SIGINT/SIGTERM локального BO: повернути URL, навіть якщо SSH-тунель до БД уже закрито. */
  async revertOnShutdown(): Promise<void> {
    const ctx = this.shutdownCtx;
    if (isProductionProcess() || !ctx) return;
    try {
      await createChatwootApiClient(ctx.creds).updateAgentBotOutgoingUrl(ctx.agentBotId, ctx.prodOutgoingUrl);
      this.shutdownCtx = null;
      logServer(`[ChatwootDevWebhook] shutdown: outgoing_url → ${ctx.prodOutgoingUrl}`);
    } catch (err) {
      logServer('[ChatwootDevWebhook] shutdown revert failed (prod cron поверне пізніше)', err);
      return;
    }
    try {
      const state = await this.getState();
      await this.saveState({
        ...DEFAULT_CHATWOOT_BOT_DEV_WEBHOOK_STATE,
        agentBotId: ctx.agentBotId,
        prodOutgoingUrl: ctx.prodOutgoingUrl,
        lastChangeAt: new Date().toISOString(),
        lastChangeReason: 'shutdown',
        lastError: state.lastError,
      });
    } catch (err) {
      // БД могла закритися разом із тунелем; prod cron побачить enabled і синхронізує стан.
      logServer('[ChatwootDevWebhook] shutdown state save skipped', err);
    }
  }
}

export const chatwootBotDevWebhookService = new ChatwootBotDevWebhookService();
