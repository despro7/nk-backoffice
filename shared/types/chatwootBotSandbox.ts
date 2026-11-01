/** Пісочниця чат-бота: прогін діалогу через той самий pipeline без Chatwoot. */
import type { LlmTestModelResponse } from './llm.js';

export const CHATWOOT_BOT_SANDBOX_SCENARIOS_KEY = 'chatwoot_bot_sandbox_scenarios';

export type ChatwootBotSandboxMessage = {
  role: 'user' | 'assistant';
  content: string;
};

/** Що зробив би бот у live. */
export type ChatwootBotSandboxOutcome =
  /** Ключове слово handover — LLM не викликається. */
  | 'handover_keyword'
  /** Правило автовідповіді. */
  | 'pattern'
  /** Відповідь LLM. */
  | 'llm'
  /** LLM викликав request_operator — клієнт отримає повідомлення handover. */
  | 'operator_tool'
  /** LLM нічого не відповів — fallback. */
  | 'fallback';

export type ChatwootBotSandboxReplyRequest = {
  /** Діалог; останнє повідомлення — від клієнта. */
  messages: ChatwootBotSandboxMessage[];
  /** null — як зараз за розкладом inbox. */
  inBusinessHours?: boolean | null;
  /** Чернетка маски з форми налаштувань (ще не збережена). */
  aiMaskId?: string;
  aiMasks?: Array<{ id: string; name: string; systemPrompt: string }>;
  aiProvider?: '' | 'openai' | 'google' | 'openrouter';
  aiModel?: string;
};

export type ChatwootBotSandboxReplyResult = {
  outcome: ChatwootBotSandboxOutcome;
  /** Текст, який отримав би клієнт. */
  text: string;
  inBusinessHours: boolean;
  /** Причина з request_operator / id правила автовідповіді. */
  detail?: string;
  meta?: Omit<LlmTestModelResponse, 'reply'>;
};

export type ChatwootBotSandboxScenario = {
  id: string;
  title: string;
  /** Репліки клієнта по черзі; відповіді бота генеруються під час прогону. */
  messages: string[];
  /** Чого очікуємо (нотатка для людини, автоматично не перевіряється). */
  expectation?: string;
};
