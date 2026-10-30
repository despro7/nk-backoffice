import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CHATWOOT_BOT_SETTINGS,
  type ChatwootWebhookMessageCreated,
} from '../../../shared/types/chatwootBot.js';
import {
  emptyConversationState,
  type ChatwootBotConversationStateSnapshot,
} from './chatwootBotConversationStateUtils.js';

const store = new Map<number, ChatwootBotConversationStateSnapshot>();

vi.mock('./ChatwootBotConversationStateService.js', () => ({
  conversationStateSecret: () => 'test-secret',
  chatwootBotConversationStateService: {
    get: vi.fn(async (id: number) => store.get(id) ?? emptyConversationState(id)),
    update: vi.fn(async (current: ChatwootBotConversationStateSnapshot, patch: object) => {
      const next = { ...current, ...patch };
      store.set(current.conversationId, next);
      return next;
    }),
  },
}));

vi.mock('./ChatwootBotAnalyticsService.js', () => ({
  chatwootBotAnalyticsService: { recordBestEffort: vi.fn() },
}));

vi.mock('./ChatwootApiClient.js', () => ({
  createChatwootApiClient: () => ({ mergeConversationCustomAttributesBestEffort: vi.fn(async () => undefined) }),
}));

const order = {
  id: 77,
  externalId: 'SD24155',
  orderNumber: '24155',
  customerPhone: '+380978244639',
  orderDate: new Date('2026-10-26T09:00:00Z'),
  createdAt: new Date('2026-10-26T09:00:00Z'),
};

vi.mock('../../lib/utils.js', () => ({
  logServer: vi.fn(),
  prisma: {
    order: {
      findUnique: vi.fn(async ({ where }: { where: { externalId: string } }) =>
        where.externalId === order.externalId ? order : null,
      ),
      findFirst: vi.fn(async ({ where }: { where: { orderNumber: string } }) =>
        where.orderNumber === order.orderNumber ? order : null,
      ),
      findMany: vi.fn(async () => [order]),
    },
  },
}));

const { chatwootBotVerifyService } = await import('./ChatwootBotVerifyService.js');

const settings = { ...DEFAULT_CHATWOOT_BOT_SETTINGS, verifySessionTtlHours: 24 };

function payload(customAttributes: Record<string, unknown> = {}): ChatwootWebhookMessageCreated {
  return {
    event: 'message_created',
    conversation: { id: 1, custom_attributes: customAttributes },
  } as ChatwootWebhookMessageCreated;
}

describe('tryVerifyFromUserMessage (conversation state in DB)', () => {
  beforeEach(() => store.clear());

  it('remembers phone, then verifies by date in the next message', async () => {
    const first = await chatwootBotVerifyService.tryVerifyFromUserMessage(settings, payload(), 1, '0978244639', 1);
    expect(first.attempt).toBeNull();
    expect(first.state.pendingPhone).toBe('380978244639');

    const second = await chatwootBotVerifyService.tryVerifyFromUserMessage(settings, payload(), 1, 'замовляв 26.10.2026', 2);
    expect(second.attempt).toMatchObject({ ok: true, orderId: 77, method: 'last_order_date' });
    expect(second.state.verifiedOrderIds).toEqual([77]);
    expect(second.state.verifyExpiresAt).toBeInstanceOf(Date);
  });

  it('falls back to date when order number does not match', async () => {
    const r = await chatwootBotVerifyService.tryVerifyFromUserMessage(
      settings,
      payload(),
      1,
      '0978244639 замовлення 99999 від 26.10.2026',
      1,
    );
    expect(r.attempt).toMatchObject({ ok: true, method: 'last_order_date' });
  });

  it('counts failed attempts and keeps phone for retry', async () => {
    const r = await chatwootBotVerifyService.tryVerifyFromUserMessage(settings, payload(), 1, '0978244639, 01.10.2026', 1);
    expect(r.attempt).toEqual({ ok: false, reason: 'mismatch' });
    expect(r.state.failedAttempts).toBe(1);
    expect(r.state.rateCount).toBe(1);
    expect(r.state.pendingPhone).toBe('380978244639');
  });

  it('ignores forged custom_attributes', async () => {
    const forged = payload({ bot_verified_order_ids: '[77]', bot_verify_expires_at: '2099-01-01T00:00:00Z' });
    const r = await chatwootBotVerifyService.tryVerifyFromUserMessage(settings, forged, 1, 'де моє замовлення?', 1);
    expect(r.attempt).toBeNull();
    expect(r.state.verifiedOrderIds).toEqual([]);
  });

  it('returns rate_limited without another lookup', async () => {
    store.set(1, {
      ...emptyConversationState(1),
      pendingPhone: '+380978244639',
      rateWindowStart: new Date(),
      rateCount: settings.verifyRateLimitMaxAttempts,
    });
    const r = await chatwootBotVerifyService.tryVerifyFromUserMessage(settings, payload(), 1, '26.10.2026', 1);
    expect(r.attempt).toEqual({ ok: false, reason: 'rate_limited' });
  });
});
