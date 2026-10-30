import { prisma } from '../../lib/utils.js';
import { normalizePhoneNumber } from '../../../shared/utils/phoneNormalizer.js';

/**
 * Канали, де телефон контакту дає сама платформа (його не ввести вручну у віджеті).
 * Telegram і Viber телефон боту не передають, тому їх тут немає.
 */
export const CHATWOOT_BOT_TRUSTED_PHONE_CHANNELS: readonly string[] = [
  'Channel::Whatsapp',
  'Channel::Sms',
  'Channel::TwilioSms',
];

export function isTrustedPhoneChannel(channel: string | null | undefined): boolean {
  return Boolean(channel && CHATWOOT_BOT_TRUSTED_PHONE_CHANNELS.includes(channel));
}

export function safeNormalizePhone(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  try {
    return normalizePhoneNumber(phone);
  } catch {
    return null;
  }
}

export function phonesMatch(stored: string | null | undefined, normalizedInput: string): boolean {
  return safeNormalizePhone(stored) === normalizedInput;
}

export async function findOrderByNumberToken(orderToken: string) {
  const token = orderToken.trim();
  if (!token) return null;
  const byExternal = await prisma.order.findUnique({ where: { externalId: token } });
  if (byExternal) return byExternal;
  return prisma.order.findFirst({ where: { orderNumber: token } });
}

/** Замовлення телефону, від найновішого (до 100). */
export async function findOrdersByPhone(normalizedPhone: string) {
  const digits = normalizedPhone.replace(/\D/g, '');
  const suffix = digits.slice(-9);
  const candidates = await prisma.order.findMany({
    where: suffix.length >= 9 ? { customerPhone: { contains: suffix } } : { customerPhone: normalizedPhone },
    orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  });
  return candidates.filter((o) => phonesMatch(o.customerPhone, normalizedPhone));
}
