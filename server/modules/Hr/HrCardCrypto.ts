import crypto from 'node:crypto';

const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const raw = process.env.HR_PII_KEY || process.env.JWT_SECRET || 'fallback_secret';
  return crypto.createHash('sha256').update(raw).digest();
}

/** Лише цифри картки; ПІБ і логи не повинні містити номер. */
export function normalizeCardDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function cardLast4FromDigits(digits: string): string {
  return digits.slice(-4);
}

export function maskCardLast4(last4: string | null | undefined): string | null {
  if (!last4) return null;
  return `•••• ${last4}`;
}

export function encryptCardNumber(digits: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(digits, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptCardNumber(payload: string): string | null {
  try {
    const buf = Buffer.from(payload, 'base64');
    if (buf.length < IV_LEN + TAG_LEN + 1) return null;
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
