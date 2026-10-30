import { prisma } from '../../lib/utils.js';
import type { ChatwootBotSettings } from '../../../shared/types/chatwootBot.js';
import type { ChatwootBotOrderToolResult } from '../../../shared/types/chatwootBotTools.js';
import { toVerifiedOrderDto } from './chatwootBotOrderRedaction.js';
import { extractOrderNumberToken } from './chatwootBotVerifyDateParse.js';
import { findOrdersByPhone } from './chatwootBotOrderLookup.js';

/** Скільки останніх замовлень телефону з довіреного каналу відкриваємо повністю. */
const TRUSTED_PHONE_ORDERS_LIMIT = 20;

const PHONE_ONLY_HINT =
  'Це короткий статус останнього замовлення за телефоном клієнта. Не називай номер чи дату замовлення. Для складу замовлення й номера ТТН попроси номер замовлення або дату, коли його робили.';
const PHONE_ONLY_NOT_FOUND_HINT =
  'За цим телефоном замовлень не знайдено. Попроси перевірити номер телефону або назвати номер замовлення.';

export type ChatwootBotOrderAccess = {
  /** Замовлення з активної сесії верифікації (chatwoot_bot_conversation_states). */
  verifiedIds: number[];
  /** Телефон з довіреного каналу (WhatsApp/SMS) — повний доступ до його замовлень. */
  trustedPhone: string | null;
  /** Телефон без підтвердження (введений у віджеті) — лише короткий статус. */
  unverifiedPhone: string | null;
};

export class ChatwootBotOrderToolService {
  async getVerifiedOrderForSession(
    settings: ChatwootBotSettings,
    access: ChatwootBotOrderAccess,
    orderNumberHint?: string,
  ): Promise<ChatwootBotOrderToolResult> {
    const ids = new Set(access.verifiedIds);
    if (access.trustedPhone) {
      const trustedOrders = await findOrdersByPhone(access.trustedPhone);
      trustedOrders.slice(0, TRUSTED_PHONE_ORDERS_LIMIT).forEach((o) => ids.add(o.id));
    }

    if (ids.size === 0) {
      return access.unverifiedPhone
        ? this.phoneOnlyStatus(access.unverifiedPhone)
        : { verified: false, code: 'verification_required', hint: settings.verifyRequiredHint };
    }

    const orders = await prisma.order.findMany({
      where: { id: { in: [...ids] } },
      select: {
        id: true,
        orderNumber: true,
        externalId: true,
        status: true,
        statusText: true,
        ttn: true,
        items: true,
      },
    });

    if (orders.length === 0) {
      return {
        verified: false,
        code: 'verification_required',
        hint: settings.verifyRequiredHint,
      };
    }

    const rawHint = orderNumberHint?.trim();
    const hint = rawHint ? extractOrderNumberToken(rawHint) ?? rawHint : undefined;
    let selected = orders[0];
    if (hint) {
      const match = orders.find(
        (o) => o.orderNumber === hint || o.externalId === hint,
      );
      if (!match) {
        return {
          verified: false,
          code: 'not_found',
          hint: settings.verifyFailMessage,
        };
      }
      selected = match;
    } else if (orders.length > 1) {
      selected = orders.sort((a, b) => b.id - a.id)[0];
    }

    let items: unknown = selected.items;
    if (typeof items === 'string') {
      try {
        items = JSON.parse(items);
      } catch {
        items = [];
      }
    }

    return {
      verified: true,
      order: toVerifiedOrderDto({
        orderNumber: selected.orderNumber || selected.externalId,
        status: selected.status,
        statusText: selected.statusText,
        ttn: selected.ttn,
        items,
      }),
    };
  }

  /** Рівень 1: лише статус найновішого замовлення, без номера, дати, складу й ТТН. */
  private async phoneOnlyStatus(phone: string): Promise<ChatwootBotOrderToolResult> {
    const [latest] = await findOrdersByPhone(phone);
    if (!latest) {
      return { verified: false, code: 'phone_only', latestOrder: null, hint: PHONE_ONLY_NOT_FOUND_HINT };
    }
    return {
      verified: false,
      code: 'phone_only',
      latestOrder: { status: latest.status, statusText: latest.statusText },
      hint: PHONE_ONLY_HINT,
    };
  }
}

export const chatwootBotOrderToolService = new ChatwootBotOrderToolService();
