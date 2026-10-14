import { Router, type Request, type Response } from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { logServer } from '../lib/utils.js';
import type { ChatwootBotSettingsUpdate } from '../../shared/types/chatwootBot.js';
import { createChatwootApiClient } from '../modules/ChatwootBot/ChatwootApiClient.js';
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
    const client = createChatwootApiClient({
      baseUrl: settings.baseUrl,
      accountId: settings.accountId,
      apiAccessToken: settings.apiAccessToken,
    });
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
 * GET /api/chatwoot-bot/agents
 */
function resolveInboxApiToken(settings: Awaited<ReturnType<typeof chatwootBotSettingsService.getSettings>>): string {
  return settings.inboxApiAccessToken.trim() || settings.apiAccessToken;
}

router.get('/agents', async (_req: Request, res: Response) => {
  try {
    const settings = await chatwootBotSettingsService.getSettings();
    const client = createChatwootApiClient({
      baseUrl: settings.baseUrl,
      accountId: settings.accountId,
      apiAccessToken: resolveInboxApiToken(settings),
    });
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
    const inHours = await chatwootBotInboxHoursService.isWithinBusinessHours(settings, inboxId);
    res.json({ success: true, data: { schedule, inHours } });
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
