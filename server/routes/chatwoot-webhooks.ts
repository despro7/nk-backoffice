import { timingSafeEqual } from 'crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { logServer } from '../lib/utils.js';
import {
  CHATWOOT_BOT_HANDOVER_BUILD,
  CHATWOOT_WEBHOOK_SECRET_HEADER,
  type ChatwootBotFixtureName,
  type ChatwootWebhookMessageCreated,
} from '../../shared/types/chatwootBot.js';
import { chatwootBotOrchestrator } from '../modules/ChatwootBot/ChatwootBotOrchestrator.js';
import { chatwootBotEventLogService } from '../modules/ChatwootBot/ChatwootBotEventLogService.js';
import { chatwootBotSettingsService } from '../modules/ChatwootBot/ChatwootBotSettingsService.js';
import { getChatwootProcessorStamp } from '../modules/ChatwootBot/chatwootProcessorStamp.js';
import { extractWebhookHeadersMeta } from '../modules/ChatwootBot/ChatwootBotWebhookUtils.js';

const router = Router();
const chatwootAdmin = requirePermission(
  'settings',
  'admin',
  'Змінювати адмінські налаштування',
);

function secretsEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

async function logWebhookAuthFailure(
  req: Request,
  payload: ChatwootWebhookMessageCreated,
  reason: string,
): Promise<void> {
  try {
    const settings = await chatwootBotSettingsService.getSettings();
    const headersMeta = extractWebhookHeadersMeta(req.headers);
    await chatwootBotEventLogService.append({
      source: 'webhook',
      action: 'error',
      reason,
      conversationId: payload.conversation?.id ?? null,
      messageId: payload.id ?? null,
      contentPreview: '',
      replyMode: settings.replyMode,
      dryRun: settings.replyMode === 'dry_run',
      details: `auth scheme=${headersMeta.detectedScheme}`,
      webhookEvent: payload.event ?? null,
      headersMeta,
      payload,
    });
  } catch (err) {
    logServer('[ChatwootBot] failed to log webhook auth rejection', err);
  }
}

async function verifyWebhookSecret(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const settings = await chatwootBotSettingsService.getSettings();
    if (!settings.webhookSecret) {
      next();
      return;
    }

    const headerValue = String(req.headers[CHATWOOT_WEBHOOK_SECRET_HEADER] ?? '');
    if (!headerValue || !secretsEqual(headerValue, settings.webhookSecret)) {
      logServer('[ChatwootBot] webhook secret mismatch');
      const payload = (req.body ?? {}) as ChatwootWebhookMessageCreated;
      await logWebhookAuthFailure(req, payload, 'invalid_webhook_secret');
      res.status(401).json({ success: false, error: 'Invalid webhook secret' });
      return;
    }
    next();
  } catch (error) {
    logServer('[ChatwootBot] webhook secret check failed', error);
    res.status(500).json({ success: false, error: 'Webhook auth error' });
  }
}

/**
 * GET /api/webhooks/chatwoot/health
 */
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Chatwoot webhook endpoint is healthy',
    handoverBuild: CHATWOOT_BOT_HANDOVER_BUILD,
    timestamp: new Date().toLocaleString('uk-UA'),
  });
});

/**
 * POST /api/webhooks/chatwoot
 * Production webhook from Chatwoot Agent Bot.
 */
router.post('/', verifyWebhookSecret, async (req: Request, res: Response) => {
  try {
    const payload = (req.body ?? {}) as ChatwootWebhookMessageCreated;
    const headersMeta = extractWebhookHeadersMeta(req.headers);
    const processor = getChatwootProcessorStamp();
    logServer(
      `[ChatwootBot] webhook in · ${processor} · event=${payload.event ?? 'n/a'} ` +
        `conv=${payload.conversation?.id ?? 'n/a'} msg=${payload.id ?? 'n/a'} auth=${headersMeta.detectedScheme}`,
    );
    res.setHeader('X-Chatwoot-Bot-Processor', processor);
    const result = await chatwootBotOrchestrator.processWebhook(payload, {
      source: 'webhook',
      headersMeta,
    });
    res.status(200).json({
      success: true,
      action: result.action,
      reason: result.reason,
      dryRun: result.dryRun,
    });
  } catch (error) {
    logServer('[ChatwootBot] webhook processing error', error);
    res.status(200).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal error',
    });
  }
});

/**
 * Доступ до simulate: JWT admin або NODE_ENV=development.
 */
function allowSimulate(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'development') {
    next();
    return;
  }
  void authenticateToken(req, res, () => {
    if (res.headersSent) return;
    void chatwootAdmin(req, res, next);
  });
}

/**
 * POST /api/webhooks/chatwoot/simulate
 * Body: повний payload або { fixture: 'echo' | 'handover', overrides? }.
 */
router.post('/simulate', allowSimulate, async (req: Request, res: Response) => {
  try {
    const { getChatwootBotFixture } = await import(
      '../modules/ChatwootBot/fixtures/index.js'
    );

    const body = req.body ?? {};
    let payload: ChatwootWebhookMessageCreated;

    if (typeof body.fixture === 'string') {
      const name = body.fixture as ChatwootBotFixtureName;
      if (name !== 'echo' && name !== 'handover') {
        return res.status(400).json({
          success: false,
          error: 'fixture must be "echo" or "handover"',
        });
      }
      payload = {
        ...getChatwootBotFixture(name),
        ...(body.overrides && typeof body.overrides === 'object' ? body.overrides : {}),
      };
    } else if (body.event || body.message_type || body.conversation) {
      payload = body as ChatwootWebhookMessageCreated;
    } else {
      payload = getChatwootBotFixture('echo');
    }

    const result = await chatwootBotOrchestrator.processWebhook(payload, {
      source: 'simulate',
      headersMeta: extractWebhookHeadersMeta(req.headers),
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logServer('[ChatwootBot] simulate error', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Simulate failed',
    });
  }
});

export default router;
