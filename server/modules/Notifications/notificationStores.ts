/**
 * Notification Centre storage in settings_base (category `notifications`).
 * Each key holds `{ nextId, items }`; see jsonCollection.ts.
 */

import { JsonCollection } from './jsonCollection.js';

export interface StoredRule {
  id: number;
  /** Стабільний ключ стандартного правила; null – створене вручну. */
  key: string | null;
  name: string;
  enabled: boolean;
  position: number;
  match: unknown;
  output: unknown;
  /** null – стандартне правило, яке ніхто не редагував (оновлюється разом із кодом). */
  updatedById: number | null;
  updatedAt: string;
}

export interface StoredGlossaryEntry {
  id: number;
  phrase: string;
  replacement: string;
  isRegex: boolean;
  enabled: boolean;
  position: number;
  updatedById: number | null;
  updatedAt: string;
}

/** id = userId. */
export interface StoredUserPrefs {
  id: number;
  prefs: unknown;
  updatedAt: string;
}

/** id = userId. chatId null – ще не підключено (є лише одноразовий код). */
export interface StoredTelegramLink {
  id: number;
  chatId: string | null;
  username: string | null;
  firstName: string | null;
  linkCode: string | null;
  linkCodeExpires: string | null;
  linkedAt: string | null;
}

export const ruleStore = new JsonCollection<StoredRule>('notification_rules', 'Центр сповіщень: правила');
export const glossaryStore = new JsonCollection<StoredGlossaryEntry>('notification_glossary', 'Центр сповіщень: словник');
export const userPrefsStore = new JsonCollection<StoredUserPrefs>('notification_user_prefs', 'Центр сповіщень: особисті налаштування');
export const telegramLinkStore = new JsonCollection<StoredTelegramLink>('notification_telegram_links', 'Центр сповіщень: підключені Telegram-чати');

export const nowIso = () => new Date().toISOString();
