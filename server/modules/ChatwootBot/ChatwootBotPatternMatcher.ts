import type { ChatwootBotAutoReplyRule, ChatwootBotSettings } from '../../../shared/types/chatwootBot.js';

export type ChatwootBotPatternMatch = {
  ruleId: string;
  reply: string;
};

export function matchAutoReplyRule(
  content: string,
  rules: ChatwootBotAutoReplyRule[],
): ChatwootBotPatternMatch | null {
  const sorted = [...rules].filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);
  for (const rule of sorted) {
    const haystack = rule.caseInsensitive ? content.toLowerCase() : content;
    const needle = rule.caseInsensitive ? rule.pattern.toLowerCase() : rule.pattern;
    if (rule.matchType === 'substring') {
      if (needle.length > 0 && haystack.includes(needle)) {
        return { ruleId: rule.id, reply: rule.reply };
      }
    } else {
      try {
        const re = new RegExp(rule.pattern, rule.caseInsensitive ? 'i' : undefined);
        if (re.test(content)) {
          return { ruleId: rule.id, reply: rule.reply };
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

export function matchAutoReplyFromSettings(
  content: string,
  settings: ChatwootBotSettings,
): ChatwootBotPatternMatch | null {
  return matchAutoReplyRule(content, settings.autoReplyRules);
}
