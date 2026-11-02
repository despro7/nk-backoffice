import { randomUUID } from 'crypto';
import { prisma } from '../../lib/utils.js';
import {
  CHATWOOT_BOT_SETTINGS_CATEGORY,
  operatorHandoverMessage,
  type ChatwootBotOperatorRequestKind,
  type ChatwootBotSettings,
} from '../../../shared/types/chatwootBot.js';
import {
  CHATWOOT_BOT_SANDBOX_SCENARIOS_KEY,
  type ChatwootBotSandboxReplyRequest,
  type ChatwootBotSandboxReplyResult,
  type ChatwootBotSandboxScenario,
  type ChatwootBotSandboxVerifyState,
} from '../../../shared/types/chatwootBotSandbox.js';
import type { LlmMessage } from '../../../shared/types/llm.js';
import { applyChatwootAiTestOverrides, chatwootBotSettingsService } from './ChatwootBotSettingsService.js';
import { chatwootBotInboxHoursService } from './ChatwootBotInboxHoursService.js';
import { matchesHandover } from './ChatwootBotHandoverUtils.js';
import { matchAutoReplyFromSettings } from './ChatwootBotPatternMatcher.js';
import { chatwootBotLlmRunner } from './ChatwootBotLlmRunner.js';
import { buildVerifyResultNote, chatwootBotVerifyService, type ChatwootBotVerifyStateStore } from './ChatwootBotVerifyService.js';
import {
  activeVerifiedOrderIds,
  emptyConversationState,
  type ChatwootBotConversationStateSnapshot,
} from './chatwootBotConversationStateUtils.js';

const MAX_MESSAGES = 40;

const OPERATOR_KIND_LABEL: Record<ChatwootBotOperatorRequestKind, string> = {
  no_answer: 'не знайшов відповіді',
  action: 'запит на дію',
  human: 'клієнт хоче людину',
};
const MAX_MESSAGE_CHARS = 2000;
const MAX_SCENARIOS = 100;
/** Стан верифікації сесії пісочниці живе в памʼяті стільки після останнього повідомлення. */
const SESSION_TTL_MS = 2 * 3600_000;
const MAX_SESSIONS = 200;

function handoverText(settings: ChatwootBotSettings, inHours: boolean): string {
  return inHours ? settings.handoverMessageInHours : settings.handoverMessageOutOfHours;
}

function normalizeScenario(raw: unknown): ChatwootBotSandboxScenario | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === 'string' ? r.title.trim().slice(0, 200) : '';
  const messages = Array.isArray(r.messages)
    ? r.messages
        .filter((m): m is string => typeof m === 'string' && m.trim() !== '')
        .map((m) => m.trim().slice(0, MAX_MESSAGE_CHARS))
        .slice(0, 20)
    : [];
  if (!title || messages.length === 0) return null;
  const expectation = typeof r.expectation === 'string' ? r.expectation.trim().slice(0, 1000) : '';
  return {
    id: typeof r.id === 'string' && r.id.trim() ? r.id.trim().slice(0, 64) : randomUUID(),
    title,
    messages,
    ...(expectation ? { expectation } : {}),
  };
}

/**
 * Пісочниця: те саме, що робить ReplyRouter (handover-слова → патерни → LLM з tools → fallback),
 * але без Chatwoot. Верифікація — на реальних замовленнях (лише читання), стан сесії в памʼяті сервера.
 */
export class ChatwootBotSandboxService {
  private sessions = new Map<string, { state: ChatwootBotConversationStateSnapshot; touchedAt: number }>();

  /** Сховище стану верифікації для сесії: нічого не пише в БД розмов, Chatwoot чи аналітику. */
  private sessionStore(sessionId: string | null): ChatwootBotVerifyStateStore {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.touchedAt > SESSION_TTL_MS) this.sessions.delete(id);
    }
    const save = (state: ChatwootBotConversationStateSnapshot) => {
      if (!sessionId) return state;
      this.sessions.delete(sessionId);
      this.sessions.set(sessionId, { state, touchedAt: Date.now() });
      while (this.sessions.size > MAX_SESSIONS) this.sessions.delete(this.sessions.keys().next().value as string);
      return state;
    };
    return {
      live: false,
      get: async () => (sessionId ? this.sessions.get(sessionId)?.state : undefined) ?? emptyConversationState(0),
      update: async (current, patch) => save({ ...current, ...patch }),
    };
  }

  async reply(request: ChatwootBotSandboxReplyRequest): Promise<ChatwootBotSandboxReplyResult> {
    const messages = (Array.isArray(request.messages) ? request.messages : [])
      .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_MESSAGE_CHARS) }))
      .filter((m) => m.content)
      .slice(-MAX_MESSAGES);
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user') {
      throw new Error('Останнє повідомлення має бути від клієнта');
    }

    const saved = await chatwootBotSettingsService.getSettings();
    const settings = applyChatwootAiTestOverrides(saved, {
      aiProvider: request.aiProvider,
      aiModel: request.aiModel,
      aiMaskId: request.aiMaskId,
      aiMasks: request.aiMasks,
      aiInstructions: request.aiInstructions,
      actionScenarios: request.actionScenarios,
    });
    const inHours =
      typeof request.inBusinessHours === 'boolean'
        ? request.inBusinessHours
        : (await chatwootBotInboxHoursService.isWithinBusinessHours(settings, settings.handoverDefaultInboxId)).inHours;

    const sessionId = typeof request.sessionId === 'string' && request.sessionId.trim() ? request.sessionId.trim().slice(0, 64) : null;
    const store = this.sessionStore(sessionId);
    const payload = { conversation: { custom_attributes: {} } };
    // Як у live: код сам перевіряє телефон / номер / дату з повідомлення ще до моделі.
    const verify = await chatwootBotVerifyService.tryVerifyFromUserMessage(settings, payload, 0, last.content, null, store);
    const verifyState = (state: ChatwootBotConversationStateSnapshot): ChatwootBotSandboxVerifyState | undefined => {
      const verifiedOrders = activeVerifiedOrderIds(state, Date.now()).length;
      if (!verify.attempt && verifiedOrders === 0 && state.failedAttempts === 0) return undefined;
      return {
        verifiedOrders,
        failedAttempts: state.failedAttempts,
        ...(verify.attempt ? { attempt: verify.attempt.ok === true ? 'ok' : verify.attempt.reason } : {}),
      };
    };

    if (matchesHandover(last.content, settings.handoverKeywords)) {
      return {
        outcome: 'handover_keyword',
        text: handoverText(settings, inHours),
        inBusinessHours: inHours,
        verify: verifyState(verify.state),
      };
    }
    const pattern = matchAutoReplyFromSettings(last.content, settings);
    if (pattern) {
      return {
        outcome: 'pattern',
        text: pattern.reply,
        inBusinessHours: inHours,
        detail: pattern.ruleId,
        verify: verifyState(verify.state),
      };
    }

    const history: LlmMessage[] = messages.slice(0, -1);
    while (history.length > 0 && history[0].role !== 'user') history.shift();
    const llm = await chatwootBotLlmRunner.generateReply(settings, payload, last.content, {
      propagateErrors: true,
      history,
      inBusinessHours: inHours,
      sandbox: true,
      conversationState: verify.state,
      verifyStore: store,
      systemNote: verify.attempt ? buildVerifyResultNote(verify.attempt, settings.aiInstructions) : undefined,
    });
    const verifyResult = verifyState(llm.conversationState ?? verify.state);
    if (llm.operatorRequested) {
      return {
        outcome: 'operator_tool',
        text: operatorHandoverMessage(settings, llm.operatorRequested.kind, inHours),
        inBusinessHours: inHours,
        detail: `${OPERATOR_KIND_LABEL[llm.operatorRequested.kind]}: ${llm.operatorRequested.reason}`,
        meta: llm.testMeta,
        verify: verifyResult,
      };
    }
    if (llm.text) {
      return { outcome: 'llm', text: llm.text, inBusinessHours: inHours, meta: llm.testMeta, verify: verifyResult };
    }
    return {
      outcome: 'fallback',
      text: settings.fallbackMessage || settings.echoMessage,
      inBusinessHours: inHours,
      meta: llm.testMeta,
      verify: verifyResult,
    };
  }

  async listScenarios(): Promise<ChatwootBotSandboxScenario[]> {
    const record = await prisma.settingsBase.findUnique({ where: { key: CHATWOOT_BOT_SANDBOX_SCENARIOS_KEY } });
    if (!record?.value) return [];
    try {
      const parsed: unknown = JSON.parse(record.value);
      return Array.isArray(parsed)
        ? parsed.map(normalizeScenario).filter((s): s is ChatwootBotSandboxScenario => s !== null)
        : [];
    } catch {
      return [];
    }
  }

  /** Повна заміна списку сценаріїв (порядок як у запиті). */
  async saveScenarios(raw: unknown): Promise<ChatwootBotSandboxScenario[]> {
    const scenarios = (Array.isArray(raw) ? raw : [])
      .map(normalizeScenario)
      .filter((s): s is ChatwootBotSandboxScenario => s !== null)
      .slice(0, MAX_SCENARIOS);
    const value = JSON.stringify(scenarios);
    await prisma.settingsBase.upsert({
      where: { key: CHATWOOT_BOT_SANDBOX_SCENARIOS_KEY },
      update: { value, category: CHATWOOT_BOT_SETTINGS_CATEGORY, isActive: true },
      create: {
        key: CHATWOOT_BOT_SANDBOX_SCENARIOS_KEY,
        value,
        category: CHATWOOT_BOT_SETTINGS_CATEGORY,
        description: 'Chatwoot bot sandbox test scenarios',
        isActive: true,
      },
    });
    return scenarios;
  }
}

export const chatwootBotSandboxService = new ChatwootBotSandboxService();
