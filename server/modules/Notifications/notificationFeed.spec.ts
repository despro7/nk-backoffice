import { describe, expect, it } from 'vitest';
import { buildFeed, collapseRepeats, initialsOf, type LogUserState, type PreparedLog } from './notificationFeed';
import { categoriesWithVisibleSuccess, parseInitiator } from './NotificationFeedService';
import { DEFAULT_NOTIFICATION_RULES } from '../../../shared/notifications/defaultRules';
import { resolveDirectEvent } from '../../../shared/constants/notifications';
import type { RenderedNotification } from '../../../shared/types/notificationRules';

function rendered(p: Partial<RenderedNotification> = {}): RenderedNotification {
  return {
    ruleId: 1,
    ruleName: 'r',
    kind: 'alert',
    group: 'dilovod',
    level: 'error',
    visible: true,
    title: 'T',
    message: 'M',
    actionLabel: 'Відкрити замовлення',
    actionLink: '/orders/1',
    vars: {},
    ...p,
  };
}

function log(id: number, p: Partial<PreparedLog> = {}, r: Partial<RenderedNotification> = {}): PreparedLog {
  return {
    id,
    createdAt: new Date(2026, 10, 8, 0, 0, 100 - id).toISOString(),
    category: 'dilovod',
    orderNumber: '1',
    initiatedBy: null,
    rendered: rendered(r),
    recipients: null,
    directEvent: null,
    actorUserId: null,
    actorName: null,
    docNumber: null,
    hasDocument: false,
    ...p,
  };
}

const picker = { userId: 7, isAdmin: false, permissions: new Set(['action.notify.dilovod.error.app']) };

describe('buildFeed', () => {
  it('filters by role matrix and keeps addressed notifications regardless of it', () => {
    const logs = [
      log(1),
      log(2, {}, { group: 'sync', title: 'sync' }),
      log(3, { category: 'catalog_spec', recipients: [7] }, { group: 'products', kind: 'task', level: 'info', title: 'spec' }),
      log(4, { category: 'catalog_spec', recipients: [9] }, { group: 'products', title: 'other' }),
    ];
    const feed = buildFeed(logs, new Map(), picker, 'all', 50);
    expect(feed.data.map((i) => i.id)).toEqual([1, 3]);
    expect(feed.data[1].addressed).toBe(true);
    expect(feed.counts).toEqual({ all: 2, mine: 1, errors: 1, archive: 0 });
  });

  it('splits archive (own vs resolved) out of other tabs', () => {
    const states = new Map<number, LogUserState>([
      [1, { readBy: {}, hiddenBy: { '7': 'x' } }],
      [2, { readBy: {}, hiddenBy: { _all: 'x' } }],
    ]);
    const logs = [log(1, {}, { title: 'a' }), log(2, {}, { title: 'b' }), log(3, {}, { title: 'c' })];
    const all = buildFeed(logs, states, picker, 'all', 50);
    expect(all.data.map((i) => i.id)).toEqual([3]);
    const archive = buildFeed(logs, states, picker, 'archive', 50);
    expect(archive.data.map((i) => [i.id, i.archived])).toEqual([[1, 'mine'], [2, 'resolved']]);
  });

  it('marks my own actions as mine and hides user reports from non-admins', () => {
    const logs = [log(1, { actorUserId: 7, actorName: 'Олена Мельник' }), log(2, { category: 'user_report' })];
    const feed = buildFeed(logs, new Map(), { ...picker, permissions: new Set(['*']) }, 'mine', 50);
    expect(feed.data.map((i) => i.id)).toEqual([1]);
    expect(feed.data[0].attempts[0].source).toEqual({ type: 'user', userId: 7, name: 'Олена Мельник', initials: 'ОМ' });
  });

  it('collapses repeats and stays unread while any copy is unread', () => {
    const states = new Map<number, LogUserState>([[1, { readBy: { '7': 'x' }, hiddenBy: {} }]]);
    const feed = buildFeed([log(1), log(2), log(3, { orderNumber: '2' })], states, picker, 'all', 50);
    expect(feed.data[0]).toMatchObject({ id: 1, ids: [1, 2], count: 2, read: false });
    expect(feed.data).toHaveLength(2);
  });

  it('collapsed repeats list every attempt, newest first, and count as mine if I took part', () => {
    const logs = [
      log(1, { initiatedBy: 'salesdrive:webhook' }),
      log(2, { actorUserId: 7, actorName: 'Вікторія', initiatedBy: '7' }),
      log(3, { initiatedBy: 'manual' }),
    ];
    const feed = buildFeed(logs, new Map(), picker, 'mine', 50);
    expect(feed.data).toHaveLength(1);
    expect(feed.data[0]).toMatchObject({ count: 3, mine: true, source: { type: 'service', id: 'dilovod' } });
    expect(feed.data[0].attempts.map((a) => a.label)).toEqual(['SalesDrive (API)', 'Вікторія', 'Зміна статусу (авто)']);
    expect(feed.data[0].attempts[0].source).toMatchObject({ type: 'service', id: 'salesdrive' });
    expect(feed.data[0].attempts[1].source).toMatchObject({ type: 'user', userId: 7 });
  });

  it('labels each initiator with its own avatar', () => {
    const logs = [
      log(1, { actorUserId: 7, actorName: 'Вікторія', initiatedBy: 'manual:by:7' }),
      log(2, { initiatedBy: 'cron:order_sync' }),
      log(3, { initiatedBy: null }),
    ];
    const attempts = buildFeed(logs, new Map(), picker, 'all', 50).data[0].attempts;
    expect(attempts.map((a) => a.label)).toEqual(['Вікторія (авто)', 'Cron', 'автоматично']);
    expect(attempts[1].source).toMatchObject({ type: 'service', id: 'cron' });
    expect(attempts[2].source).toMatchObject({ type: 'service', id: 'dilovod' });
  });

  it('avatar is the service; user only for categories without one', () => {
    const logs = [
      log(1, { actorUserId: 7, actorName: 'Вікторія' }),
      log(2, { category: 'user_report', actorUserId: 7, actorName: 'Вікторія' }, { group: 'dilovod', title: 'report' }),
    ];
    const feed = buildFeed(logs, new Map(), { ...picker, isAdmin: true }, 'all', 50);
    expect(feed.data[0].source).toMatchObject({ type: 'service', id: 'dilovod' });
    expect(feed.data[1].source).toMatchObject({ type: 'user', userId: 7 });
  });

  it('shows warehouse doc number when there is no order', () => {
    const feed = buildFeed([log(1, { orderNumber: null, docNumber: 'K-000654' })], new Map(), picker, 'all', 50);
    expect(feed.data[0].docNumber).toBe('K-000654');
  });

  it('addressed events follow the role switch for the app channel', () => {
    const logs = [
      log(1, { category: 'catalog_spec', recipients: [7], directEvent: 'specReview' }, { group: 'products', title: 'a' }),
      log(2, { category: 'catalog_spec', recipients: [7], directEvent: 'specResult' }, { group: 'products', title: 'b' }),
    ];
    const viewer = { ...picker, permissions: new Set(['action.notify.direct.specResult.app']) };
    expect(buildFeed(logs, new Map(), viewer, 'all', 50).data.map((i) => i.id)).toEqual([2]);
    expect(buildFeed(logs, new Map(), { ...viewer, isAdmin: true }, 'all', 50).data.map((i) => i.id)).toEqual([1, 2]);
  });

  it('resolves addressed event from data or legacy title', () => {
    expect(resolveDirectEvent('catalog_spec', 'x', { event: 'specResult' })).toBe('specResult');
    expect(resolveDirectEvent('catalog_spec', 'Специфікація чекає на затвердження', {})).toBe('specReview');
    expect(resolveDirectEvent('catalog_spec', 'Специфікацію відхилено', null)).toBe('specResult');
    expect(resolveDirectEvent('dilovod', 'Специфікацію відхилено', null)).toBeNull();
  });

  it('hides rule-hidden logs', () => {
    const feed = buildFeed([log(1, {}, { visible: false })], new Map(), picker, 'all', 50);
    expect(feed.data).toEqual([]);
  });
});

describe('helpers', () => {
  it('initials', () => {
    expect(initialsOf('Ірина Бондар')).toBe('ІБ');
    expect(initialsOf('admin')).toBe('AD');
  });

  it('parses initiator formats', () => {
    expect(parseInitiator('5')).toEqual({ userId: 5 });
    expect(parseInitiator('manual:by:5')).toEqual({ userId: 5 });
    expect(parseInitiator('manual:user:a@b.c')).toEqual({ email: 'a@b.c' });
    expect(parseInitiator('salesdrive:webhook')).toEqual({});
  });

  it('collapseRepeats is a no-op for distinct items', () => {
    expect(collapseRepeats([])).toEqual([]);
  });

  it('success prefilter covers only categories with visible success rules', () => {
    expect(categoriesWithVisibleSuccess(DEFAULT_NOTIFICATION_RULES)?.sort()).toEqual(
      ['catalog_spec', 'product_sync', 'production_batch', 'production_techcard', 'user_report', 'warehouse_movement'],
    );
  });
});
