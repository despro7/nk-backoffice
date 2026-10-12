import { Router, type Request, type Response } from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { logServer } from '../lib/utils.js';
import type { ChatwootBotSettingsUpdate } from '../../shared/types/chatwootBot.js';
import { createChatwootApiClient } from '../modules/ChatwootBot/ChatwootApiClient.js';
import { chatwootBotEventLogService } from '../modules/ChatwootBot/ChatwootBotEventLogService.js';
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
