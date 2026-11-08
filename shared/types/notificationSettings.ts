/** Notification Centre settings API (/api/notification-settings). */

export interface NotificationSourceSummary {
  category: string;
  status: string;
  title: string | null;
  count: number;
  lastAt: string;
  /** Найновіший запис цього джерела – для тестера. */
  sampleId: number;
  ruleId: number | null;
  ruleName: string | null;
  /** Чи потрапляє в дропдаун (правило show, або error/warning без правила). */
  visible: boolean;
}

export interface NotificationRawLog {
  id: number;
  createdAt: string;
  category: string;
  status: string;
  title: string | null;
  message: string | null;
  orderNumber: string | null;
  initiatedBy: string | null;
  data: unknown;
  /** Користувач-ініціатор (за userId або email у initiatedBy). */
  actorUserId: number | null;
  actorName: string | null;
}

export interface NotificationConfigRevisionDto {
  id: number;
  entity: 'rule' | 'glossary';
  entityId: number | null;
  action: string;
  before: unknown;
  after: unknown;
  userId: number | null;
  userName: string | null;
  createdAt: string;
  /** Назва правила / фраза словника. */
  label: string;
}

/** Telegram-бот сповіщень (settings_base `notification_telegram`). */
export interface NotificationTelegramSettings {
  botToken: string;
  botUsername: string | null;
  enabled: boolean;
}

export interface NotificationTelegramAdminState {
  configured: boolean;
  enabled: boolean;
  botUsername: string | null;
  botTokenMasked: string;
  /** Чи працює воркер на цьому сервері (вимкнено в development без NOTIFICATION_TG_WORKER=1). */
  workerActive: boolean;
  links: Array<{
    userId: number;
    name: string;
    roleName: string | null;
    telegramUsername: string | null;
    linkedAt: string | null;
  }>;
  /** Кількість записів outbox за 7 днів за статусом. */
  stats: Record<string, number>;
  lastErrors: Array<{ id: number; userId: number; lastError: string | null; createdAt: string }>;
}
