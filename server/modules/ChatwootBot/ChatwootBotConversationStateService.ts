import { Prisma } from '@prisma/client';
import { logServer, prisma } from '../../lib/utils.js';
import {
  decryptPhone,
  emptyConversationState,
  encryptPhone,
  parseVerifiedOrderIds,
  type ChatwootBotConversationStateSnapshot,
} from './chatwootBotConversationStateUtils.js';

/** Скільки днів зберігаємо стан після останньої зміни. */
const CONVERSATION_STATE_RETENTION_DAYS = 30;

export function conversationStateSecret(): string {
  return process.env.JWT_SECRET || process.env.CHATWOOT_WEBHOOK_SECRET || 'chatwoot-bot-verify';
}

export type ChatwootBotConversationStatePatch = Partial<
  Omit<ChatwootBotConversationStateSnapshot, 'conversationId'>
>;

export class ChatwootBotConversationStateService {
  async get(conversationId: number): Promise<ChatwootBotConversationStateSnapshot> {
    let row;
    try {
      row = await prisma.chatwootBotConversationState.findUnique({ where: { conversationId } });
    } catch (err) {
      // Напр., міграцію ще не застосовано: бот відповідає як неверифікована сесія, а не мовчить.
      logServer(`[ChatwootBot] conversation state read failed conv=${conversationId} (non-fatal)`, err);
      return emptyConversationState(conversationId);
    }
    if (!row) return emptyConversationState(conversationId);

    const now = Date.now();
    const phoneActive = row.pendingPhoneEnc && row.pendingPhoneExpiresAt && row.pendingPhoneExpiresAt.getTime() > now;
    return {
      conversationId,
      verifiedOrderIds: parseVerifiedOrderIds(row.verifiedOrderIds),
      verifiedPhoneHash: row.verifiedPhoneHash,
      verifyExpiresAt: row.verifyExpiresAt,
      pendingPhone: phoneActive ? decryptPhone(row.pendingPhoneEnc as string, conversationStateSecret()) : null,
      pendingPhoneExpiresAt: row.pendingPhoneExpiresAt,
      rateWindowStart: row.rateWindowStart,
      rateCount: row.rateCount,
      failedAttempts: row.failedAttempts,
    };
  }

  /** Записує зміни й повертає новий стан (телефон шифрується тут). */
  async update(
    current: ChatwootBotConversationStateSnapshot,
    patch: ChatwootBotConversationStatePatch,
  ): Promise<ChatwootBotConversationStateSnapshot> {
    const next: ChatwootBotConversationStateSnapshot = { ...current, ...patch };
    const data = {
      verifiedOrderIds: next.verifiedOrderIds.length ? next.verifiedOrderIds : Prisma.DbNull,
      verifiedPhoneHash: next.verifiedPhoneHash,
      verifyExpiresAt: next.verifyExpiresAt,
      pendingPhoneEnc: next.pendingPhone ? encryptPhone(next.pendingPhone, conversationStateSecret()) : null,
      pendingPhoneExpiresAt: next.pendingPhone ? next.pendingPhoneExpiresAt : null,
      rateWindowStart: next.rateWindowStart,
      rateCount: next.rateCount,
      failedAttempts: next.failedAttempts,
    };
    try {
      await prisma.chatwootBotConversationState.upsert({
        where: { conversationId: current.conversationId },
        update: data,
        create: { conversationId: current.conversationId, ...data },
      });
    } catch (err) {
      // Стан діє в межах поточного повідомлення; між повідомленнями не збережеться.
      logServer(`[ChatwootBot] conversation state write failed conv=${current.conversationId} (non-fatal)`, err);
    }
    return next;
  }

  /** Видаляє стани, що не змінювались довше за retention (викликає cron очищення журналу бота). */
  async purgeStale(): Promise<number> {
    const cutoff = new Date(Date.now() - CONVERSATION_STATE_RETENTION_DAYS * 86_400_000);
    try {
      const result = await prisma.chatwootBotConversationState.deleteMany({ where: { updatedAt: { lt: cutoff } } });
      return result.count;
    } catch (err) {
      logServer('[ChatwootBot] conversation state purge failed', err);
      return 0;
    }
  }
}

export const chatwootBotConversationStateService = new ChatwootBotConversationStateService();
