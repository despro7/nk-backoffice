import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CHATWOOT_BOT_SETTINGS } from '../../../shared/types/chatwootBot.js';
import { isTrustedPhoneChannel } from './chatwootBotOrderLookup.js';

const orders = [
  {
    id: 91,
    orderNumber: '24170',
    externalId: 'SD24170',
    customerPhone: '+380978244639',
    status: '4',
    statusText: 'Відправлено',
    ttn: '20450000000001',
    items: [{ name: 'Плов', quantity: 1 }],
    orderDate: new Date('2026-10-29T10:00:00Z'),
    createdAt: new Date('2026-10-29T10:00:00Z'),
  },
  {
    id: 77,
    orderNumber: '24155',
    externalId: 'SD24155',
    customerPhone: '+380978244639',
    status: '6',
    statusText: 'Продаж',
    ttn: '20450000000000',
    items: [],
    orderDate: new Date('2026-10-26T09:00:00Z'),
    createdAt: new Date('2026-10-26T09:00:00Z'),
  },
];

vi.mock('../../lib/utils.js', () => ({
  logServer: vi.fn(),
  prisma: {
    order: {
      findMany: vi.fn(async (args: { where: { id?: { in: number[] } } }) =>
        args.where.id ? orders.filter((o) => args.where.id?.in.includes(o.id)) : orders,
      ),
    },
  },
}));

const { chatwootBotOrderToolService } = await import('./ChatwootBotOrderToolService.js');
const settings = DEFAULT_CHATWOOT_BOT_SETTINGS;
const phone = '380978244639';

describe('getVerifiedOrderForSession access levels', () => {
  it('phone only: short status without number, date, items or TTN', async () => {
    const r = await chatwootBotOrderToolService.getVerifiedOrderForSession(settings, {
      verifiedIds: [],
      trustedPhone: null,
      unverifiedPhone: phone,
    });
    expect(r).toMatchObject({ verified: false, code: 'phone_only', latestOrder: { statusText: 'Відправлено' } });
    const json = JSON.stringify(r);
    expect(json).not.toContain('24170');
    expect(json).not.toContain('2045');
    expect(json).not.toContain('Плов');
  });

  it('verified session: full order data', async () => {
    const r = await chatwootBotOrderToolService.getVerifiedOrderForSession(
      settings,
      { verifiedIds: [77], trustedPhone: null, unverifiedPhone: phone },
      'SD24155',
    );
    expect(r).toMatchObject({ verified: true, order: { orderNumber: '24155', ttn: '20450000000000' } });
  });

  it('trusted channel phone: full data without extra verification', async () => {
    const r = await chatwootBotOrderToolService.getVerifiedOrderForSession(settings, {
      verifiedIds: [],
      trustedPhone: phone,
      unverifiedPhone: phone,
    });
    expect(r).toMatchObject({ verified: true, order: { orderNumber: '24170' } });
  });

  it('nothing known: verification_required', async () => {
    const r = await chatwootBotOrderToolService.getVerifiedOrderForSession(settings, {
      verifiedIds: [],
      trustedPhone: null,
      unverifiedPhone: null,
    });
    expect(r).toMatchObject({ verified: false, code: 'verification_required' });
  });
});

describe('isTrustedPhoneChannel', () => {
  it('trusts only platform-provided phone channels', () => {
    expect(isTrustedPhoneChannel('Channel::Whatsapp')).toBe(true);
    expect(isTrustedPhoneChannel('Channel::WebWidget')).toBe(false);
    expect(isTrustedPhoneChannel('Channel::Telegram')).toBe(false);
    expect(isTrustedPhoneChannel(undefined)).toBe(false);
  });
});
