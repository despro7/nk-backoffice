export const CHATWOOT_SETTINGS_TAB_KEYS = [
  'connection',
  'replies',
  'ai',
  'handover',
  'topics',
  'journal',
] as const;

export type ChatwootSettingsTabKey = (typeof CHATWOOT_SETTINGS_TAB_KEYS)[number];

export function parseChatwootSettingsTabKey(raw: string | null): ChatwootSettingsTabKey {
  if (raw && CHATWOOT_SETTINGS_TAB_KEYS.includes(raw as ChatwootSettingsTabKey)) {
    return raw as ChatwootSettingsTabKey;
  }
  return 'connection';
}

export const CHATWOOT_SETTINGS_TAB_LABELS: Record<ChatwootSettingsTabKey, string> = {
  connection: 'Підключення',
  replies: 'Відповіді',
  ai: 'AI і verify',
  handover: 'Handover',
  topics: 'Теми питань',
  journal: 'Журнал',
};
