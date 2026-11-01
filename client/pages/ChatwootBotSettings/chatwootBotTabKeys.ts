export const CHATWOOT_SETTINGS_TAB_KEYS = [
  'connection',
  'ai',
  'replies',
  'operator',
  'orders',
  'topics',
  'sandbox',
  'journal',
] as const;

export type ChatwootSettingsTabKey = (typeof CHATWOOT_SETTINGS_TAB_KEYS)[number];

/** Старі hash-посилання (до перебудови вкладок) ведуть на нові. */
const LEGACY_TAB_KEYS: Record<string, ChatwootSettingsTabKey> = {
  handover: 'operator',
  cancel: 'orders',
};

export function parseChatwootSettingsTabKey(raw: string | null): ChatwootSettingsTabKey {
  if (raw && CHATWOOT_SETTINGS_TAB_KEYS.includes(raw as ChatwootSettingsTabKey)) {
    return raw as ChatwootSettingsTabKey;
  }
  if (raw && LEGACY_TAB_KEYS[raw]) return LEGACY_TAB_KEYS[raw];
  return 'connection';
}

export const CHATWOOT_SETTINGS_TAB_LABELS: Record<ChatwootSettingsTabKey, string> = {
  connection: 'Підключення',
  ai: 'AI',
  replies: 'Відповіді',
  operator: 'Оператор',
  orders: 'Замовлення й клієнти',
  topics: 'Теми питань',
  sandbox: 'Пісочниця',
  journal: 'Журнал',
};
