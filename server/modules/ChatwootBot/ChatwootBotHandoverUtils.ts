import {
  CHATWOOT_BOT_ATTR_OOH_CALLBACK_PENDING,
  DEFAULT_CHATWOOT_BOT_EMERGENCY_KEYWORDS,
  DEFAULT_CHATWOOT_BOT_HANDOVER_WORK_DAYS,
  type ChatwootBotProcessAction,
  type ChatwootBotSettings,
} from '../../../shared/types/chatwootBot.js';

export function matchesKeywordList(content: string, keywords: string[]): boolean {
  const lower = content.toLowerCase();
  return keywords.some((kw) => {
    const needle = kw.trim().toLowerCase();
    return needle.length > 0 && lower.includes(needle);
  });
}

export function matchesHandover(content: string, keywords: string[]): boolean {
  return matchesKeywordList(content, keywords);
}

export function matchesEmergency(content: string, settings: ChatwootBotSettings): boolean {
  if (!settings.handoverEmergencyEnabled) return false;
  const keywords =
    settings.handoverEmergencyKeywords.length > 0
      ? settings.handoverEmergencyKeywords
      : [...DEFAULT_CHATWOOT_BOT_EMERGENCY_KEYWORDS];
  return matchesKeywordList(content, keywords);
}

const UA_PHONE_REGEX =
  /(?:\+?\s?380|0)\s*(?:\d{2}|\(\d{2}\))\s*[\d\s\-()]{5,12}\d/g;

export function extractCallbackPhone(content: string): string | null {
  const matches = content.match(UA_PHONE_REGEX);
  if (!matches?.length) return null;
  const digits = matches[0].replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (digits.startsWith('380')) return `+${digits}`;
  if (digits.startsWith('0')) return `+38${digits}`;
  return `+${digits}`;
}

const CALLBACK_INTENT_PHRASES = ['передзвон', 'зателефон', 'телефон', 'номер', 'звʼяж', 'зв\'яж'];

export function matchesCallbackIntent(content: string): boolean {
  const lower = content.toLowerCase();
  return CALLBACK_INTENT_PHRASES.some((p) => lower.includes(p));
}

export function isOohCallbackPending(attrs: Record<string, unknown> | undefined): boolean {
  if (!attrs) return false;
  const v = attrs[CHATWOOT_BOT_ATTR_OOH_CALLBACK_PENDING];
  return v === true || v === 'true' || v === 1 || v === '1';
}

function parseHm(hm: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return { h, m };
}

function getZonedParts(date: Date, timeZone: string): { weekday: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return {
    weekday: weekdayMap[weekdayStr] ?? 1,
    minutes: hour * 60 + minute,
  };
}

export function isWithinHandoverHours(settings: ChatwootBotSettings, now = new Date()): boolean {
  const tz = settings.handoverTimezone.trim() || 'Europe/Kyiv';
  const start = parseHm(settings.handoverWorkStart);
  const end = parseHm(settings.handoverWorkEnd);
  if (!start || !end) return true;

  const workDays =
    settings.handoverWorkDays.length > 0
      ? settings.handoverWorkDays
      : [...DEFAULT_CHATWOOT_BOT_HANDOVER_WORK_DAYS];

  let zoned: { weekday: number; minutes: number };
  try {
    zoned = getZonedParts(now, tz);
  } catch {
    return true;
  }

  if (!workDays.includes(zoned.weekday)) return false;

  const startMin = start.h * 60 + start.m;
  const endMin = end.h * 60 + end.m;
  if (startMin <= endMin) {
    return zoned.minutes >= startMin && zoned.minutes < endMin;
  }
  return zoned.minutes >= startMin || zoned.minutes < endMin;
}

export function shouldPersistEvent(action: ChatwootBotProcessAction, reason: string): boolean {
  if (action === 'echo' || action === 'handover' || action === 'error') return true;
  if (action === 'ignored' && reason === 'bot_disabled') return true;
  if (action !== 'ignored') return true;

  if (reason.startsWith('unsupported_event:')) return false;
  if (reason === 'private_message') return false;
  if (reason === 'not_incoming') return false;
  if (reason.startsWith('sender_not_contact:')) return false;
  return true;
}
