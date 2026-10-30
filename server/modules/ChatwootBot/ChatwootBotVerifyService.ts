import { createHmac } from 'node:crypto';
import { prisma } from '../../lib/utils.js';
import { normalizePhoneNumber } from '../../../shared/utils/phoneNormalizer.js';
import {
  CHATWOOT_BOT_ATTR_VERIFIED,
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
import {
  chatwootBotConversationStateService,
  conversationStateSecret,
} from './ChatwootBotConversationStateService.js';
import {
  bumpVerifyRate,
  isVerifyRateLimited,
  type ChatwootBotConversationStateSnapshot,
  type VerifyRateLimitConfig,
} from './chatwootBotConversationStateUtils.js';

export type ChatwootBotVerifyFromMessageResult = {
  /** null — у повідомленні не було спроби верифікації. */
  attempt: ChatwootBotVerifyAttemptResult | null;
  /** Стан розмови після обробки повідомлення (з таблиці, не з custom_attributes). */
  state: ChatwootBotConversationStateSnapshot;
};

export function hashVerifiedPhone(normalizedPhone: string): string {
  return createHmac('sha256', conversationStateSecret()).update(normalizedPhone).digest('hex');
}

function safeNormalizePhone(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  try {
    return normalizePhoneNumber(phone);
  } catch {
    return null;
  }
}

function phonesMatch(stored: string | null | undefined, normalizedInput: string): boolean {
  return safeNormalizePhone(stored) === normalizedInput;
}

function rateConfig(settings: ChatwootBotSettings): VerifyRateLimitConfig {
  return {
    windowMinutes: settings.verifyRateLimitWindowMinutes,
    maxAttempts: settings.verifyRateLimitMaxAttempts,
  };
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
  async verifyWithOrderNumber(phone: string, orderNumber: string): Promise<ChatwootBotVerifyAttemptResult> {
    const normalizedPhone = safeNormalizePhone(phone);
    if (!normalizedPhone) return { ok: false, reason: 'invalid_input' };
    const order = await findOrderByNumberToken(orderNumber);
    if (!order || !phonesMatch(order.customerPhone, normalizedPhone)) {
      return { ok: false, reason: 'mismatch' };
    }
    return { ok: true, orderId: order.id, method: 'order_number' };
  }

  async verifyWithLastOrderDate(phone: string, lastOrderDate: string): Promise<ChatwootBotVerifyAttemptResult> {
    const normalizedPhone = safeNormalizePhone(phone);
    if (!normalizedPhone) return { ok: false, reason: 'invalid_input' };
    const day = parseUserOrderDate(lastOrderDate);
    if (!day) return { ok: false, reason: 'invalid_input' };
    const order = await findLatestOrderByPhone(normalizedPhone);
    if (!order) return { ok: false, reason: 'mismatch' };
    const orderDay = kyivCalendarDay(order.orderDate ?? order.createdAt);
    if (orderDay !== day) return { ok: false, reason: 'mismatch' };
    return { ok: true, orderId: order.id, method: 'last_order_date' };
  }

  /** Телефон з профілю контакту (Viber/Telegram/WhatsApp або заповнений у Chatwoot). */
  private channelPhone(payload: ChatwootWebhookMessageCreated): string | null {
    return safeNormalizePhone(payload.conversation?.meta?.sender?.phone_number);
  }

  async tryVerifyFromUserMessage(
    settings: ChatwootBotSettings,
    payload: ChatwootWebhookMessageCreated,
    conversationId: number,
    content: string,
    messageId: number | null,
  ): Promise<ChatwootBotVerifyFromMessageResult> {
    let state = await chatwootBotConversationStateService.get(conversationId);
    const now = Date.now();
    const sessionExpiresAt = new Date(now + settings.verifySessionTtlHours * 3600_000);

    const phoneFromText = safeNormalizePhone(extractCallbackPhone(content));
    const orderToken = extractOrderNumberToken(content);
    const dateToken = parseUserOrderDate(content);

    if (!orderToken && !dateToken) {
      // Лише телефон — запамʼятовуємо, щоб наступне повідомлення з номером/датою пройшло верифікацію.
      if (phoneFromText && phoneFromText !== state.pendingPhone) {
        state = await chatwootBotConversationStateService.update(state, {
          pendingPhone: phoneFromText,
          pendingPhoneExpiresAt: sessionExpiresAt,
        });
      }
      return { attempt: null, state };
    }

    const phone = phoneFromText ?? state.pendingPhone ?? this.channelPhone(payload);
    if (!phone) return { attempt: null, state };

    const rateCfg = rateConfig(settings);
    if (isVerifyRateLimited(state, rateCfg, now)) {
      return { attempt: { ok: false, reason: 'rate_limited' }, state };
    }

    // Спершу номер замовлення; якщо не збігся — дата з того ж повідомлення (одна спроба в ліміті).
    let method: ChatwootBotVerifyMethod = orderToken ? 'order_number' : 'last_order_date';
    let attempt: ChatwootBotVerifyAttemptResult = orderToken
      ? await this.verifyWithOrderNumber(phone, orderToken)
      : await this.verifyWithLastOrderDate(phone, dateToken as string);
    if (attempt.ok === false && attempt.reason === 'mismatch' && orderToken && dateToken) {
      method = 'last_order_date';
      attempt = await this.verifyWithLastOrderDate(phone, dateToken);
    }

    const rate = bumpVerifyRate(state, rateCfg, now);
    if (attempt.ok === false) {
      state = await chatwootBotConversationStateService.update(state, {
        ...rate,
        failedAttempts: state.failedAttempts + 1,
        pendingPhone: phone,
        pendingPhoneExpiresAt: sessionExpiresAt,
      });
      chatwootBotAnalyticsService.recordBestEffort({
        kind: 'bot_action',
        conversationId,
        messageId,
        meta: { kind: 'verify_fail', method, reason: attempt.reason },
      });
      return { attempt, state };
    }

    state = await chatwootBotConversationStateService.update(state, {
      ...rate,
      verifiedOrderIds: [...new Set([...state.verifiedOrderIds, attempt.orderId])],
      verifiedPhoneHash: hashVerifiedPhone(phone),
      verifyExpiresAt: sessionExpiresAt,
      failedAttempts: 0,
      pendingPhone: phone,
      pendingPhoneExpiresAt: sessionExpiresAt,
    });
    const client = createChatwootApiClient(botMessagingCredentials(settings));
    await client.mergeConversationCustomAttributesBestEffort(conversationId, {
      [CHATWOOT_BOT_ATTR_VERIFIED]: true,
    });
    chatwootBotAnalyticsService.recordBestEffort({
      kind: 'bot_action',
      conversationId,
      messageId,
      meta: { kind: 'verify_success', method: attempt.method },
    });
    return { attempt, state };
  }
}

/**
 * Службова примітка для system prompt про результат верифікації в поточному повідомленні.
 * Без PII: лише статус, щоб LLM не переказувала підказку повторно.
 */
export function buildVerifyResultNote(attempt: ChatwootBotVerifyAttemptResult): string {
  const prefix = 'Службова примітка (не цитуй клієнту):';
  if (attempt.ok === true) {
    return `${prefix} клієнт щойно успішно пройшов верифікацію цим повідомленням. Не проси дані повторно – викликай get_verified_order і відповідай про замовлення.`;
  }
  if (attempt.reason === 'rate_limited') {
    return `${prefix} ліміт спроб верифікації вичерпано. Не проси дані знову – запропонуй звернутися до оператора або спробувати пізніше.`;
  }
  if (attempt.reason === 'invalid_input') {
    return `${prefix} спроба верифікації не вдалася: не вдалося розпізнати телефон або дату. Попроси уточнити саме цю частину.`;
  }
  return `${prefix} спроба верифікації не вдалася: телефон разом із номером замовлення або датою не збігся з жодним замовленням. Скажи про це прямо й попроси перевірити дані; не повторюй попередню підказку дослівно.`;
}

export const chatwootBotVerifyService = new ChatwootBotVerifyService();
