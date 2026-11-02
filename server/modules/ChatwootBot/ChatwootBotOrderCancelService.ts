import { botInstruction } from '../../../shared/constants/chatwootBotInstructions.js';
import { logServer, prisma } from '../../lib/utils.js';
import {
  CHATWOOT_BOT_ATTR_HUMAN_HANDOVER_ACTIVE,
  type ChatwootBotSettings,
} from '../../../shared/types/chatwootBot.js';
import {
  ORDER_CANCEL_STATUS_OPTIONS,
  ORDER_CANCEL_TARGET_STATUS,
  ORDER_CANCEL_TARGET_STATUS_TEXT,
} from '../../../shared/constants/chatwootBotOrderCancel.js';
import { salesDriveService } from '../../services/salesDriveService.js';
import { orderDatabaseService } from '../../services/orderDatabaseService.js';
import { createChatwootApiClient } from './ChatwootApiClient.js';
import { extractCallbackPhone } from './ChatwootBotHandoverUtils.js';
import { assignHumanAgentWithBotFallback } from './chatwootHandoverAssign.js';
import { botMessagingCredentials, handoverAssignmentCredentials, hasHandoverUserPat } from './chatwootCredentials.js';
import { findOrdersByPhone, safeNormalizePhone } from './chatwootBotOrderLookup.js';
import {
  cancelNameMatches,
  hasFullName,
  isCancelCandidateStatus,
  orderCancelMode,
  orderTokenMatches,
  type OrderCancelMode,
} from './chatwootBotOrderCancelRules.js';
import { chatwootBotTelegramNotifier } from './chatwootBotTelegramNotifier.js';

const MAX_FAILED_ATTEMPTS = 3;
const FAILED_WINDOW_MS = 30 * 60 * 1000;

/** Невдалі спроби (телефон + ПІБ не збіглися) по розмові — щоб не перебирати чужі замовлення. */
const failedAttempts = new Map<number, { count: number; since: number }>();

export type OrderCancelToolArgs = {
  phone?: string;
  fullName?: string;
  orderNumber?: string;
  reason?: string;
};

export type OrderCancelContext = {
  settings: ChatwootBotSettings;
  /** null — пісочниця: нічого не змінюємо й не сповіщаємо. */
  conversationId: number | null;
  /** Телефон, який клієнт уже дав у розмові, або з каналу. */
  knownPhone: string | null;
};

export type OrderCancelToolResult = {
  code:
    | 'disabled'
    | 'phone_required'
    | 'name_required'
    | 'not_found'
    | 'rate_limited'
    | 'choose_order'
    | 'reason_required'
    | 'cancelled'
    | 'pending_operator'
    | 'operator_required';
  hint: string;
  orders?: Array<{ orderNumber: string; date: string | null; status: string; total: number | null }>;
  order?: { orderNumber: string; status: string };
  /** Пісочниця: дія лише змодельована. */
  simulated?: boolean;
};

function statusLabel(status: string, statusText: string | null): string {
  return ORDER_CANCEL_STATUS_OPTIONS.find((o) => o.id === status)?.label ?? statusText ?? status;
}

function kyivDate(date: Date | null): string | null {
  return date
    ? new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
    : null;
}

function isRateLimited(conversationId: number | null, now: number): boolean {
  if (conversationId == null) return false;
  const entry = failedAttempts.get(conversationId);
  if (!entry || now - entry.since > FAILED_WINDOW_MS) return false;
  return entry.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailure(conversationId: number | null, now: number): void {
  if (conversationId == null) return;
  const entry = failedAttempts.get(conversationId);
  if (!entry || now - entry.since > FAILED_WINDOW_MS) {
    failedAttempts.set(conversationId, { count: 1, since: now });
  } else {
    entry.count += 1;
  }
}

const MODE_SUMMARY: Record<OrderCancelMode | 'auto_failed', string> = {
  auto: 'скасовано ботом автоматично (статус «Відмова»)',
  auto_failed: 'автоскасування не вдалося (SalesDrive) — скасуйте вручну',
  semi: 'потрібне підтвердження оператора',
  operator: 'статус не дозволяє скасування ботом — потрібне рішення оператора',
};

/**
 * Tool `request_order_cancellation`: сувора перевірка (телефон + ПІБ/ПІ), вибір замовлення,
 * причина, далі за статусом — автоскасування в SalesDrive або передача оператору. Оператора
 * сповіщаємо завжди: приватна нотатка, за налаштуванням — призначення й Telegram.
 */
export class ChatwootBotOrderCancelService {
  async handle(ctx: OrderCancelContext, args: OrderCancelToolArgs): Promise<OrderCancelToolResult> {
    const { settings, conversationId } = ctx;
    const now = Date.now();
    const ins = (key: string) => botInstruction(settings.aiInstructions, key);
    if (!settings.orderCancelEnabled) {
      return {
        code: 'disabled',
        hint: ins('cancel.disabled'),
      };
    }
    if (isRateLimited(conversationId, now)) {
      return {
        code: 'rate_limited',
        hint: ins('cancel.rateLimited'),
      };
    }

    const phoneArg = args.phone?.trim();
    const phone =
      (phoneArg ? safeNormalizePhone(extractCallbackPhone(phoneArg) ?? phoneArg) : null) ?? ctx.knownPhone;
    if (!phone) {
      return { code: 'phone_required', hint: ins('cancel.phoneRequired') };
    }
    const fullName = args.fullName?.trim() ?? '';
    if (!hasFullName(fullName)) {
      return {
        code: 'name_required',
        hint: ins('cancel.nameRequired'),
      };
    }

    const orders = (await findOrdersByPhone(phone)).filter(
      (o) => isCancelCandidateStatus(o.status) && cancelNameMatches(fullName, o.customerName),
    );
    if (orders.length === 0) {
      recordFailure(conversationId, now);
      return {
        code: 'not_found',
        hint: ins('cancel.notFound'),
      };
    }

    const token = args.orderNumber?.trim();
    const order = token
      ? orders.find((o) => orderTokenMatches(token, o.orderNumber, o.externalId))
      : orders.length === 1
        ? orders[0]
        : undefined;
    if (!order) {
      return {
        code: 'choose_order',
        hint: token
          ? ins('cancel.orderNumberNotFound')
          : ins('cancel.chooseOrder'),
        orders: orders.slice(0, 10).map((o) => ({
          orderNumber: o.orderNumber,
          date: kyivDate(o.orderDate),
          status: statusLabel(o.status, o.statusText),
          total: o.totalPrice ?? null,
        })),
      };
    }

    const status = statusLabel(order.status, order.statusText);
    const reason = args.reason?.trim() ?? '';
    if (!reason) {
      return {
        code: 'reason_required',
        order: { orderNumber: order.orderNumber, status },
        hint: ins('cancel.reasonRequired'),
      };
    }

    const mode = orderCancelMode(settings, order.status);
    const simulated = conversationId == null || settings.replyMode === 'dry_run';
    let summary: OrderCancelMode | 'auto_failed' = mode;
    if (mode === 'auto' && !simulated) {
      summary = (await this.cancelInSalesDrive(order.id, reason)) ? 'auto' : 'auto_failed';
    }

    if (!simulated && conversationId != null) {
      await this.notifyOperator(settings, conversationId, {
        orderNumber: order.orderNumber,
        status,
        reason,
        summary,
        assign: summary !== 'auto',
      });
    }

    if (summary === 'auto') {
      return {
        code: 'cancelled',
        order: { orderNumber: order.orderNumber, status: ORDER_CANCEL_TARGET_STATUS_TEXT },
        hint: ins('cancel.cancelled'),
        ...(simulated ? { simulated: true } : {}),
      };
    }
    return {
      code: mode === 'operator' ? 'operator_required' : 'pending_operator',
      order: { orderNumber: order.orderNumber, status },
      hint: ins('cancel.pendingOperator'),
      ...(simulated ? { simulated: true } : {}),
    };
  }

  private async cancelInSalesDrive(orderId: number, reason: string): Promise<boolean> {
    try {
      const ok = await salesDriveService.updateSalesDriveOrderStatus(String(orderId), ORDER_CANCEL_TARGET_STATUS);
      if (!ok) return false;
      await prisma.order.update({
        where: { id: orderId },
        data: { status: ORDER_CANCEL_TARGET_STATUS, statusText: ORDER_CANCEL_TARGET_STATUS_TEXT },
      });
      await orderDatabaseService.createOrderHistory(
        orderId,
        ORDER_CANCEL_TARGET_STATUS,
        ORDER_CANCEL_TARGET_STATUS_TEXT,
        'chatwoot_bot',
        undefined,
        `Скасовано клієнтом у чаті. Причина: ${reason.slice(0, 500)}`,
      );
      return true;
    } catch (err) {
      logServer(`[ChatwootBot] order cancel failed order=${orderId}`, err);
      return false;
    }
  }

  private async notifyOperator(
    settings: ChatwootBotSettings,
    conversationId: number,
    info: { orderNumber: string; status: string; reason: string; summary: OrderCancelMode | 'auto_failed'; assign: boolean },
  ): Promise<void> {
    const lines = [
      `Запит на скасування замовлення №${info.orderNumber}`,
      `Статус: ${info.status}`,
      `Результат: ${MODE_SUMMARY[info.summary]}`,
      `Причина: ${info.reason}`,
    ];
    const botClient = createChatwootApiClient(botMessagingCredentials(settings));
    try {
      await botClient.createOutgoingMessage(conversationId, lines.join('\n'), true);
    } catch (err) {
      logServer(`[ChatwootBot] order cancel note failed conv=${conversationId}`, err);
    }
    if (!settings.orderCancelNotifyEnabled) return;

    const url = `${settings.baseUrl.replace(/\/+$/, '')}/app/accounts/${settings.accountId}/conversations/${conversationId}`;
    await chatwootBotTelegramNotifier.send(settings, [...lines, url].join('\n'));

    if (!info.assign) return;
    try {
      const patClient = hasHandoverUserPat(settings)
        ? createChatwootApiClient(handoverAssignmentCredentials(settings))
        : null;
      if (settings.orderCancelAssignMode === 'specific_agent' && settings.orderCancelAssigneeId) {
        await assignHumanAgentWithBotFallback(conversationId, settings.orderCancelAssigneeId, botClient, patClient);
      } else {
        await botClient.botHandoffOpen(conversationId);
      }
      await botClient.mergeConversationCustomAttributesBestEffort(conversationId, {
        [CHATWOOT_BOT_ATTR_HUMAN_HANDOVER_ACTIVE]: true,
      });
    } catch (err) {
      logServer(`[ChatwootBot] order cancel assign failed conv=${conversationId}`, err);
    }
  }
}

export const chatwootBotOrderCancelService = new ChatwootBotOrderCancelService();
