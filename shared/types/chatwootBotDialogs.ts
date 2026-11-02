/** Журнал «Діалоги бота»: ходи бота в live-розмовах (що відповів і чому). */
import type { LlmTestModelResponse } from './llm.js';
import type { ChatwootBotSandboxVerifyState } from './chatwootBotSandbox.js';

export const CHATWOOT_BOT_TURN_RETENTION_DAYS = 90;

export type ChatwootBotTurnOutcome =
  /** Відповідь LLM. */
  | 'llm'
  /** Правило автовідповіді. */
  | 'pattern'
  /** LLM нічого не відповів — fallback. */
  | 'fallback'
  /** Бот передав розмову оператору (request_operator, невдала верифікація, повтор). */
  | 'handover'
  /** Ключове слово handover від клієнта. */
  | 'handover_keyword'
  /** Екстрений виклик поза годинами. */
  | 'emergency'
  /** Клієнт залишив контакт для дзвінка поза годинами. */
  | 'callback'
  /** Розмову веде оператор — бот мовчить. */
  | 'human_active'
  /** Бот забрав розмову в неактивного оператора. */
  | 'reclaim';

export const CHATWOOT_BOT_TURN_OUTCOMES: readonly ChatwootBotTurnOutcome[] = [
  'llm',
  'pattern',
  'fallback',
  'handover',
  'handover_keyword',
  'emergency',
  'callback',
  'human_active',
  'reclaim',
];

export type ChatwootBotTurnDto = {
  id: number;
  conversationId: number;
  messageId: number | null;
  customerText: string;
  /** Публічні повідомлення бота клієнту в цьому ході. */
  replies: string[];
  outcome: ChatwootBotTurnOutcome;
  /** Причина передачі оператору / id правила. */
  detail: string | null;
  inHours: boolean | null;
  dryRun: boolean;
  llm?: Omit<LlmTestModelResponse, 'reply'>;
  verify?: ChatwootBotSandboxVerifyState;
  createdAt: string;
};

export type ChatwootBotDialogSummaryDto = {
  conversationId: number;
  firstQuestion: string;
  turns: number;
  outcomes: Partial<Record<ChatwootBotTurnOutcome, number>>;
  /** Інструменти, які бот викликав у розмові (за кількістю викликів). */
  tools: Array<{ name: string; count: number }>;
  costUsd: number;
  firstAt: string;
  lastAt: string;
};

export type ChatwootBotDialogsQuery = {
  from?: string;
  to?: string;
  search?: string;
  outcome?: ChatwootBotTurnOutcome;
};

export type ChatwootBotDialogsResponse = {
  dialogs: ChatwootBotDialogSummaryDto[];
  /** Посилання на розмову: `${chatwootUrl}/${conversationId}`; null — Chatwoot не налаштовано. */
  chatwootUrl: string | null;
};

export type ChatwootBotDialogDto = {
  conversationId: number;
  chatwootUrl: string | null;
  turns: ChatwootBotTurnDto[];
};
