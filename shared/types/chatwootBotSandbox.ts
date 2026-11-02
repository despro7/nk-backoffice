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
  /** Сесія діалогу: стан верифікації живе між повідомленнями, доки діалог не очищено. */
  sessionId?: string;
  /** null — як зараз за розкладом inbox. */
  inBusinessHours?: boolean | null;
  /** Чернетка маски з форми налаштувань (ще не збережена). */
  aiMaskId?: string;
  aiMasks?: Array<{ id: string; name: string; systemPrompt: string }>;
  /** Чернетка інструкцій для AI з форми. */
  aiInstructions?: Record<string, string>;
  /** Чернетка сценаріїв дій з форми. */
  actionScenarios?: unknown[];
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
  /** Верифікація після цього повідомлення (лише якщо в сесії вже була спроба або вона пройдена). */
  verify?: ChatwootBotSandboxVerifyState;
};

export type ChatwootBotSandboxVerifyState = {
  /** Скільки замовлень відкрито в сесії. */
  verifiedOrders: number;
  /** Автоперевірка цього повідомлення до моделі: `ok` або причина невдачі. */
  attempt?: 'ok' | 'mismatch' | 'ambiguous' | 'rate_limited' | 'invalid_input';
  failedAttempts: number;
};

export type ChatwootBotSandboxScenario = {
  id: string;
  title: string;
  /** Репліки клієнта по черзі; відповіді бота генеруються під час прогону. */
  messages: string[];
  /** Чого очікуємо (нотатка для людини, автоматично не перевіряється). */
  expectation?: string;
};
