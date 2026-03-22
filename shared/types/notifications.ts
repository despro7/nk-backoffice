/**
 * Shared types for the Notification Centre.
 * Used by both server (route responses) and client (NotificationBell, useNotifications).
 */

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
