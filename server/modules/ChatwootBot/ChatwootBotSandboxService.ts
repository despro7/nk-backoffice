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
} from '../../../shared/types/chatwootBotSandbox.js';
import type { LlmMessage } from '../../../shared/types/llm.js';
import { applyChatwootAiTestOverrides, chatwootBotSettingsService } from './ChatwootBotSettingsService.js';
import { chatwootBotInboxHoursService } from './ChatwootBotInboxHoursService.js';
import { matchesHandover } from './ChatwootBotHandoverUtils.js';
import { matchAutoReplyFromSettings } from './ChatwootBotPatternMatcher.js';
import { chatwootBotLlmRunner } from './ChatwootBotLlmRunner.js';

const MAX_MESSAGES = 40;

const OPERATOR_KIND_LABEL: Record<ChatwootBotOperatorRequestKind, string> = {
  no_answer: 'не знайшов відповіді',
  action: 'запит на дію',
  human: 'клієнт хоче людину',
};
const MAX_MESSAGE_CHARS = 2000;
const MAX_SCENARIOS = 100;

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
 * але без Chatwoot і без стану розмови. verify_customer тут недоступний.
 */
export class ChatwootBotSandboxService {
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
    });
    const inHours =
      typeof request.inBusinessHours === 'boolean'
        ? request.inBusinessHours
        : (await chatwootBotInboxHoursService.isWithinBusinessHours(settings, settings.handoverDefaultInboxId)).inHours;

    if (matchesHandover(last.content, settings.handoverKeywords)) {
      return { outcome: 'handover_keyword', text: handoverText(settings, inHours), inBusinessHours: inHours };
    }
    const pattern = matchAutoReplyFromSettings(last.content, settings);
    if (pattern) {
      return { outcome: 'pattern', text: pattern.reply, inBusinessHours: inHours, detail: pattern.ruleId };
    }

    const history: LlmMessage[] = messages.slice(0, -1);
    while (history.length > 0 && history[0].role !== 'user') history.shift();
    const llm = await chatwootBotLlmRunner.generateReply(
      settings,
      { conversation: { custom_attributes: {} } },
      last.content,
      { propagateErrors: true, history, inBusinessHours: inHours, sandbox: true },
    );
    if (llm.operatorRequested) {
      return {
        outcome: 'operator_tool',
        text: operatorHandoverMessage(settings, llm.operatorRequested.kind, inHours),
        inBusinessHours: inHours,
        detail: `${OPERATOR_KIND_LABEL[llm.operatorRequested.kind]}: ${llm.operatorRequested.reason}`,
        meta: llm.testMeta,
      };
    }
    if (llm.text) {
      return { outcome: 'llm', text: llm.text, inBusinessHours: inHours, meta: llm.testMeta };
    }
    return {
      outcome: 'fallback',
      text: settings.fallbackMessage || settings.echoMessage,
      inBusinessHours: inHours,
      meta: llm.testMeta,
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
