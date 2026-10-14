import { Router, type Request, type Response } from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { logServer } from '../lib/utils.js';
import {
  CHATWOOT_BOT_HANDOVER_BUILD,
  type ChatwootBotSettingsUpdate,
} from '../../shared/types/chatwootBot.js';
import { chatwootWebhookHealthUrlFromOutgoingHint } from '../modules/ChatwootBot/chatwootWebhookHealthUrl.js';
import { createChatwootApiClient } from '../modules/ChatwootBot/ChatwootApiClient.js';
import {
  botMessagingCredentials,
  handoverAssignmentCredentials,
  hasHandoverUserPat,
} from '../modules/ChatwootBot/chatwootCredentials.js';
import { chatwootBotEventLogService } from '../modules/ChatwootBot/ChatwootBotEventLogService.js';
import { chatwootBotInboxHoursService } from '../modules/ChatwootBot/ChatwootBotInboxHoursService.js';
import { chatwootBotSettingsService } from '../modules/ChatwootBot/ChatwootBotSettingsService.js';

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

    if (!targetHealthUrl) {
      res.json({
        success: true,
        data: {
          localBuild,
          targetHealthUrl: null,
          targetBuild: null,
          mismatch: false,
          message: 'Заповніть Outgoing URL hint — повний webhook URL з Chatwoot.',
        },
      });
      return;
    }

    let targetBuild: string | null = null;
    let fetchError: string | null = null;
    try {
      const probe = await fetch(targetHealthUrl, {
        headers: { Accept: 'application/json', 'User-Agent': 'NK-Backoffice-ChatwootBot/1' },
        signal: AbortSignal.timeout(12_000),
      });
      const text = await probe.text();
      if (probe.ok) {
        try {
          const json = JSON.parse(text) as { handoverBuild?: string };
          targetBuild = json.handoverBuild?.trim() || null;
        } catch {
          fetchError = 'Health відповів не JSON';
        }
      } else {
        fetchError = `HTTP ${probe.status}`;
      }
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err);
    }

    const mismatch = targetBuild !== localBuild;
    res.json({
      success: true,
      data: {
        localBuild,
        targetHealthUrl,
        targetBuild,
        mismatch,
        fetchError,
        message: mismatch
          ? targetBuild
            ? `Chatwoot б’є в інший build (${targetBuild}), ніж цей сервер (${localBuild}). Handover на цільовому хості — стара логіка → HTML 400.`
            : 'Цільовий webhook-хост без handoverBuild (застарілий деплой). Echo може працювати, handover — ні. Потрібен деплой backoffice.'
          : 'Webhook-хост і цей сервер на одному build.',
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

export default router;
