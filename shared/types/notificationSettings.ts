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
