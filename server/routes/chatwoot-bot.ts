import { Router, type Request, type Response } from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { logServer } from '../lib/utils.js';
import {
  CHATWOOT_BOT_HANDOVER_BUILD,
  CHATWOOT_WEBHOOK_PROBE_CONTENT_MARKER,
  CHATWOOT_WEBHOOK_SECRET_HEADER,
  type ChatwootBotSettingsUpdate,
} from '../../shared/types/chatwootBot.js';
import {
  getChatwootProcessorStamp,
  parseProcessorHost,
} from '../modules/ChatwootBot/chatwootProcessorStamp.js';
import {
  chatwootWebhookHealthUrlFromOutgoingHint,
  chatwootWebhookPostUrlFromOutgoingHint,
} from '../modules/ChatwootBot/chatwootWebhookHealthUrl.js';
import { createChatwootApiClient } from '../modules/ChatwootBot/ChatwootApiClient.js';
import {
  botMessagingCredentials,
  handoverAssignmentCredentials,
  hasHandoverUserPat,
} from '../modules/ChatwootBot/chatwootCredentials.js';
import { chatwootBotEventLogService } from '../modules/ChatwootBot/ChatwootBotEventLogService.js';
import { chatwootBotInboxHoursService } from '../modules/ChatwootBot/ChatwootBotInboxHoursService.js';
import { chatwootBotSettingsService } from '../modules/ChatwootBot/ChatwootBotSettingsService.js';
import { releaseHumanAgentActivePersistSlot } from '../modules/ChatwootBot/humanAgentActivePersistGate.js';
import { resetHumanHandoverOnConversation } from '../modules/ChatwootBot/chatwootHandoverReset.js';
import { chatwootBotAnalyticsService } from '../modules/ChatwootBot/ChatwootBotAnalyticsService.js';
import { sanitizeChatwootApiToken } from '../modules/ChatwootBot/chatwootHttp.js';
import { chatwootBotCatalogToolService } from '../modules/ChatwootBot/ChatwootBotCatalogToolService.js';
import { chatwootBotVerifyService } from '../modules/ChatwootBot/ChatwootBotVerifyService.js';
import { toVerifiedOrderDto } from '../modules/ChatwootBot/chatwootBotOrderRedaction.js';
import { chatwootBotLlmRunner } from '../modules/ChatwootBot/ChatwootBotLlmRunner.js';
import { prisma } from '../lib/utils.js';

const router = Router();
const chatwootAdmin = requirePermission(
  'settings',
  'admin',
  'Змінювати адмінські налаштування',
);

router.use(authenticateToken, chatwootAdmin);

/**
 * GET /api/chatwoot-bot/settings
 */
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const reveal = String(req.query.revealSecrets ?? '') === 'true';
    const data = await chatwootBotSettingsService.getSettingsForAdmin(reveal);
    res.json({ success: true, data });
  } catch (error) {
    logServer('[ChatwootBot] GET settings failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load settings',
    });
  }
});

/**
 * PUT /api/chatwoot-bot/settings
 */
router.put('/settings', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as ChatwootBotSettingsUpdate;
    await chatwootBotSettingsService.saveSettings(body);
    const data = await chatwootBotSettingsService.getSettingsForAdmin(false);
    res.json({ success: true, data });
  } catch (error) {
    logServer('[ChatwootBot] PUT settings failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save settings',
    });
  }
});

/**
 * POST /api/chatwoot-bot/test-connection
 */
router.post('/test-connection', async (_req: Request, res: Response) => {
  try {
    const settings = await chatwootBotSettingsService.getSettings();
    const client = createChatwootApiClient(botMessagingCredentials(settings));
    const result = await client.testConnection();
    res.status(result.ok ? 200 : 400).json({
      success: result.ok,
      data: result,
      message: result.message,
      error: result.error,
    });
  } catch (error) {
    logServer('[ChatwootBot] test-connection failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Test connection failed',
    });
  }
});

/**
 * GET /api/chatwoot-bot/webhook-processor-health
 * Порівняння build цього сервера з хостом з Outgoing URL hint (куди Chatwoot шле webhook).
 */
router.get('/webhook-processor-health', async (_req: Request, res: Response) => {
  try {
    const settings = await chatwootBotSettingsService.getSettings();
    const targetHealthUrl = chatwootWebhookHealthUrlFromOutgoingHint(settings.outgoingUrlHint);
    const localBuild = CHATWOOT_BOT_HANDOVER_BUILD;
    const localProcessor = getChatwootProcessorStamp();
    const localHost = parseProcessorHost(localProcessor);

    if (!targetHealthUrl) {
      res.json({
        success: true,
        data: {
          localBuild,
          localProcessor,
          localHost,
          targetHealthUrl: null,
          targetBuild: null,
          targetProcessor: null,
          targetHost: null,
          tunnelPointsHere: false,
          mismatch: false,
          message: 'Заповніть Outgoing URL hint – повний webhook URL з Chatwoot.',
        },
      });
      return;
    }

    let targetBuild: string | null = null;
    let targetProcessor: string | null = null;
    let fetchError: string | null = null;
    try {
      const probe = await fetch(targetHealthUrl, {
        headers: { Accept: 'application/json', 'User-Agent': 'NK-Backoffice-ChatwootBot/1' },
        signal: AbortSignal.timeout(12_000),
      });
      const text = await probe.text();
      if (probe.ok) {
        try {
          const json = JSON.parse(text) as { handoverBuild?: string; processor?: string };
          targetBuild = json.handoverBuild?.trim() || null;
          targetProcessor = json.processor?.trim() || null;
        } catch {
          fetchError = 'Health відповів не JSON';
        }
      } else {
        fetchError = `HTTP ${probe.status}`;
      }
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err);
    }

    const targetHost = parseProcessorHost(targetProcessor);
    const tunnelPointsHere =
      localHost != null && targetHost != null && localHost === targetHost;
    const buildMismatch = targetBuild != null && targetBuild !== localBuild;
    const hostMismatch = targetHost != null && localHost != null && !tunnelPointsHere;
    const mismatch = buildMismatch || hostMismatch || Boolean(fetchError);

    const isDevTunnel = settings.outgoingUrlHint.includes('chatwoot-dev.nk-food.shop');
    let message = 'Outgoing URL веде на цей процес (build і host збігаються).';
    if (fetchError) {
      message = isDevTunnel
        ? `Тунель chatwoot-dev недоступний (${fetchError}). Запустіть: npm run dev:chatwoot`
        : `Не вдалося перевірити webhook-хост: ${fetchError}`;
    } else if (hostMismatch) {
      message = isDevTunnel
        ? `Chatwoot-dev зараз обслуговує host «${targetHost}», а цей backoffice – «${localHost}». Запустіть npm run dev:chatwoot на Mac і зупиніть cloudflared на VPS для цього тунелю.`
        : `Webhook-хост (${targetHost}) – не цей сервер (${localHost}).`;
    } else if (buildMismatch) {
      message = `Різний build: тут ${localBuild}, на webhook-хості ${targetBuild}. Задеплойте або підніміть локальний тунель.`;
    } else if (!targetBuild) {
      message = 'На webhook-хості немає handoverBuild – застарілий деплой.';
    }

    res.json({
      success: true,
      data: {
        localBuild,
        localProcessor,
        localHost,
        targetHealthUrl,
        targetBuild,
        targetProcessor,
        targetHost,
        tunnelPointsHere,
        mismatch,
        fetchError,
        message,
      },
    });
  } catch (error) {
    logServer('[ChatwootBot] webhook-processor-health failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Health check failed',
    });
  }
});

/**
 * POST /api/chatwoot-bot/probe-outgoing-webhook
 * Тестовий POST на Outgoing URL (перевірка тунелю / проксі). Див. термінал: 📦 Webhook raw body.
 */
router.post('/probe-outgoing-webhook', async (_req: Request, res: Response) => {
  try {
    const settings = await chatwootBotSettingsService.getSettings();
    const postUrl = chatwootWebhookPostUrlFromOutgoingHint(settings.outgoingUrlHint);
    if (!postUrl) {
      res.status(400).json({ success: false, error: 'Заповніть коректний Outgoing URL hint' });
      return;
    }

    const payload = {
      event: 'message_created',
      id: 899_999,
      content: CHATWOOT_WEBHOOK_PROBE_CONTENT_MARKER,
      message_type: 'incoming',
      private: false,
      conversation: { id: 1, inbox_id: 1, status: 'pending' },
      sender: { id: 1, type: 'contact', name: 'Probe' },
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'NK-Backoffice-ChatwootBot-probe/1',
    };
    if (settings.webhookSecret.trim()) {
      headers[CHATWOOT_WEBHOOK_SECRET_HEADER] = settings.webhookSecret.trim();
    }

    const probe = await fetch(postUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    const bodyText = await probe.text().catch(() => '');

    res.json({
      success: true,
      data: {
        postUrl,
        httpStatus: probe.status,
        ok: probe.ok,
        bodyPreview: bodyText.slice(0, 300),
        hint:
          'Якщо HTTP 200 – дивіться термінал dev (📦 Webhook raw body). Chatwoot шле на той самий URL, що в Agent Bot → Outgoing URL (не лише hint тут).',
      },
    });
  } catch (error) {
    logServer('[ChatwootBot] probe-outgoing-webhook failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Probe failed',
    });
  }
});

/**
 * GET /api/chatwoot-bot/agents
 */
router.get('/agents', async (_req: Request, res: Response) => {
  try {
    const settings = await chatwootBotSettingsService.getSettings();
    const client = createChatwootApiClient(handoverAssignmentCredentials(settings));
    const agents = await client.listAgents();
    res.json({ success: true, data: agents });
  } catch (error) {
    logServer('[ChatwootBot] agents list failed', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list agents',
      data: [],
    });
  }
});

/**
 * GET /api/chatwoot-bot/inbox-schedule?inboxId=1
 */
router.get('/inbox-schedule', async (req: Request, res: Response) => {
  try {
    const settings = await chatwootBotSettingsService.getSettings();
    const inboxId = Number(req.query.inboxId ?? settings.handoverDefaultInboxId ?? 1);
    if (!Number.isFinite(inboxId) || inboxId <= 0) {
      res.status(400).json({ success: false, error: 'Invalid inboxId' });
      return;
    }
    chatwootBotInboxHoursService.invalidateCache(inboxId);
    const schedule = await chatwootBotInboxHoursService.getSchedule(settings, inboxId);
    if (!schedule) {
      res.status(400).json({
        success: false,
        error: 'Не вдалося завантажити inbox (потрібен User PAT у полі «Inbox API token»)',
      });
      return;
    }
    const hours = await chatwootBotInboxHoursService.isWithinBusinessHours(settings, inboxId);
    res.json({
      success: true,
      data: {
        schedule,
        inHours: hours.inHours,
        source: hours.source,
      },
    });
  } catch (error) {
    logServer('[ChatwootBot] inbox-schedule failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load inbox schedule',
    });
  }
});

/**
 * POST /api/chatwoot-bot/conversations/:conversationId/unassign
 * Debug: зняти assignee + скинути bot_human_handover_active (+ typing off).
 */
router.post('/conversations/:conversationId/unassign', async (req: Request, res: Response) => {
  try {
    const conversationId = Number(req.params.conversationId);
    if (!Number.isFinite(conversationId) || conversationId <= 0) {
      res.status(400).json({ success: false, error: 'Invalid conversationId' });
      return;
    }

    const settings = await chatwootBotSettingsService.getSettings();
    if (!settings.baseUrl.trim()) {
      res.status(400).json({ success: false, error: 'Base URL не налаштовано' });
      return;
    }
    if (!hasHandoverUserPat(settings) && !sanitizeChatwootApiToken(settings.apiAccessToken)) {
      res.status(400).json({
        success: false,
        error: 'Потрібен User PAT (Inbox API token) або Agent Bot token',
      });
      return;
    }

    const reset = await resetHumanHandoverOnConversation(settings, conversationId, false);

    releaseHumanAgentActivePersistSlot(conversationId);
    logServer(
      `[ChatwootBot] debug unassign conv=${conversationId} typing_off=${reset.typingOff}`,
    );

    res.json({
      success: true,
      data: {
        conversationId,
        unassigned: reset.unassigned,
        humanHandoverAttrCleared: reset.humanHandoverAttrCleared,
        typingOff: reset.typingOff,
      },
    });
  } catch (error) {
    logServer('[ChatwootBot] debug unassign failed', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unassign failed',
    });
  }
});

/**
 * DELETE /api/chatwoot-bot/recent-events
 */
router.delete('/recent-events', async (_req: Request, res: Response) => {
  try {
    const deleted = await chatwootBotEventLogService.clearAll();
    res.json({ success: true, data: { deleted } });
  } catch (error) {
    logServer('[ChatwootBot] clear recent-events failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear events',
    });
  }
});

/**
 * GET /api/chatwoot-bot/recent-events
 */
router.get('/recent-events', async (req: Request, res: Response) => {
  try {
    const limitRaw = Number(req.query.limit ?? 20);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
    const data = await chatwootBotEventLogService.recent(limit);
    res.json({ success: true, data });
  } catch (error) {
    logServer('[ChatwootBot] recent-events failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load events',
    });
  }
});

/**
 * POST /api/chatwoot-bot/tools/catalog
 */
router.post('/tools/catalog', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as { query?: string; limit?: number };
    const data = await chatwootBotCatalogToolService.listStorefrontCatalog({
      query: body.query,
      limit: body.limit,
    });
    res.json({ success: true, data });
  } catch (error) {
    logServer('[ChatwootBot] tools/catalog failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Catalog lookup failed',
    });
  }
});

/**
 * POST /api/chatwoot-bot/tools/verify-order
 */
router.post('/tools/verify-order', async (req: Request, res: Response) => {
  try {
    const settings = await chatwootBotSettingsService.getSettings();
    const body = (req.body ?? {}) as { phone?: string; orderNumber?: string };
    const phone = String(body.phone ?? '').trim();
    const orderNumber = String(body.orderNumber ?? '').trim();
    if (!phone || !orderNumber) {
      res.status(400).json({ success: false, error: 'phone та orderNumber обовʼязкові' });
      return;
    }
    const attempt = await chatwootBotVerifyService.verifyWithOrderNumber(phone, orderNumber, settings);
    if (attempt.ok === false) {
      res.json({
        success: true,
        data: {
          verified: false,
          message: settings.verifyFailMessage,
          reason: attempt.reason,
        },
      });
      return;
    }
    const order = await prisma.order.findUnique({ where: { id: attempt.orderId } });
    if (!order) {
      res.json({ success: true, data: { verified: false, message: settings.verifyFailMessage } });
      return;
    }
    let items: unknown = order.items;
    if (typeof items === 'string') {
      try {
        items = JSON.parse(items);
      } catch {
        items = [];
      }
    }
    res.json({
      success: true,
      data: {
        verified: true,
        order: toVerifiedOrderDto({
          orderNumber: order.orderNumber || order.externalId,
          status: order.status,
          statusText: order.statusText,
          ttn: order.ttn,
          items,
        }),
      },
    });
  } catch (error) {
    logServer('[ChatwootBot] tools/verify-order failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Verify failed',
    });
  }
});

/**
 * POST /api/chatwoot-bot/tools/verify-by-date
 */
router.post('/tools/verify-by-date', async (req: Request, res: Response) => {
  try {
    const settings = await chatwootBotSettingsService.getSettings();
    const body = (req.body ?? {}) as { phone?: string; lastOrderDate?: string };
    const phone = String(body.phone ?? '').trim();
    const lastOrderDate = String(body.lastOrderDate ?? '').trim();
    if (!phone || !lastOrderDate) {
      res.status(400).json({ success: false, error: 'phone та lastOrderDate обовʼязкові' });
      return;
    }
    const attempt = await chatwootBotVerifyService.verifyWithLastOrderDate(
      phone,
      lastOrderDate,
      settings,
    );
    if (attempt.ok === false) {
      res.json({
        success: true,
        data: {
          verified: false,
          message: settings.verifyFailMessage,
          reason: attempt.reason,
        },
      });
      return;
    }
    const order = await prisma.order.findUnique({ where: { id: attempt.orderId } });
    if (!order) {
      res.json({ success: true, data: { verified: false, message: settings.verifyFailMessage } });
      return;
    }
    let items: unknown = order.items;
    if (typeof items === 'string') {
      try {
        items = JSON.parse(items);
      } catch {
        items = [];
      }
    }
    res.json({
      success: true,
      data: {
        verified: true,
        order: toVerifiedOrderDto({
          orderNumber: order.orderNumber || order.externalId,
          status: order.status,
          statusText: order.statusText,
          ttn: order.ttn,
          items,
        }),
      },
    });
  } catch (error) {
    logServer('[ChatwootBot] tools/verify-by-date failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Verify failed',
    });
  }
});

/**
 * POST /api/chatwoot-bot/ai/test
 */
router.post('/ai/test', async (req: Request, res: Response) => {
  try {
    const settings = await chatwootBotSettingsService.getSettings();
    const body = (req.body ?? {}) as { message?: string };
    const message = String(body.message ?? '').trim() || 'Привіт! Що у вас є в наявності?';
    const payload = {
      conversation: { custom_attributes: {} },
    };
    const text = await chatwootBotLlmRunner.generateReply(
      { ...settings, aiEnabled: true },
      payload,
      message,
      { propagateErrors: true },
    );
    res.json({
      success: true,
      data: { reply: text ?? settings.fallbackMessage, usedFallback: !text },
    });
  } catch (error) {
    logServer('[ChatwootBot] ai/test failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'AI test failed',
    });
  }
});

/**
 * GET /api/chatwoot-bot/analytics/overview?from=&to=
 */
router.get('/analytics/overview', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 7);
    const fromRaw = String(req.query.from ?? '').trim();
    const toRaw = String(req.query.to ?? '').trim();
    const from = fromRaw ? new Date(fromRaw) : defaultFrom;
    const to = toRaw ? new Date(toRaw) : now;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      res.status(400).json({ success: false, error: 'Invalid from/to date' });
      return;
    }
    const overview = await chatwootBotAnalyticsService.getOverview(from, to);
    res.json({ success: true, data: overview });
  } catch (error) {
    logServer('[ChatwootBot] analytics overview failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load analytics',
    });
  }
});

export default router;
