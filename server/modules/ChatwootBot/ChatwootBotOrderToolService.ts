import { prisma } from '../../lib/utils.js';
import type { ChatwootBotSettings } from '../../../shared/types/chatwootBot.js';
import type { ChatwootBotOrderToolResult } from '../../../shared/types/chatwootBotTools.js';
import { toVerifiedOrderDto } from './chatwootBotOrderRedaction.js';
import { getVerifiedOrderIdsFromAttrs } from './ChatwootBotVerifyService.js';

export class ChatwootBotOrderToolService {
  async getVerifiedOrderForSession(
    settings: ChatwootBotSettings,
    customAttrs: Record<string, unknown> | undefined,
    orderNumberHint?: string,
  ): Promise<ChatwootBotOrderToolResult> {
    const verifiedIds = getVerifiedOrderIdsFromAttrs(customAttrs);
    if (verifiedIds.length === 0) {
      return {
        verified: false,
        code: 'verification_required',
        hint: settings.verifyRequiredHint,
      };
    }

    const orders = await prisma.order.findMany({
      where: { id: { in: verifiedIds } },
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

    const hint = orderNumberHint?.trim();
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
}

export const chatwootBotOrderToolService = new ChatwootBotOrderToolService();
