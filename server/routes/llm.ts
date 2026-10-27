import { Router, type Request, type Response } from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { logServer } from '../lib/utils.js';
import type { LlmPlatformSettingsUpdate } from '../../shared/types/llm.js';
import { llmSettingsService } from '../services/llm/LlmSettingsService.js';
import { llmModelsService } from '../services/llm/LlmModelsService.js';
import type { LlmProvider } from '../../shared/types/llm.js';

const router = Router();
const llmAdmin = requirePermission('settings', 'admin', 'Змінювати адмінські налаштування');

router.use(authenticateToken, llmAdmin);

router.get('/settings', async (req: Request, res: Response) => {
  try {
    const reveal = String(req.query.revealSecrets ?? '') === 'true';
    const data = await llmSettingsService.getSettingsForAdmin(reveal);
    res.json({ success: true, data });
  } catch (error) {
    logServer('[LLM] GET settings failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load LLM settings',
    });
  }
});

/**
 * GET /api/llm/models/:provider — список моделей (збережений ключ або env).
 * POST body { apiKey? } — чернетка ключа до збереження налаштувань.
 */
router.get('/models/:provider', async (req: Request, res: Response) => {
  try {
    const provider = req.params.provider;
    if (provider !== 'openai' && provider !== 'google') {
      res.status(400).json({ success: false, error: 'provider must be openai or google' });
      return;
    }
    const data = await llmModelsService.listModels(provider);
    res.json({ success: true, data });
  } catch (error) {
    logServer('[LLM] GET models failed', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list models',
    });
  }
});

router.post('/models/:provider', async (req: Request, res: Response) => {
  try {
    const provider = req.params.provider as LlmProvider;
    if (provider !== 'openai' && provider !== 'google') {
      res.status(400).json({ success: false, error: 'provider must be openai or google' });
      return;
    }
    const body = (req.body ?? {}) as { apiKey?: string };
    const data = await llmModelsService.listModels(provider, body.apiKey);
    res.json({ success: true, data });
  } catch (error) {
    logServer('[LLM] POST models failed', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list models',
    });
  }
});

router.put('/settings', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as LlmPlatformSettingsUpdate;
    await llmSettingsService.saveSettings(body);
    const data = await llmSettingsService.getSettingsForAdmin(false);
    res.json({ success: true, data });
  } catch (error) {
    logServer('[LLM] PUT settings failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save LLM settings',
    });
  }
});

export default router;
