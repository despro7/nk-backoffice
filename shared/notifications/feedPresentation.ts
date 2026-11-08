/**
 * Presentation helpers shared by the feed (server) and the settings playground (client):
 * who "sent" a notification and through which channel.
 */

import type { NotificationServiceId, NotificationSource } from '../types/notifications.js';

const CATEGORY_SERVICE: Record<string, NotificationServiceId> = {
  dilovod: 'dilovod',
  'dilovod-export': 'dilovod',
  product_sync: 'sync',
  orders_sync: 'sync',
  salesdrive: 'salesdrive',
  warehouse: 'warehouse',
  warehouse_movement: 'warehouse',
  catalog_spec: 'products',
  products: 'products',
  assembly: 'assembly',
};

const SERVICE_LABELS: Record<NotificationServiceId, string> = {
  dilovod: 'Діловод',
  salesdrive: 'SalesDrive',
  sync: 'Синхронізація',
  warehouse: 'Склад',
  products: 'Товари',
  assembly: 'Збірка',
  cron: 'Планове завдання',
  webhook: 'Webhook',
  system: 'Система',
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0];
  return letters.toUpperCase();
}

export function resolveSource(log: { category: string; actorUserId: number | null; actorName: string | null }): NotificationSource {
  if (log.actorUserId != null && log.actorName) {
    return { type: 'user', userId: log.actorUserId, name: log.actorName, initials: initialsOf(log.actorName) };
  }
  return serviceSourceOf(log.category);
}

/** Сервіс, до якого належить категорія журналу (без урахування користувача). */
export function serviceSourceOf(category: string): NotificationSource {
  const id = CATEGORY_SERVICE[category] ?? 'system';
  return { type: 'service', id, label: SERVICE_LABELS[id] };
}

/**
 * Аватар сповіщення – сервіс, з боку якого транзакція (Діловод, SalesDrive, склад…).
 * Користувач – лише коли категорія не належить жодному сервісу (наприклад, звіт користувача).
 */
export function resolveAvatarSource(log: { category: string; actorUserId: number | null; actorName: string | null }): NotificationSource {
  if (!(log.category in CATEGORY_SERVICE) && log.actorUserId != null && log.actorName) return resolveSource(log);
  return serviceSourceOf(log.category);
}

const service = (id: NotificationServiceId, label = SERVICE_LABELS[id]): NotificationSource => ({ type: 'service', id, label });

/**
 * Хто запустив дію (рядок «Запускали»): користувач, «Ім'я (авто)» для авто-дії після зміни статусу,
 * SalesDrive, Cron, Webhook або «автоматично» – кожен зі своїм аватаром.
 */
export function resolveAttempt(log: {
  category: string;
  actorUserId: number | null;
  actorName: string | null;
  initiatedBy: string | null;
}): { label: string; source: NotificationSource } {
  const by = log.initiatedBy ?? '';
  if (log.actorUserId != null && log.actorName) {
    const user = resolveSource(log);
    return { label: by.startsWith('manual:by:') ? `${log.actorName} (авто)` : log.actorName, source: user };
  }
  if (/salesdrive/i.test(by)) {
    return { label: /webhook/i.test(by) ? 'SalesDrive (API)' : 'SalesDrive', source: service('salesdrive') };
  }
  if (by.startsWith('cron:')) return { label: 'Cron', source: service('cron', 'Cron') };
  if (by.startsWith('webhook:')) return { label: 'Webhook', source: service('webhook') };
  // Старі записи: авто-дія після зміни статусу в бекофісі без автора.
  if (by === 'manual' || by.startsWith('manual:by:')) return { label: 'Зміна статусу (авто)', source: service('assembly', 'Зміна статусу') };
  return { label: 'автоматично', source: serviceSourceOf(log.category) };
}

/** Звідки прийшов запуск (для підпису «через …»). */
export function resolveVia(initiatedBy: string | null): string | null {
  if (!initiatedBy) return null;
  if (/salesdrive/i.test(initiatedBy)) return 'SalesDrive';
  if (initiatedBy.startsWith('cron:')) return 'за розкладом';
  if (initiatedBy.startsWith('webhook:')) return 'webhook';
  return null;
}

