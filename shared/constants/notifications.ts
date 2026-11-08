/**
 * Notification Centre: groups, levels, channels and per-role permission keys.
 *
 * Role access is stored in role_permissions as
 *   action.notify.<group>.<level>.<channel>
 * e.g. action.notify.dilovod.error.app, action.notify.warehouse.warning.tg
 */

export const NOTIFICATION_GROUPS = [
  { id: 'assembly', label: 'Збірка замовлень', hint: 'Комплектація, вага, етикетки' },
  { id: 'dilovod', label: 'Діловод', hint: 'Експорт і відвантаження замовлень' },
  { id: 'sync', label: 'Синхронізації', hint: 'Товари, SalesDrive, WordPress' },
  { id: 'warehouse', label: 'Склад', hint: 'Переміщення, списання, комплектування' },
  { id: 'products', label: 'Товари', hint: 'Специфікації, картки товарів' },
  { id: 'system', label: 'Звіти та система', hint: 'Звіти користувачів, налаштування' },
] as const;

export type NotificationGroupId = (typeof NOTIFICATION_GROUPS)[number]['id'];

export const NOTIFICATION_LEVELS = [
  { id: 'error', label: 'Помилка' },
  { id: 'warning', label: 'Попередження' },
  { id: 'success', label: 'Успіх' },
  { id: 'info', label: 'Інфо' },
] as const;

export type NotificationLevel = (typeof NOTIFICATION_LEVELS)[number]['id'];

export const NOTIFICATION_CHANNELS = [
  { id: 'app', label: 'В застосунку' },
  { id: 'tg', label: 'Telegram' },
] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]['id'];

/** alert – щось зламалось; task – від адресата чекають дії; event – інформація. */
export const NOTIFICATION_KINDS = [
  { id: 'alert', label: 'Проблема' },
  { id: 'task', label: 'Задача' },
  { id: 'event', label: 'Подія' },
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]['id'];

export const NOTIFICATION_GROUP_IDS: readonly NotificationGroupId[] = NOTIFICATION_GROUPS.map((g) => g.id);
export const NOTIFICATION_LEVEL_IDS: readonly NotificationLevel[] = NOTIFICATION_LEVELS.map((l) => l.id);
export const NOTIFICATION_KIND_IDS: readonly NotificationKind[] = NOTIFICATION_KINDS.map((k) => k.id);

export function isNotificationGroup(value: unknown): value is NotificationGroupId {
  return typeof value === 'string' && (NOTIFICATION_GROUP_IDS as readonly string[]).includes(value);
}

export function isNotificationLevel(value: unknown): value is NotificationLevel {
  return typeof value === 'string' && (NOTIFICATION_LEVEL_IDS as readonly string[]).includes(value);
}

export function isNotificationKind(value: unknown): value is NotificationKind {
  return typeof value === 'string' && (NOTIFICATION_KIND_IDS as readonly string[]).includes(value);
}

export function notificationGroupLabel(id: string): string {
  return NOTIFICATION_GROUPS.find((g) => g.id === id)?.label ?? id;
}

export function notifyPermissionKey(
  group: NotificationGroupId,
  level: NotificationLevel,
  channel: NotificationChannel,
): string {
  return `action.notify.${group}.${level}.${channel}`;
}

export function isNotifyPermissionKey(key: string): boolean {
  return key.startsWith('action.notify.');
}

/** Усі notify-ключі (для admin, тестів і UI матриці). */
export const ALL_NOTIFY_PERMISSION_KEYS: string[] = NOTIFICATION_GROUP_IDS.flatMap((group) =>
  NOTIFICATION_LEVEL_IDS.flatMap((level) =>
    NOTIFICATION_CHANNELS.map((channel) => notifyPermissionKey(group, level, channel.id)),
  ),
);

/** Група за замовчуванням, коли жодне правило не задало її явно. */
export function defaultGroupForCategory(category: string): NotificationGroupId {
  switch (category) {
    case 'dilovod':
    case 'dilovod-export':
      return 'dilovod';
    case 'product_sync':
    case 'orders_sync':
    case 'salesdrive':
      return 'sync';
    case 'warehouse':
    case 'warehouse_movement':
      return 'warehouse';
    case 'catalog_spec':
    case 'products':
      return 'products';
    case 'assembly':
    case 'weight_tolerance':
      return 'assembly';
    default:
      return 'system';
  }
}

export function defaultKindForLevel(level: NotificationLevel): NotificationKind {
  return level === 'error' || level === 'warning' ? 'alert' : 'event';
}

export function toNotificationLevel(status: string | null | undefined): NotificationLevel {
  if (status === 'error' || status === 'warning' || status === 'success') return status;
  return 'info';
}
