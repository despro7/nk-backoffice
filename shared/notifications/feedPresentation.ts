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
  const id = CATEGORY_SERVICE[log.category] ?? 'system';
  return { type: 'service', id, label: SERVICE_LABELS[id] };
}

/** Звідки прийшов запуск (для підпису «через …»). */
export function resolveVia(initiatedBy: string | null): string | null {
  if (!initiatedBy) return null;
  if (/salesdrive/i.test(initiatedBy)) return 'SalesDrive';
  if (initiatedBy.startsWith('cron:')) return 'за розкладом';
  if (initiatedBy.startsWith('webhook:')) return 'webhook';
  return null;
}

