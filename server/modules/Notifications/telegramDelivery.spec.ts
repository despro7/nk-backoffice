import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  formatTelegramMessage,
  retryDelayMs,
  telegramAudience,
  telegramFingerprint,
  type TelegramRecipient,
} from './telegramDelivery';
import type { PreparedLog } from './notificationFeed';
import { DEFAULT_NOTIFICATION_USER_PREFS } from '../../../shared/types/notifications';

function log(p: Partial<PreparedLog> = {}, r: Partial<PreparedLog['rendered']> = {}): PreparedLog {
  return {
    id: 1,
    createdAt: '2026-11-08T00:00:00.000Z',
    category: 'dilovod',
    orderNumber: '25727',
    initiatedBy: null,
    recipients: null,
    directEvent: null,
    actorUserId: null,
    actorName: null,
    docNumber: null,
    hasDocument: false,
    rendered: {
      ruleId: 3,
      ruleName: 'r',
      kind: 'alert',
      group: 'dilovod',
      level: 'error',
      visible: true,
      title: 'Не вистачає товару для замовлення №25727',
      message: '• Рис <по-азійськи> (арт. 03040): бракує 1 шт',
      actionLabel: 'Відкрити замовлення',
      actionLink: '/orders/25727',
      vars: {},
      ...r,
    },
    ...p,
  };
}

function user(userId: number, keys: string[], prefs = DEFAULT_NOTIFICATION_USER_PREFS, role = 'storekeeper'): TelegramRecipient {
  return { userId, role, chatId: String(1000 + userId), permissions: new Set(keys), prefs };
}

describe('telegramAudience', () => {
  const tgDilovod = 'action.notify.dilovod.error.tg';
  const appDilovod = 'action.notify.dilovod.error.app';

  it('needs the tg permission, not the app one', () => {
    const out = telegramAudience(log(), [user(1, [tgDilovod]), user(2, [appDilovod])]);
    expect(out.map((u) => u.userId)).toEqual([1]);
  });

  it('respects personal Telegram opt-outs and muted groups', () => {
    const muted = { ...DEFAULT_NOTIFICATION_USER_PREFS, mutedTgGroups: ['dilovod' as const] };
    const mutedApp = { ...DEFAULT_NOTIFICATION_USER_PREFS, mutedGroups: ['dilovod' as const] };
    expect(telegramAudience(log(), [user(1, [tgDilovod], muted), user(2, [tgDilovod], mutedApp)])).toEqual([]);
  });

  it('sends addressed notifications only to recipients, regardless of role', () => {
    const out = telegramAudience(log({ recipients: [2] }, { group: 'products' }), [user(1, ['*']), user(2, [])]);
    expect(out.map((u) => u.userId)).toEqual([2]);
  });

  it('addressed event respects the role Telegram switch', () => {
    const spec = log({ recipients: [1, 2], directEvent: 'specReview' }, { group: 'products' });
    const out = telegramAudience(spec, [user(1, ['action.notify.direct.specReview.tg']), user(2, ['action.notify.direct.specReview.app'])]);
    expect(out.map((u) => u.userId)).toEqual([1]);
  });

  it('skips hidden and admin-only logs', () => {
    expect(telegramAudience(log({}, { visible: false }), [user(1, ['*'], undefined, 'admin')])).toEqual([]);
    expect(telegramAudience(log({ category: 'user_report' }), [user(1, ['*'])])).toEqual([]);
  });
});

describe('formatting', () => {
  it('escapes HTML and adds a button only for https', () => {
    const msg = formatTelegramMessage(log({ actorName: 'Олена' }), 'https://bo.example.com/');
    expect(msg.text).toContain('🔴 <b>Не вистачає товару для замовлення №25727</b>');
    expect(msg.text).toContain('Рис &lt;по-азійськи&gt;');
    expect(msg.text).toContain('<i>Діловод · №25727 · Олена</i>');
    expect(msg.buttonUrl).toBe('https://bo.example.com/orders/25727');
    expect(msg.buttonLabel).toBe('Відкрити замовлення');

    const local = formatTelegramMessage(log(), 'http://localhost:8080/');
    expect(local.buttonUrl).toBeNull();
    expect(local.text).toContain('http://localhost:8080/orders/25727');
  });

  it('uses a pin for tasks', () => {
    expect(formatTelegramMessage(log({}, { kind: 'task' }), null).text.startsWith('📌')).toBe(true);
  });

  it('fingerprint ignores log id but not the order', () => {
    expect(telegramFingerprint(log({ id: 1 }))).toBe(telegramFingerprint(log({ id: 2 })));
    expect(telegramFingerprint(log())).not.toBe(telegramFingerprint(log({ orderNumber: '1' })));
  });

  it('helpers', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b');
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(9)).toBe(1_800_000);
  });
});
