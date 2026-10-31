import { Router, type Request, type Response } from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { logServer } from '../lib/utils.js';
import type { LlmPlatformSettingsUpdate } from '../../shared/types/llm.js';
import { llmSettingsService } from '../services/llm/LlmSettingsService.js';
import { llmModelsService } from '../services/llm/LlmModelsService.js';
import type { LlmProvider } from '../../shared/types/llm.js';
import { isLlmProvider } from '../../shared/constants/llmProviders.js';
import { jevClassifyChoice } from '../services/llm/typesafeJevClient.js';
import { llmUsageLogService } from '../services/llm/LlmUsageLogService.js';
import { llmBalancesService } from '../services/llm/LlmBalancesService.js';

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
    if (!isLlmProvider(provider)) {
      res.status(400).json({ success: false, error: 'invalid provider' });
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

router.post('/test-model/:provider', async (req: Request, res: Response) => {
  try {
    const provider = req.params.provider as LlmProvider;
    if (!isLlmProvider(provider)) {
      res.status(400).json({ success: false, error: 'invalid provider' });
      return;
    }
    const body = (req.body ?? {}) as {
      apiKey?: string;
      model?: string;
      message?: string;
      system?: string;
      maxOutputTokens?: number;
    };
    const model = String(body.model ?? '').trim();
    if (!model) {
      res.status(400).json({ success: false, error: 'model is required' });
      return;
    }
    const data = await llmModelsService.testModel(provider, model, body.apiKey, {
      message: body.message,
      system: body.system,
      maxOutputTokens: body.maxOutputTokens,
    });
    res.json({ success: true, data });
  } catch (error) {
    logServer('[LLM] test-model failed', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Model test failed',
    });
  }
});

router.post('/test-default', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as {
      message?: string;
      system?: string;
      maxOutputTokens?: number;
      provider?: LlmProvider;
      model?: string;
    };
    const data = await llmModelsService.testDefaultPlatform({
      message: body.message,
      system: body.system,
      maxOutputTokens: body.maxOutputTokens,
      provider: body.provider,
      model: body.model,
    });
    res.json({ success: true, data });
  } catch (error) {
    logServer('[LLM] test-default failed', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Default platform test failed',
    });
  }
});

router.post('/models/:provider', async (req: Request, res: Response) => {
  try {
    const provider = req.params.provider as LlmProvider;
    if (!isLlmProvider(provider)) {
      res.status(400).json({ success: false, error: 'invalid provider' });
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

const JEV_TEST_QUESTION = 'Скільки коштує доставка до Львова?';

/** POST body { apiKey?, model? } — тест Jev на прикладі класифікації питання клієнта. */
router.post('/typesafe/test', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as { apiKey?: string; model?: string };
    const settings = await llmSettingsService.getSettings();
    const startedAt = Date.now();
    const result = await jevClassifyChoice({
      apiKey: body.apiKey?.trim() || settings.typesafeApiKey,
      model: body.model?.trim() || settings.typesafeModel,
      state: JEV_TEST_QUESTION,
      instructions: 'Яка тема цього повідомлення клієнта інтернет-магазину?',
      criteria: {
        delivery: 'Доставка: вартість, терміни, способи',
        payment: 'Оплата замовлення',
        menu: 'Страви, склад, асортимент',
        none: 'Жодна з тем не підходить',
      },
      usage: { feature: 'jev_test', inputPricePer1M: settings.typesafeInputPricePer1M },
    });
    res.json({
      success: true,
      data: {
        model: result.model,
        choice: result.choice,
        confidence: result.confidence,
        probabilities: result.probabilities,
        latencyMs: Date.now() - startedAt,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        question: JEV_TEST_QUESTION,
      },
    });
  } catch (error) {
    logServer('[LLM] typesafe test failed', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'TypeSafe test failed',
    });
  }
});

const USAGE_PERIOD_DAYS = [7, 30];

/** GET /api/llm/usage?days=7|30 — наші витрати з журналу. */
router.get('/usage', async (req: Request, res: Response) => {
  try {
    const days = Number(req.query.days);
    const data = await llmUsageLogService.getSummary(USAGE_PERIOD_DAYS.includes(days) ? days : 7);
    res.json({ success: true, data });
  } catch (error) {
    logServer('[LLM] GET usage failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load LLM usage',
    });
  }
});

/** GET /api/llm/balances?refresh=true — баланси провайдерів (кеш 5 хв). */
router.get('/balances', async (req: Request, res: Response) => {
  try {
    const data = await llmBalancesService.getBalances(String(req.query.refresh ?? '') === 'true');
    res.json({ success: true, data });
  } catch (error) {
    logServer('[LLM] GET balances failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load LLM balances',
    });
  }
});

router.put('/settings', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as LlmPlatformSettingsUpdate;
    await llmSettingsService.saveSettings(body);
    llmBalancesService.invalidateCache();
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
