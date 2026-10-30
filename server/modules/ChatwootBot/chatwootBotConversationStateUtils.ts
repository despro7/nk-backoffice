import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** Стан розмови в памʼяті сервера (розшифрований, з датами). */
export type ChatwootBotConversationStateSnapshot = {
  conversationId: number;
  verifiedOrderIds: number[];
  verifiedPhoneHash: string | null;
  verifyExpiresAt: Date | null;
  /** Розшифрований телефон, наданий у розмові (null — немає або прострочений). */
  pendingPhone: string | null;
  pendingPhoneExpiresAt: Date | null;
  rateWindowStart: Date | null;
  rateCount: number;
  failedAttempts: number;
};

export function emptyConversationState(conversationId: number): ChatwootBotConversationStateSnapshot {
  return {
    conversationId,
    verifiedOrderIds: [],
    verifiedPhoneHash: null,
    verifyExpiresAt: null,
    pendingPhone: null,
    pendingPhoneExpiresAt: null,
    rateWindowStart: null,
    rateCount: 0,
    failedAttempts: 0,
  };
}

/** Замовлення, доступні в активній сесії верифікації. */
export function activeVerifiedOrderIds(state: ChatwootBotConversationStateSnapshot, nowMs: number): number[] {
  if (!state.verifyExpiresAt || state.verifyExpiresAt.getTime() <= nowMs) return [];
  return state.verifiedOrderIds;
}

export function parseVerifiedOrderIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
}

export type VerifyRateLimitConfig = { windowMinutes: number; maxAttempts: number };

function windowIsOpen(state: ChatwootBotConversationStateSnapshot, cfg: VerifyRateLimitConfig, nowMs: number): boolean {
  return state.rateWindowStart != null && nowMs - state.rateWindowStart.getTime() <= cfg.windowMinutes * 60_000;
}

export function isVerifyRateLimited(
  state: ChatwootBotConversationStateSnapshot,
  cfg: VerifyRateLimitConfig,
  nowMs: number,
): boolean {
  return windowIsOpen(state, cfg, nowMs) && state.rateCount >= cfg.maxAttempts;
}

/** Лічильник після ще однієї спроби (нове вікно, якщо попереднє закрилось). */
export function bumpVerifyRate(
  state: ChatwootBotConversationStateSnapshot,
  cfg: VerifyRateLimitConfig,
  nowMs: number,
): { rateWindowStart: Date; rateCount: number } {
  if (windowIsOpen(state, cfg, nowMs) && state.rateWindowStart) {
    return { rateWindowStart: state.rateWindowStart, rateCount: state.rateCount + 1 };
  }
  return { rateWindowStart: new Date(nowMs), rateCount: 1 };
}

const PHONE_CIPHER_VERSION = 'v1';

function phoneKey(secret: string): Buffer {
  return createHash('sha256').update(`chatwoot-bot-conversation-state:${secret}`).digest();
}

/** AES-256-GCM: `v1:<iv>:<tag>:<ciphertext>` (base64url). */
export function encryptPhone(phone: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', phoneKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(phone, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PHONE_CIPHER_VERSION, iv, tag, encrypted].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join(':');
}

/** null — формат невідомий, ключ змінився або дані пошкоджені. */
export function decryptPhone(payload: string, secret: string): string | null {
  const [version, ivRaw, tagRaw, dataRaw] = payload.split(':');
  if (version !== PHONE_CIPHER_VERSION || !ivRaw || !tagRaw || !dataRaw) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', phoneKey(secret), Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(dataRaw, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
