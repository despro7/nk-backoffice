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

/**
 * Адресні сповіщення: кому – вирішує код (data.recipients), а роль лише вмикає / вимикає канали.
 * Ключ: action.notify.direct.<event>.<channel>. Рядок у матриці ролі показується,
 * лише якщо роль має `requires` (інакше вона не може бути адресатом).
 */
export const NOTIFICATION_DIRECT_EVENTS = [
  {
    id: 'specReview',
    label: 'Специфікація чекає на затвердження',
    hint: 'Нова або оновлена чернетка специфікації. Отримують ті, хто затверджує',
    requires: 'action.products.approveSpec',
    titlePattern: /чекає на затвердження|Оновлено чернетку/i,
  },
  {
    id: 'specResult',
    label: 'Рішення по специфікації',
    hint: 'Затверджено, затверджено з правками або відхилено. Отримує автор чернетки',
    requires: 'action.products.editSpec',
    titlePattern: /Специфікацію (затверджено|відхилено)/i,
  },
] as const;

export type NotificationDirectEventId = (typeof NOTIFICATION_DIRECT_EVENTS)[number]['id'];

export function directNotifyPermissionKey(event: NotificationDirectEventId, channel: NotificationChannel): string {
  return `action.notify.direct.${event}.${channel}`;
}

/** Подія адресного сповіщення: data.event, для старих записів – за заголовком; null – невідома. */
export function resolveDirectEvent(
  category: string,
  title: string | null,
  data: unknown,
): NotificationDirectEventId | null {
  const event = data && typeof data === 'object' ? (data as { event?: unknown }).event : undefined;
  const known = NOTIFICATION_DIRECT_EVENTS.find((e) => e.id === event);
  if (known) return known.id;
  if (category !== 'catalog_spec' || !title) return null;
  return NOTIFICATION_DIRECT_EVENTS.find((e) => e.titlePattern.test(title))?.id ?? null;
}

/** Усі notify-ключі (для admin, тестів і UI матриці). */
export const ALL_NOTIFY_PERMISSION_KEYS: string[] = NOTIFICATION_GROUP_IDS.flatMap((group) =>
  NOTIFICATION_LEVEL_IDS.flatMap((level) =>
    NOTIFICATION_CHANNELS.map((channel) => notifyPermissionKey(group, level, channel.id)),
  ),
).concat(
  NOTIFICATION_DIRECT_EVENTS.flatMap((event) =>
    NOTIFICATION_CHANNELS.map((channel) => directNotifyPermissionKey(event.id, channel.id)),
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
