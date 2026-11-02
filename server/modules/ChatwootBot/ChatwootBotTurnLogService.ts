import { AsyncLocalStorage } from 'node:async_hooks';
import { prisma, logServer } from '../../lib/utils.js';
import type { LlmTestModelResponse } from '../../../shared/types/llm.js';
import type { ChatwootBotSandboxVerifyState } from '../../../shared/types/chatwootBotSandbox.js';
import {
  CHATWOOT_BOT_TURN_OUTCOMES,
  CHATWOOT_BOT_TURN_RETENTION_DAYS,
  type ChatwootBotDialogDto,
  type ChatwootBotDialogSummaryDto,
  type ChatwootBotDialogsQuery,
  type ChatwootBotTurnDto,
  type ChatwootBotTurnOutcome,
} from '../../../shared/types/chatwootBotDialogs.js';
import { activeVerifiedOrderIds, type ChatwootBotConversationStateSnapshot } from './chatwootBotConversationStateUtils.js';
import type { ChatwootBotVerifyAttemptResult } from '../../../shared/types/chatwootBotTools.js';

type LlmMeta = Omit<LlmTestModelResponse, 'reply'>;

type TurnDraft = {
  conversationId: number;
  messageId: number | null;
  inboxId: number | null;
  customerText: string;
  inHours: boolean | null;
  dryRun: boolean;
  replies: string[];
  outcome?: ChatwootBotTurnOutcome;
  detail?: string | null;
  llm?: LlmMeta;
  verify?: ChatwootBotSandboxVerifyState;
};

/** Хід, який збирається під час обробки одного вебхука (усі гілки оркестратора й роутера). */
const storage = new AsyncLocalStorage<{ draft?: TurnDraft }>();

/** Ліміт JSON діагностики LLM у БД; довші відповіді інструментів обрізаються. */
const LLM_JSON_MAX = 60_000;
const TRACE_RESULT_MAX = 6_000;
const DIALOGS_LIMIT = 300;

/** Стан верифікації після ходу (як у пісочниці); `undefined` — верифікація не торкалась. */
export function summarizeVerify(
  state: ChatwootBotConversationStateSnapshot,
  attempt: ChatwootBotVerifyAttemptResult | null,
): ChatwootBotSandboxVerifyState | undefined {
  const verifiedOrders = activeVerifiedOrderIds(state, Date.now()).length;
  if (!attempt && verifiedOrders === 0 && state.failedAttempts === 0) return undefined;
  return {
    verifiedOrders,
    failedAttempts: state.failedAttempts,
    ...(attempt ? { attempt: attempt.ok === true ? 'ok' : attempt.reason } : {}),
  };
}

export function compactLlmMeta(meta: LlmMeta): LlmMeta {
  if (JSON.stringify(meta).length <= LLM_JSON_MAX) return meta;
  return {
    ...meta,
    toolTrace: meta.toolTrace?.map((entry) => {
      const text = JSON.stringify(entry.result);
      return text.length > TRACE_RESULT_MAX ? { ...entry, result: `${text.slice(0, TRACE_RESULT_MAX)}… (обрізано)` } : entry;
    }),
  };
}

function toDto(row: {
  id: number;
  conversationId: number;
  messageId: number | null;
  customerText: string;
  replies: unknown;
  outcome: string;
  detail: string | null;
  inHours: boolean | null;
  dryRun: boolean;
  llm: unknown;
  verify: unknown;
  createdAt: Date;
}): ChatwootBotTurnDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    messageId: row.messageId,
    customerText: row.customerText,
    replies: Array.isArray(row.replies) ? row.replies.filter((r): r is string => typeof r === 'string') : [],
    outcome: row.outcome as ChatwootBotTurnOutcome,
    detail: row.detail,
    inHours: row.inHours,
    dryRun: row.dryRun,
    ...(row.llm ? { llm: row.llm as LlmMeta } : {}),
    ...(row.verify ? { verify: row.verify as ChatwootBotSandboxVerifyState } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

export class ChatwootBotTurnLogService {
  /** Обгортка обробки вебхука: хід, розпочатий усередині, записується після завершення (best-effort). */
  run<T>(fn: () => Promise<T>): Promise<T> {
    const holder: { draft?: TurnDraft } = {};
    return storage.run(holder, async () => {
      try {
        return await fn();
      } finally {
        if (holder.draft?.outcome) void this.persist(holder.draft);
      }
    });
  }

  /** Повідомлення клієнта, на яке реагує бот. */
  begin(input: Omit<TurnDraft, 'replies' | 'outcome' | 'detail' | 'llm' | 'verify'>): void {
    const holder = storage.getStore();
    if (holder) holder.draft = { ...input, replies: [] };
  }

  /**
   * Що зробив бот. `keepOutcome` — не перезаписувати вже відомий результат
   * (handover після request_operator проходить через ту саму гілку, що й ключове слово).
   */
  note(
    patch: { outcome?: ChatwootBotTurnOutcome; detail?: string | null; llm?: LlmMeta; verify?: ChatwootBotSandboxVerifyState },
    options: { keepOutcome?: boolean } = {},
  ): void {
    const draft = storage.getStore()?.draft;
    if (!draft) return;
    if (patch.outcome && !(options.keepOutcome && draft.outcome)) {
      draft.outcome = patch.outcome;
      if (patch.detail !== undefined) draft.detail = patch.detail;
    }
    if (patch.llm) draft.llm = patch.llm;
    if (patch.verify) draft.verify = patch.verify;
  }

  /** Публічна відповідь бота клієнту в поточному ході. */
  noteReply(text: string): void {
    const draft = storage.getStore()?.draft;
    if (draft && text.trim()) draft.replies.push(text);
  }

  private async persist(draft: TurnDraft): Promise<void> {
    try {
      await prisma.chatwootBotTurn.create({
        data: {
          conversationId: draft.conversationId,
          messageId: draft.messageId,
          inboxId: draft.inboxId,
          customerText: draft.customerText,
          replies: draft.replies,
          outcome: draft.outcome!,
          detail: draft.detail?.slice(0, 255) ?? null,
          inHours: draft.inHours,
          dryRun: draft.dryRun,
          llm: draft.llm ? (compactLlmMeta(draft.llm) as object) : undefined,
          verify: draft.verify ?? undefined,
        },
      });
    } catch (err) {
      logServer(`[ChatwootBot] turn log write failed conv=${draft.conversationId} (non-fatal)`, err);
    }
  }

  /** Розмови з ходами бота за період: останні зверху. */
  async listDialogs(query: ChatwootBotDialogsQuery): Promise<ChatwootBotDialogSummaryDto[]> {
    const createdAt = {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    };
    const search = query.search?.trim();
    const outcome = CHATWOOT_BOT_TURN_OUTCOMES.find((o) => o === query.outcome);
    // Фільтри відбирають розмови; у підсумок ідуть усі ходи цих розмов за період.
    const matched = await prisma.chatwootBotTurn.findMany({
      where: {
        createdAt,
        ...(outcome ? { outcome } : {}),
        ...(search
          ? /^\d+$/.test(search)
            ? { OR: [{ conversationId: Number(search) }, { customerText: { contains: search } }] }
            : { customerText: { contains: search } }
          : {}),
      },
      distinct: ['conversationId'],
      orderBy: { createdAt: 'desc' },
      take: DIALOGS_LIMIT,
      select: { conversationId: true },
    });
    if (matched.length === 0) return [];
    const rows = await prisma.chatwootBotTurn.findMany({
      where: { createdAt, conversationId: { in: matched.map((m) => m.conversationId) } },
      orderBy: { createdAt: 'asc' },
      select: { conversationId: true, customerText: true, outcome: true, llm: true, createdAt: true },
    });
    const byConversation = new Map<number, ChatwootBotDialogSummaryDto & { toolCounts: Map<string, number> }>();
    for (const row of rows) {
      let dialog = byConversation.get(row.conversationId);
      if (!dialog) {
        dialog = {
          conversationId: row.conversationId,
          firstQuestion: row.customerText,
          turns: 0,
          outcomes: {},
          tools: [],
          costUsd: 0,
          firstAt: row.createdAt.toISOString(),
          lastAt: row.createdAt.toISOString(),
          toolCounts: new Map(),
        };
        byConversation.set(row.conversationId, dialog);
      }
      dialog.turns += 1;
      const o = row.outcome as ChatwootBotTurnOutcome;
      dialog.outcomes[o] = (dialog.outcomes[o] ?? 0) + 1;
      dialog.lastAt = row.createdAt.toISOString();
      const llm = row.llm as LlmMeta | null;
      dialog.costUsd += llm?.usage?.estimatedCostUsd ?? 0;
      for (const [name, count] of Object.entries(llm?.toolsInvoked ?? {})) {
        dialog.toolCounts.set(name, (dialog.toolCounts.get(name) ?? 0) + count);
      }
    }
    return [...byConversation.values()]
      .map(({ toolCounts, ...dialog }) => ({
        ...dialog,
        tools: [...toolCounts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }

  async getDialog(conversationId: number): Promise<Omit<ChatwootBotDialogDto, 'chatwootUrl'>> {
    const rows = await prisma.chatwootBotTurn.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } });
    return { conversationId, turns: rows.map(toDto) };
  }

  /** Видаляє ходи старші за retention (cron очищення журналу бота). */
  async purgeStale(): Promise<number> {
    const cutoff = new Date(Date.now() - CHATWOOT_BOT_TURN_RETENTION_DAYS * 86_400_000);
    try {
      const result = await prisma.chatwootBotTurn.deleteMany({ where: { createdAt: { lt: cutoff } } });
      return result.count;
    } catch (err) {
      logServer('[ChatwootBot] turn log purge failed', err);
      return 0;
    }
  }
}

export const chatwootBotTurnLogService = new ChatwootBotTurnLogService();
