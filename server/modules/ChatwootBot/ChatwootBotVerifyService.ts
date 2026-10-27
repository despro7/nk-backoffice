import { createHmac } from 'node:crypto';
import { prisma } from '../../lib/utils.js';
import { normalizePhoneNumber } from '../../../shared/utils/phoneNormalizer.js';
import {
  CHATWOOT_BOT_ATTR_VERIFY_EXPIRES_AT,
  CHATWOOT_BOT_ATTR_VERIFY_RATE_COUNT,
  CHATWOOT_BOT_ATTR_VERIFY_RATE_WINDOW,
  CHATWOOT_BOT_ATTR_VERIFIED_ORDER_IDS,
  CHATWOOT_BOT_ATTR_VERIFIED_PHONE_HASH,
  type ChatwootBotSettings,
  type ChatwootWebhookMessageCreated,
} from '../../../shared/types/chatwootBot.js';
import type {
  ChatwootBotVerifyAttemptResult,
  ChatwootBotVerifyMethod,
} from '../../../shared/types/chatwootBotTools.js';
import { extractCallbackPhone } from './ChatwootBotHandoverUtils.js';
import {
  extractOrderNumberToken,
  kyivCalendarDay,
  parseUserOrderDate,
} from './chatwootBotVerifyDateParse.js';
import { botMessagingCredentials } from './chatwootCredentials.js';
import { createChatwootApiClient } from './ChatwootApiClient.js';
import { chatwootBotAnalyticsService } from './ChatwootBotAnalyticsService.js';

function verifySecret(): string {
  return process.env.JWT_SECRET || process.env.CHATWOOT_WEBHOOK_SECRET || 'chatwoot-bot-verify';
}

export function hashVerifiedPhone(normalizedPhone: string): string {
  return createHmac('sha256', verifySecret()).update(normalizedPhone).digest('hex');
}

function parseVerifiedOrderIds(attrs: Record<string, unknown> | undefined): number[] {
  const raw = attrs?.[CHATWOOT_BOT_ATTR_VERIFIED_ORDER_IDS];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
      }
    } catch {
      return [];
    }
  }
  if (Array.isArray(raw)) {
    return raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
  }
  return [];
}

export function isVerifySessionActive(attrs: Record<string, unknown> | undefined): boolean {
  const expiresRaw = attrs?.[CHATWOOT_BOT_ATTR_VERIFY_EXPIRES_AT];
  if (typeof expiresRaw !== 'string' || !expiresRaw.trim()) return false;
  const expires = new Date(expiresRaw);
  return !Number.isNaN(expires.getTime()) && expires.getTime() > Date.now();
}

export function getVerifiedOrderIdsFromAttrs(attrs: Record<string, unknown> | undefined): number[] {
  if (!isVerifySessionActive(attrs)) return [];
  return parseVerifiedOrderIds(attrs);
}

function phonesMatch(stored: string | null | undefined, normalizedInput: string): boolean {
  if (!stored?.trim()) return false;
  try {
    return normalizePhoneNumber(stored) === normalizedInput;
  } catch {
    return false;
  }
}

async function findOrderByNumberToken(orderToken: string) {
  const token = orderToken.trim();
  if (!token) return null;
  const byExternal = await prisma.order.findUnique({ where: { externalId: token } });
  if (byExternal) return byExternal;
  return prisma.order.findFirst({ where: { orderNumber: token } });
}

async function findLatestOrderByPhone(normalizedPhone: string) {
  const digits = normalizedPhone.replace(/\D/g, '');
  const suffix = digits.slice(-9);
  const candidates = await prisma.order.findMany({
    where: suffix.length >= 9 ? { customerPhone: { contains: suffix } } : { customerPhone: normalizedPhone },
    orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
    take: 30,
  });
  return candidates.find((o) => phonesMatch(o.customerPhone, normalizedPhone)) ?? null;
}

export class ChatwootBotVerifyService {
  private checkRateLimit(attrs: Record<string, unknown>, settings: ChatwootBotSettings): boolean {
    const windowStartRaw = attrs[CHATWOOT_BOT_ATTR_VERIFY_RATE_WINDOW];
    const countRaw = attrs[CHATWOOT_BOT_ATTR_VERIFY_RATE_COUNT];
    const now = Date.now();
    const windowMs = settings.verifyRateLimitWindowMinutes * 60_000;
    let windowStart = typeof windowStartRaw === 'string' ? Date.parse(windowStartRaw) : NaN;
    let count = Number(countRaw);
    if (!Number.isFinite(windowStart) || now - windowStart > windowMs) {
      return true;
    }
    return count < settings.verifyRateLimitMaxAttempts;
  }

  private bumpRateLimit(
    attrs: Record<string, unknown>,
    settings: ChatwootBotSettings,
  ): Record<string, unknown> {
    const windowStartRaw = attrs[CHATWOOT_BOT_ATTR_VERIFY_RATE_WINDOW];
    const countRaw = attrs[CHATWOOT_BOT_ATTR_VERIFY_RATE_COUNT];
    const now = Date.now();
    const windowMs = settings.verifyRateLimitWindowMinutes * 60_000;
    let windowStart = typeof windowStartRaw === 'string' ? Date.parse(windowStartRaw) : NaN;
    let count = Number(countRaw);
    if (!Number.isFinite(windowStart) || now - windowStart > windowMs) {
      windowStart = now;
      count = 0;
    }
    return {
      [CHATWOOT_BOT_ATTR_VERIFY_RATE_WINDOW]: new Date(windowStart).toISOString(),
      [CHATWOOT_BOT_ATTR_VERIFY_RATE_COUNT]: count + 1,
    };
  }

  async verifyWithOrderNumber(
    phone: string,
    orderNumber: string,
    settings: ChatwootBotSettings,
    attrs: Record<string, unknown> = {},
  ): Promise<ChatwootBotVerifyAttemptResult> {
    if (!this.checkRateLimit(attrs, settings)) {
      return { ok: false, reason: 'rate_limited' };
    }
    let normalizedPhone: string;
    try {
      normalizedPhone = normalizePhoneNumber(phone);
    } catch {
      return { ok: false, reason: 'invalid_input' };
    }
    const order = await findOrderByNumberToken(orderNumber);
    if (!order || !phonesMatch(order.customerPhone, normalizedPhone)) {
      return { ok: false, reason: 'mismatch' };
    }
    return { ok: true, orderId: order.id, method: 'order_number' };
  }

  async verifyWithLastOrderDate(
    phone: string,
    lastOrderDate: string,
    settings: ChatwootBotSettings,
    attrs: Record<string, unknown> = {},
  ): Promise<ChatwootBotVerifyAttemptResult> {
    if (!this.checkRateLimit(attrs, settings)) {
      return { ok: false, reason: 'rate_limited' };
    }
    let normalizedPhone: string;
    try {
      normalizedPhone = normalizePhoneNumber(phone);
    } catch {
      return { ok: false, reason: 'invalid_input' };
    }
    const day = parseUserOrderDate(lastOrderDate);
    if (!day) return { ok: false, reason: 'invalid_input' };
    const order = await findLatestOrderByPhone(normalizedPhone);
    if (!order) return { ok: false, reason: 'mismatch' };
    const orderDay = kyivCalendarDay(order.orderDate ?? order.createdAt);
    if (orderDay !== day) return { ok: false, reason: 'mismatch' };
    return { ok: true, orderId: order.id, method: 'last_order_date' };
  }

  async persistVerifySession(
    settings: ChatwootBotSettings,
    conversationId: number,
    orderId: number,
    normalizedPhone: string,
    existingAttrs: Record<string, unknown>,
    method: ChatwootBotVerifyMethod,
    messageId: number | null,
  ): Promise<void> {
    const expires = new Date(Date.now() + settings.verifySessionTtlHours * 3600_000);
    const prevIds = parseVerifiedOrderIds(existingAttrs);
    const orderIds = [...new Set([...prevIds, orderId])];
    const client = createChatwootApiClient(botMessagingCredentials(settings));
    await client.mergeConversationCustomAttributesBestEffort(conversationId, {
      [CHATWOOT_BOT_ATTR_VERIFY_EXPIRES_AT]: expires.toISOString(),
      [CHATWOOT_BOT_ATTR_VERIFIED_ORDER_IDS]: JSON.stringify(orderIds),
      [CHATWOOT_BOT_ATTR_VERIFIED_PHONE_HASH]: hashVerifiedPhone(normalizedPhone),
    });
    chatwootBotAnalyticsService.recordBestEffort({
      kind: 'bot_action',
      conversationId,
      messageId,
      meta: { kind: 'verify_success', method },
    });
  }

  resolvePhoneFromMessage(
    content: string,
    payload: ChatwootWebhookMessageCreated,
  ): string | null {
    const fromText = extractCallbackPhone(content);
    if (fromText) return fromText;
    const metaPhone = payload.conversation?.meta?.sender?.phone_number;
    if (typeof metaPhone === 'string' && metaPhone.trim()) {
      try {
        return normalizePhoneNumber(metaPhone);
      } catch {
        return null;
      }
    }
    return null;
  }

  async tryVerifyFromUserMessage(
    settings: ChatwootBotSettings,
    payload: ChatwootWebhookMessageCreated,
    conversationId: number,
    content: string,
    messageId: number | null,
  ): Promise<ChatwootBotVerifyAttemptResult | null> {
    const attrs = (payload.conversation?.custom_attributes ?? {}) as Record<string, unknown>;
    const phone = this.resolvePhoneFromMessage(content, payload);
    if (!phone) return null;

    const orderToken = extractOrderNumberToken(content);
    const dateToken = parseUserOrderDate(content);

    let attempt: ChatwootBotVerifyAttemptResult | null = null;
    if (orderToken) {
      attempt = await this.verifyWithOrderNumber(phone, orderToken, settings, attrs);
    } else if (dateToken) {
      attempt = await this.verifyWithLastOrderDate(phone, dateToken, settings, attrs);
    } else {
      return null;
    }

    const rateBump = this.bumpRateLimit(attrs, settings);
    const client = createChatwootApiClient(botMessagingCredentials(settings));
    await client.mergeConversationCustomAttributesBestEffort(conversationId, rateBump);

    if (attempt.ok === false) {
      chatwootBotAnalyticsService.recordBestEffort({
        kind: 'bot_action',
        conversationId,
        messageId,
        meta: {
          kind: 'verify_fail',
          method: orderToken ? 'order_number' : 'last_order_date',
          reason: attempt.reason,
        },
      });
      return attempt;
    }

    let normalizedPhone: string;
    try {
      normalizedPhone = normalizePhoneNumber(phone);
    } catch {
      return { ok: false, reason: 'invalid_input' };
    }

    await this.persistVerifySession(
      settings,
      conversationId,
      attempt.orderId,
      normalizedPhone,
      attrs,
      attempt.method,
      messageId,
    );
    return attempt;
  }
}

export const chatwootBotVerifyService = new ChatwootBotVerifyService();
