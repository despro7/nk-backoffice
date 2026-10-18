import { timingSafeEqual } from 'crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { logServer } from '../lib/utils.js';
import {
  CHATWOOT_BOT_HANDOVER_BUILD,
  CHATWOOT_WEBHOOK_SECRET_HEADER,
  type ChatwootWebhookMessageCreated,
} from '../../shared/types/chatwootBot.js';
import { resolveConversationApiId } from '../modules/ChatwootBot/chatwootConversationId.js';
import { chatwootBotOrchestrator } from '../modules/ChatwootBot/ChatwootBotOrchestrator.js';
import { chatwootBotEventLogService } from '../modules/ChatwootBot/ChatwootBotEventLogService.js';
import { chatwootBotSettingsService } from '../modules/ChatwootBot/ChatwootBotSettingsService.js';
import { getChatwootProcessorStamp } from '../modules/ChatwootBot/chatwootProcessorStamp.js';
import { extractWebhookHeadersMeta } from '../modules/ChatwootBot/ChatwootBotWebhookUtils.js';

const router = Router();

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
    processor: getChatwootProcessorStamp(),
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
    const convApiId = resolveConversationApiId(payload);
    logServer(
      `[ChatwootBot] webhook in · ${processor} · event=${payload.event ?? 'n/a'} ` +
        `conv=${convApiId ?? 'n/a'} msg=${payload.id ?? 'n/a'} auth=${headersMeta.detectedScheme} ` +
        `message_type=${String(payload.message_type ?? '∅')}`,
    );
    res.setHeader('X-Chatwoot-Bot-Processor', processor);
    const result = await chatwootBotOrchestrator.processWebhook(payload, {
      source: 'webhook',
      headersMeta,
    });
    logServer(
      `[ChatwootBot] webhook done conv=${result.conversationId ?? 'n/a'} ` +
        `action=${result.action} reason=${result.reason}`,
    );
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

export default router;
