/**
 * Pure rule engine for the Notification Centre.
 * Shared by the server (feed, Telegram) and the client (settings playground tester).
 *
 * Flow per log: first enabled rule whose `match` passes wins →
 * replacements on title/message → templates → glossary → result.
 * No rule matched → raw title/message with defaults (ruleId = null).
 */

import {
  defaultGroupForCategory,
  defaultKindForLevel,
  toNotificationLevel,
} from '../constants/notifications.js';
import type {
  NotificationGlossaryEntry,
  NotificationReplacement,
  NotificationRuleDef,
  NotificationSourceLog,
  RenderedNotification,
} from '../types/notificationRules.js';

/** Довші тексти обрізаються перед regex, щоб обмежити час збігу. */
export const MAX_MATCH_INPUT = 4000;
export const MAX_PATTERN_LENGTH = 500;

const regexCache = new Map<string, RegExp | null>();

function compile(pattern: string, flags: string): RegExp | null {
  const cacheKey = `${flags}\u0000${pattern}`;
  if (regexCache.has(cacheKey)) return regexCache.get(cacheKey)!;
  let re: RegExp | null = null;
  try {
    re = new RegExp(pattern, flags);
  } catch {
    re = null;
  }
  if (regexCache.size > 2000) regexCache.clear();
  regexCache.set(cacheKey, re);
  return re;
}

/** Вкладені квантифікатори на кшталт (a+)+ або (\w*)* – типова причина зависання regex. */
const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/;

export interface RegexValidation {
  ok: boolean;
  error?: string;
}

export function validatePattern(pattern: string, flags = ''): RegexValidation {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return { ok: false, error: `Шаблон довший за ${MAX_PATTERN_LENGTH} символів` };
  }
  if (/[^gimsuy]/.test(flags)) {
    return { ok: false, error: `Недопустимі прапорці: ${flags}` };
  }
  try {
    new RegExp(pattern, flags);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Невірний regex' };
  }
  if (NESTED_QUANTIFIER.test(pattern)) {
    return { ok: false, error: 'Вкладені квантифікатори (напр. (a+)+) можуть зависати, перепишіть шаблон' };
  }
  return { ok: true };
}

/** Перевірка правила перед збереженням. Повертає список помилок (порожній = ок). */
export function validateRule(rule: NotificationRuleDef): string[] {
  const errors: string[] = [];
  if (!rule.name?.trim()) errors.push('Вкажіть назву правила');
  const patterns: Array<[string, string | undefined, string]> = [
    ['Заголовок (збіг)', rule.match.title, 'i'],
    ['Текст (збіг)', rule.match.message, 'i'],
    ['Ініціатор (збіг)', rule.match.initiatedBy, 'i'],
  ];
  for (const [label, pattern, flags] of patterns) {
    if (!pattern) continue;
    const res = validatePattern(pattern, flags);
    if (!res.ok) errors.push(`${label}: ${res.error}`);
  }
  (rule.output.replacements ?? []).forEach((r, i) => {
    const res = validatePattern(r.pattern, r.flags ?? '');
    if (!res.ok) errors.push(`Заміна ${i + 1}: ${res.error}`);
  });
  const link = rule.output.actionLink;
  if (link && !link.startsWith('/') && !link.startsWith('{{')) {
    errors.push('Посилання дії має бути внутрішнім шляхом, що починається з /');
  }
  return errors;
}

function clip(text: string): string {
  return text.length > MAX_MATCH_INPUT ? text.slice(0, MAX_MATCH_INPUT) : text;
}

function readPath(data: unknown, path: string): unknown {
  let cur: unknown = data;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function stringify(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

interface MatchResult {
  groups: Record<string, string>;
}

function matchRule(rule: NotificationRuleDef, log: NotificationSourceLog): MatchResult | null {
  const m = rule.match;
  if (m.categories?.length && !m.categories.includes(log.category)) return null;
  if (m.statuses?.length && !m.statuses.includes(toNotificationLevel(log.status))) return null;
  if (m.dataHas && readPath(log.data, m.dataHas) === undefined) return null;

  const groups: Record<string, string> = {};
  const checks: Array<[string | undefined, string]> = [
    [m.title, log.title ?? ''],
    [m.message, log.message ?? ''],
    [m.initiatedBy, log.initiatedBy ?? ''],
  ];
  for (const [pattern, value] of checks) {
    if (!pattern) continue;
    const re = compile(pattern, 'i');
    if (!re) return null;
    const hit = re.exec(clip(value));
    if (!hit) return null;
    if (hit.groups) {
      for (const [k, v] of Object.entries(hit.groups)) {
        if (v !== undefined) groups[k] = v;
      }
    }
  }
  return { groups };
}

export function applyReplacements(
  text: string,
  replacements: NotificationReplacement[] | undefined,
  target: 'title' | 'message',
): string {
  let out = text;
  for (const r of replacements ?? []) {
    const applies = (r.target ?? 'message') === target || r.target === 'both';
    if (!applies) continue;
    const flags = (r.flags ?? '').replace(/g/g, '') + 'g';
    const re = compile(r.pattern, flags);
    if (!re) continue;
    out = clip(out).replace(re, r.replace);
  }
  return out;
}

/** {{name}} → vars[name]; {{data.a.b}} → data; невідомі змінні → порожньо. */
export function renderTemplate(template: string, vars: Record<string, string>, data: unknown): string {
  return template
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, name: string) => {
      if (name.startsWith('data.')) return stringify(readPath(data, name.slice(5)));
      return vars[name] ?? '';
    })
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function applyGlossary(text: string, glossary: NotificationGlossaryEntry[]): string {
  let out = text;
  for (const entry of glossary) {
    if (!entry.enabled || !entry.phrase) continue;
    const pattern = entry.isRegex ? entry.phrase : entry.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = compile(pattern, 'gi');
    if (!re) continue;
    out = out.replace(re, entry.replacement);
  }
  return out;
}

function sortRules(rules: NotificationRuleDef[]): NotificationRuleDef[] {
  return [...rules].sort((a, b) => a.position - b.position);
}

export function findMatchingRule(
  log: NotificationSourceLog,
  rules: NotificationRuleDef[],
): { rule: NotificationRuleDef; groups: Record<string, string> } | null {
  for (const rule of sortRules(rules)) {
    if (!rule.enabled) continue;
    const hit = matchRule(rule, log);
    if (hit) return { rule, groups: hit.groups };
  }
  return null;
}

/** Без правила показуємо лише помилки й попередження, як і до редизайну. */
function defaultVisibility(level: string): boolean {
  return level === 'error' || level === 'warning';
}

export function renderNotification(
  log: NotificationSourceLog,
  rules: NotificationRuleDef[],
  glossary: NotificationGlossaryEntry[] = [],
): RenderedNotification {
  const rawLevel = toNotificationLevel(log.status);
  const rawTitle = (log.title ?? '').trim() || log.category;
  const rawMessage = (log.message ?? '').trim();
  const hit = findMatchingRule(log, rules);

  const baseVars: Record<string, string> = {
    category: log.category,
    status: rawLevel,
    orderNumber: log.orderNumber ?? '',
    actor: log.actorName ?? '',
    rawTitle,
    rawMessage,
  };

  if (!hit) {
    return {
      ruleId: null,
      ruleName: null,
      kind: defaultKindForLevel(rawLevel),
      group: defaultGroupForCategory(log.category),
      level: rawLevel,
      visible: defaultVisibility(rawLevel),
      title: applyGlossary(rawTitle, glossary),
      message: applyGlossary(rawMessage, glossary),
      actionLabel: defaultActionLabel(resolveDefaultLink(log)),
      actionLink: resolveDefaultLink(log),
      vars: { ...baseVars, title: rawTitle, message: rawMessage },
    };
  }

  const { rule, groups } = hit;
  const out = rule.output;
  const level = out.level ?? rawLevel;
  const title = applyReplacements(rawTitle, out.replacements, 'title');
  const message = applyReplacements(rawMessage, out.replacements, 'message');
  const vars: Record<string, string> = { ...baseVars, ...groups, title, message };

  const renderedTitle = out.title ? renderTemplate(out.title, vars, log.data) : title;
  const renderedMessage = out.message ? renderTemplate(out.message, vars, log.data) : message;
  const rendered = out.actionLink ? renderTemplate(out.actionLink, vars, log.data) : resolveDefaultLink(log);
  const link = rendered && rendered.startsWith('/') && !rendered.startsWith('//') ? rendered : null;

  return {
    ruleId: rule.id ?? null,
    ruleName: rule.name,
    kind: out.kind ?? defaultKindForLevel(level),
    group: out.group ?? defaultGroupForCategory(log.category),
    level,
    visible: out.visibility === 'show',
    title: applyGlossary(renderedTitle || rawTitle, glossary),
    message: applyGlossary(renderedMessage, glossary),
    actionLabel: (out.actionLabel ? renderTemplate(out.actionLabel, vars, log.data) : '') || defaultActionLabel(link),
    actionLink: link,
    vars,
  };
}

function resolveDefaultLink(log: NotificationSourceLog): string | null {
  const link = readPath(log.data, 'link');
  if (typeof link === 'string' && link.startsWith('/')) return link;
  if (log.orderNumber) return `/orders/${encodeURIComponent(log.orderNumber)}`;
  return null;
}

/** Підпис кнопки за типом посилання, коли правило його не задало. */
export function defaultActionLabel(link: string | null): string | null {
  if (!link) return null;
  if (link.startsWith('/orders/')) return 'Відкрити замовлення';
  if (link.startsWith('/products')) return 'Відкрити товар';
  if (link.startsWith('/warehouse/')) return 'Відкрити документ';
  return 'Відкрити';
}
