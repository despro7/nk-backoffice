import { createHmac } from 'node:crypto';
import {
  CHATWOOT_BOT_ATTR_VERIFIED,
  type ChatwootBotSettings,
  type ChatwootWebhookMessageCreated,
} from '../../../shared/types/chatwootBot.js';
import type {
  ChatwootBotVerifyAttemptResult,
  ChatwootBotVerifyMethod,
  ChatwootBotVerifyToolResult,
} from '../../../shared/types/chatwootBotTools.js';
import { extractCallbackPhone } from './ChatwootBotHandoverUtils.js';
import {
  extractOrderNumberToken,
  isDayInRange,
  kyivCalendarDay,
  normalizeVerifyDateRange,
  parseUserOrderDate,
} from './chatwootBotVerifyDateParse.js';
import { botMessagingCredentials } from './chatwootCredentials.js';
import { createChatwootApiClient } from './ChatwootApiClient.js';
import { chatwootBotAnalyticsService } from './ChatwootBotAnalyticsService.js';
import {
  findOrderByNumberToken,
  findOrdersByPhone,
  phonesMatch,
  safeNormalizePhone,
} from './chatwootBotOrderLookup.js';
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

function rateConfig(settings: ChatwootBotSettings): VerifyRateLimitConfig {
  return {
    windowMinutes: settings.verifyRateLimitWindowMinutes,
    maxAttempts: settings.verifyRateLimitMaxAttempts,
  };
}

/** Підказки для LLM у відповіді verify_customer (без PII). */
const VERIFY_TOOL_HINTS = {
  success: 'Верифікацію пройдено. Викликай get_verified_order і розкажи клієнту про замовлення.',
  phoneRequired: 'Попроси номер телефону, на який оформлювали замовлення.',
  detailsRequired: 'Телефон є. Попроси номер замовлення або дату (приблизно, у межах 1–3 днів), коли його робили.',
  rangeTooWide: 'Інтервал дат завеликий. Попроси уточнити день (до 3 днів) або назвати номер замовлення.',
  ambiguous: 'За цей період кілька замовлень. Попроси номер замовлення.',
  rateLimited: 'Ліміт спроб вичерпано. Не проси дані знову, запропонуй оператора або спробувати пізніше.',
  invalidInput: 'Дані не розпізнано: телефон український, дата у форматі YYYY-MM-DD. Уточни в клієнта.',
} as const;

export type ChatwootBotVerifyToolArgs = {
  phone?: string;
  orderNumber?: string;
  dateFrom?: string;
  dateTo?: string;
};

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

  /**
   * Усі замовлення телефону за календарні дні [from, to] (Київ), а не лише останнє.
   * Точна дата відкриває всі замовлення того дня; ширший інтервал з кількома збігами — ambiguous.
   */
  async verifyWithDateRange(
    phone: string,
    from: string,
    to: string,
    method: ChatwootBotVerifyMethod = 'date_range',
  ): Promise<ChatwootBotVerifyAttemptResult> {
    const normalizedPhone = safeNormalizePhone(phone);
    if (!normalizedPhone) return { ok: false, reason: 'invalid_input' };
    const orders = await findOrdersByPhone(normalizedPhone);
    const matched = orders.filter((o) => isDayInRange(kyivCalendarDay(o.orderDate ?? o.createdAt), from, to));
    if (matched.length === 0) return { ok: false, reason: 'mismatch' };
    if (matched.length > 1 && from !== to) return { ok: false, reason: 'ambiguous' };
    return { ok: true, orderId: matched[0].id, orderIds: matched.map((o) => o.id), method };
  }

  async verifyWithLastOrderDate(phone: string, lastOrderDate: string): Promise<ChatwootBotVerifyAttemptResult> {
    const day = parseUserOrderDate(lastOrderDate);
    if (!day) return { ok: false, reason: 'invalid_input' };
    return this.verifyWithDateRange(phone, day, day, 'last_order_date');
  }

  /** Телефон з профілю контакту (Viber/Telegram/WhatsApp або заповнений у Chatwoot). */
  channelPhone(payload: ChatwootWebhookMessageCreated): string | null {
    return safeNormalizePhone(payload.conversation?.meta?.sender?.phone_number);
  }

  /**
   * Запамʼятовує телефон, наданий без номера/дати. Кожна заміна вже збереженого телефону
   * рахується як спроба: короткий статус за телефоном не має давати перебирати чужі номери.
   */
  private async rememberPhone(
    settings: ChatwootBotSettings,
    state: ChatwootBotConversationStateSnapshot,
    phone: string,
  ): Promise<{ state: ChatwootBotConversationStateSnapshot; limited: boolean }> {
    if (phone === state.pendingPhone) return { state, limited: false };
    const now = Date.now();
    const cfg = rateConfig(settings);
    const isReplacement = state.pendingPhone != null;
    if (isReplacement && isVerifyRateLimited(state, cfg, now)) return { state, limited: true };
    const next = await chatwootBotConversationStateService.update(state, {
      ...(isReplacement ? bumpVerifyRate(state, cfg, now) : {}),
      pendingPhone: phone,
      pendingPhoneExpiresAt: new Date(now + settings.verifySessionTtlHours * 3600_000),
    });
    return { state: next, limited: false };
  }

  /** Записує результат спроби в стан розмови (ліміт, лічильник невдач, сесія) і аналітику. */
  private async recordAttempt(
    settings: ChatwootBotSettings,
    conversationId: number,
    state: ChatwootBotConversationStateSnapshot,
    phone: string,
    attempt: ChatwootBotVerifyAttemptResult,
    method: ChatwootBotVerifyMethod,
    messageId: number | null,
  ): Promise<ChatwootBotConversationStateSnapshot> {
    const now = Date.now();
    const sessionExpiresAt = new Date(now + settings.verifySessionTtlHours * 3600_000);
    const rate = bumpVerifyRate(state, rateConfig(settings), now);

    if (attempt.ok === false) {
      chatwootBotAnalyticsService.recordBestEffort({
        kind: 'bot_action',
        conversationId,
        messageId,
        meta: { kind: 'verify_fail', method, reason: attempt.reason },
      });
      return chatwootBotConversationStateService.update(state, {
        ...rate,
        failedAttempts: state.failedAttempts + 1,
        pendingPhone: phone,
        pendingPhoneExpiresAt: sessionExpiresAt,
      });
    }

    const next = await chatwootBotConversationStateService.update(state, {
      ...rate,
      verifiedOrderIds: [...new Set([...state.verifiedOrderIds, ...(attempt.orderIds ?? [attempt.orderId])])],
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
    return next;
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

    const phoneFromText = safeNormalizePhone(extractCallbackPhone(content));
    const orderToken = extractOrderNumberToken(content);
    const dateToken = parseUserOrderDate(content);

    if (!orderToken && !dateToken) {
      // Лише телефон — запамʼятовуємо, щоб наступне повідомлення з номером/датою пройшло верифікацію.
      if (phoneFromText) {
        const remembered = await this.rememberPhone(settings, state, phoneFromText);
        state = remembered.state;
        if (remembered.limited) return { attempt: { ok: false, reason: 'rate_limited' }, state };
      }
      return { attempt: null, state };
    }

    const phone = phoneFromText ?? state.pendingPhone ?? this.channelPhone(payload);
    if (!phone) return { attempt: null, state };

    if (isVerifyRateLimited(state, rateConfig(settings), now)) {
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

    state = await this.recordAttempt(settings, conversationId, state, phone, attempt, method, messageId);
    return { attempt, state };
  }

  /**
   * LLM tool verify_customer: модель сама витягує телефон, номер або інтервал дат
   * («у понеділок», «понеділок чи вівторок»); бекенд доповнює збереженим телефоном.
   */
  async verifyFromTool(
    settings: ChatwootBotSettings,
    conversationId: number,
    state: ChatwootBotConversationStateSnapshot,
    args: ChatwootBotVerifyToolArgs,
    channelPhone: string | null,
    messageId: number | null,
  ): Promise<{ result: ChatwootBotVerifyToolResult; state: ChatwootBotConversationStateSnapshot }> {
    const now = Date.now();
    const phoneArg = args.phone?.trim();
    const phoneFromArgs = phoneArg ? safeNormalizePhone(extractCallbackPhone(phoneArg) ?? phoneArg) : null;
    if (phoneArg && !phoneFromArgs) {
      return { result: { verified: false, code: 'invalid_input', hint: VERIFY_TOOL_HINTS.invalidInput }, state };
    }
    const phone = phoneFromArgs ?? state.pendingPhone ?? channelPhone;
    if (!phone) {
      return { result: { verified: false, code: 'phone_required', hint: VERIFY_TOOL_HINTS.phoneRequired }, state };
    }

    const orderArg = args.orderNumber?.trim();
    const orderToken = orderArg ? extractOrderNumberToken(orderArg) ?? orderArg : null;
    const hasDates = Boolean(args.dateFrom?.trim() || args.dateTo?.trim());
    if (!orderToken && !hasDates) {
      let next = state;
      if (phoneFromArgs) {
        const remembered = await this.rememberPhone(settings, state, phoneFromArgs);
        next = remembered.state;
        if (remembered.limited) {
          return { result: { verified: false, code: 'rate_limited', hint: VERIFY_TOOL_HINTS.rateLimited }, state: next };
        }
      }
      return { result: { verified: false, code: 'details_required', hint: VERIFY_TOOL_HINTS.detailsRequired }, state: next };
    }

    const range = hasDates
      ? normalizeVerifyDateRange(args.dateFrom, args.dateTo, kyivCalendarDay(new Date(now)))
      : null;
    if (!orderToken && range && range.ok === false) {
      const code = range.reason === 'too_wide' ? 'range_too_wide' : 'invalid_input';
      const hint = range.reason === 'too_wide' ? VERIFY_TOOL_HINTS.rangeTooWide : VERIFY_TOOL_HINTS.invalidInput;
      return { result: { verified: false, code, hint }, state };
    }

    if (isVerifyRateLimited(state, rateConfig(settings), now)) {
      return { result: { verified: false, code: 'rate_limited', hint: VERIFY_TOOL_HINTS.rateLimited }, state };
    }

    let method: ChatwootBotVerifyMethod = orderToken ? 'order_number' : 'date_range';
    let attempt: ChatwootBotVerifyAttemptResult = orderToken
      ? await this.verifyWithOrderNumber(phone, orderToken)
      : { ok: false, reason: 'mismatch' };
    if (attempt.ok === false && range?.ok === true) {
      method = 'date_range';
      attempt = await this.verifyWithDateRange(phone, range.from, range.to);
    }

    const next = await this.recordAttempt(settings, conversationId, state, phone, attempt, method, messageId);
    if (attempt.ok === true) {
      const ordersVerified = (attempt.orderIds ?? [attempt.orderId]).length;
      return { result: { verified: true, ordersVerified, hint: VERIFY_TOOL_HINTS.success }, state: next };
    }
    const failure: Record<typeof attempt.reason, ChatwootBotVerifyToolResult> = {
      mismatch: { verified: false, code: 'mismatch', hint: settings.verifyFailMessage },
      ambiguous: { verified: false, code: 'ambiguous', hint: VERIFY_TOOL_HINTS.ambiguous },
      rate_limited: { verified: false, code: 'rate_limited', hint: VERIFY_TOOL_HINTS.rateLimited },
      invalid_input: { verified: false, code: 'invalid_input', hint: VERIFY_TOOL_HINTS.invalidInput },
    };
    return { result: failure[attempt.reason], state: next };
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
  if (attempt.reason === 'ambiguous') {
    return `${prefix} за названий період у клієнта кілька замовлень. Попроси номер замовлення.`;
  }
  if (attempt.reason === 'invalid_input') {
    return `${prefix} спроба верифікації не вдалася: не вдалося розпізнати телефон або дату. Попроси уточнити саме цю частину.`;
  }
  return `${prefix} спроба верифікації не вдалася: телефон разом із номером замовлення або датою не збігся з жодним замовленням. Скажи про це прямо й попроси перевірити дані; не повторюй попередню підказку дослівно.`;
}

export const chatwootBotVerifyService = new ChatwootBotVerifyService();
