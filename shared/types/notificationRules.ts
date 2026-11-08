import type {
  NotificationGroupId,
  NotificationKind,
  NotificationLevel,
} from '../constants/notifications.js';

/** Заміна в тексті: regex → рядок із $1 / $<name>. Застосовується по черзі. */
export interface NotificationReplacement {
  pattern: string;
  /** Прапорці RegExp без `g` (додається завжди), напр. "im". */
  flags?: string;
  replace: string;
  /** До чого застосовувати. За замовчуванням message. */
  target?: 'title' | 'message' | 'both';
}

export interface NotificationRuleMatch {
  /** Точні значення meta_logs.category. Порожньо – будь-яка. */
  categories?: string[];
  /** meta_logs.status. Порожньо – будь-який. */
  statuses?: NotificationLevel[];
  /** Regex по title (без прапорців, регістр ігнорується). */
  title?: string;
  /** Regex по message (регістр ігнорується, `.` не ловить перенос). */
  message?: string;
  /** Regex по initiatedBy. */
  initiatedBy?: string;
  /** Шлях у data, який має існувати, напр. "releaseId". */
  dataHas?: string;
}

export interface NotificationRuleOutput {
  kind?: NotificationKind;
  group?: NotificationGroupId;
  /** Перевизначити рівень (напр. warning → info для задач). */
  level?: NotificationLevel;
  /** hidden – запис лишається в журналі, але не потрапляє в дропдаун і Telegram. */
  visibility: 'show' | 'hidden';
  /** Шаблон заголовка: {{group}}, {{message}}, {{orderNumber}}, {{data.x}} … */
  title?: string;
  /** Шаблон тексту. Порожньо – оброблений message як є. */
  message?: string;
  replacements?: NotificationReplacement[];
  actionLabel?: string;
  /** Внутрішній шлях (починається з /), підтримує шаблон. */
  actionLink?: string;
}

export interface NotificationRuleDef {
  id?: number;
  /** Стабільний ключ засіву, для «Скинути до стандартного». */
  key?: string | null;
  name: string;
  enabled: boolean;
  position: number;
  match: NotificationRuleMatch;
  output: NotificationRuleOutput;
}

/** Глобальний словник фраз, застосовується після правил. */
export interface NotificationGlossaryEntry {
  id?: number;
  phrase: string;
  replacement: string;
  /** phrase – regex замість буквального тексту. */
  isRegex: boolean;
  enabled: boolean;
  position: number;
}

/** Мінімальний вхід рушія: рядок meta_logs + імʼя ініціатора. */
export interface NotificationSourceLog {
  id: number;
  category: string;
  status: string;
  title: string | null;
  message: string | null;
  orderNumber: string | null;
  initiatedBy: string | null;
  data: unknown;
  /** Імʼя користувача-ініціатора, якщо відомо. */
  actorName?: string | null;
}

export interface RenderedNotification {
  ruleId: number | null;
  ruleName: string | null;
  kind: NotificationKind;
  group: NotificationGroupId;
  level: NotificationLevel;
  visible: boolean;
  title: string;
  message: string;
  actionLabel: string | null;
  actionLink: string | null;
  /** Значення для шаблонів (для тестера playground). */
  vars: Record<string, string>;
}
