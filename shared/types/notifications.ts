/**
 * Shared types for the Notification Centre.
 * Used by both server (route responses) and client (NotificationBell, useNotifications).
 */

import type {
  NotificationGroupId,
  NotificationKind,
  NotificationLevel,
} from '../constants/notifications.js';

export type NotificationSeverity = 'error' | 'warning' | 'info' | 'success';

/**
 * A single notification item returned by GET /api/notifications.
 * Backed by the meta_logs table — id is the meta_logs.id.
 */
export interface AppNotification {
  /** meta_logs.id */
  id: number;
  severity: NotificationSeverity;
  /** meta_logs.title */
  title: string;
  /** meta_logs.message */
  message: string;
  /** meta_logs.datetime ISO string */
  createdAt: string;
  /** True if the user has dismissed/read this notification (stored in meta_logs.data.readBy[]) */
  read: boolean;
  /** meta_logs.orderNumber — link target if present */
  orderNumber?: string | null;
  /** Derived from initiatedBy: 'auto-export' | 'auto-shipment' | 'cron' | 'manual' | etc. */
  tag?: string;
  /** meta_logs.category */
  category: string;
  /** Внутрішнє посилання (meta_logs.data.link), напр. картка товару */
  link?: string | null;
}

/** Response shape for GET /api/notifications */
export interface NotificationsResponse {
  success: true;
  data: AppNotification[];
  unreadCount: number;
  total: number;
  /** Server timestamp (ISO) — клієнт зберігає для наступного ?since= запиту */
  serverTime: string;
}

/** Response shape for PUT /api/notifications/read-all */
export interface MarkAllReadResponse {
  success: true;
  markedCount: number;
}

// ─── Notification Centre v2 (feed with tabs) ─────────────────────────────────

export type NotificationTab = 'all' | 'mine' | 'errors' | 'archive';

export const NOTIFICATION_TABS: readonly NotificationTab[] = ['all', 'mine', 'errors', 'archive'];

/** Хто «надіслав» сповіщення: користувач (ініціали) або сервіс (іконка). */
export type NotificationSource =
  | { type: 'user'; userId: number; name: string; initials: string }
  | { type: 'service'; id: NotificationServiceId; label: string };

export type NotificationServiceId =
  | 'dilovod'
  | 'salesdrive'
  | 'sync'
  | 'warehouse'
  | 'products'
  | 'assembly'
  | 'cron'
  | 'webhook'
  | 'system';

/** null – активне; mine – архівовано користувачем; resolved – «Вирішено» адміністратором. */
export type NotificationArchiveState = null | 'mine' | 'resolved';

/** Один запуск дії, що створив запис журналу. */
export interface NotificationAttempt {
  /** Ім'я користувача, канал («SalesDrive») або «автоматично». */
  label: string;
  /** Для аватара в підказці: користувач або сервіс. */
  source: NotificationSource;
  at: string;
}

export type NotificationDocumentKind = 'release' | 'movement' | 'writeOff';

export interface NotificationDocumentItem {
  sku: string | null;
  name: string;
  quantity: number;
  batch: string | null;
  /** Рядок набору (комплект) – компоненти йдуть після нього. */
  isGroup?: boolean;
}

/** Позиція з помилки «Недостатня кількість» від Діловода. */
export interface NotificationShortageRow {
  name: string;
  sku: string | null;
  batch: string | null;
  needed: number | null;
  stock: number | null;
  missing: number | null;
}

/** GET /api/notifications/:id/document */
export interface NotificationDocument {
  kind: NotificationDocumentKind;
  title: string;
  docNumber: string | null;
  localId: number | null;
  status: string | null;
  date: string | null;
  authorName: string | null;
  storageId: string | null;
  storageToId: string | null;
  comment: string | null;
  /** Причина, з якою Діловод не прийняв документ. */
  error: string | null;
  /** Розібрані позиції з помилки про нестачу; порожньо – текст помилки іншого виду. */
  shortage: NotificationShortageRow[];
  /** Перше речення помилки над таблицею нестачі («Документ не збережено. Недостатня кількість.»). */
  errorSummary: string | null;
  /** Є – документ можна відкрити в дровері Діловода. */
  dilovodDocId: string | null;
  items: NotificationDocumentItem[];
}

export interface NotificationFeedItem {
  /** Найновіший meta_logs.id у групі однакових сповіщень. */
  id: number;
  /** Усі meta_logs.id, згорнуті в цей рядок (повтори). */
  ids: number[];
  /** Кількість повторів (≥1). */
  count: number;
  kind: NotificationKind;
  group: NotificationGroupId;
  level: NotificationLevel;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  archived: NotificationArchiveState;
  /** Адресне (data.recipients містить поточного користувача). */
  addressed: boolean;
  /** Адресне або ініційоване поточним користувачем. */
  mine: boolean;
  orderNumber: string | null;
  category: string;
  source: NotificationSource;
  /** Канал виклику: cron / webhook / salesdrive / manual – для підпису «через …». */
  via: string | null;
  /** Номер документа для рядка мета-даних: №замовлення або номер складського документа. */
  docNumber: string | null;
  /** Кожен запуск дії у згорнутих повторах, найновіший першим (до 20). */
  attempts: NotificationAttempt[];
  /** Сповіщення про складський документ: кнопка відкриває дровер документа. */
  hasDocument: boolean;
  action: { label: string; link: string } | null;
  /** Правило, що сформувало рядок; null – «Без шаблону». */
  ruleId: number | null;
  ruleName: string | null;
}

export interface NotificationFeedCounts {
  /** Непрочитані у вкладках all / mine / errors; archive – загальна кількість. */
  all: number;
  mine: number;
  errors: number;
  archive: number;
}

export interface NotificationFeedResponse {
  success: true;
  tab: NotificationTab;
  data: NotificationFeedItem[];
  counts: NotificationFeedCounts;
  serverTime: string;
}

/** Персональні налаштування сповіщень (шестерня в дропдауні). */
export interface NotificationUserPrefsData {
  /** Групи, приглушені в дропдауні (адресні сповіщення все одно приходять). */
  mutedGroups: NotificationGroupId[];
  /** Групи, які не дублювати в Telegram. */
  mutedTgGroups: NotificationGroupId[];
  /** Звуковий сигнал при новому сповіщенні. */
  sound: boolean;
  /** Вкладка, з якої дзвіночок відкривається вперше за сесію. */
  defaultTab: NotificationTab;
}

export const DEFAULT_NOTIFICATION_USER_PREFS: NotificationUserPrefsData = {
  mutedGroups: [],
  mutedTgGroups: [],
  sound: false,
  defaultTab: 'mine',
};

export interface NotificationPrefsResponse {
  success: true;
  prefs: NotificationUserPrefsData;
  /** Групи, які роль дозволяє в кожному каналі (хоч один рівень). */
  allowed: { app: NotificationGroupId[]; tg: NotificationGroupId[] };
  telegram: { configured: boolean; linked: boolean; username: string | null };
}
