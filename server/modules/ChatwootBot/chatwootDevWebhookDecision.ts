import {
  CHATWOOT_BOT_DEV_WEBHOOK_MAX_FAILED_CHECKS,
  type ChatwootBotDevWebhookChangeReason,
  type ChatwootBotDevWebhookState,
} from '../../../shared/types/chatwootBotDevWebhook.js';
import type { ChatwootAgentBotSummary } from './ChatwootApiClient.js';

export type ChatwootDevWebhookGuardDecision =
  | { action: 'none' }
  | { action: 'update_failed_checks'; failedChecks: number }
  | { action: 'revert'; reason: Extract<ChatwootBotDevWebhookChangeReason, 'ttl_expired' | 'health_failed'> };

/** Рішення prod-cron: чи повертати outgoing_url на прод. */
export function decideDevWebhookGuard(
  state: ChatwootBotDevWebhookState,
  nowMs: number,
  healthOk: boolean,
  maxFailedChecks: number = CHATWOOT_BOT_DEV_WEBHOOK_MAX_FAILED_CHECKS,
): ChatwootDevWebhookGuardDecision {
  if (!state.enabled) return { action: 'none' };

  const expiresMs = state.expiresAt ? Date.parse(state.expiresAt) : NaN;
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) {
    return { action: 'revert', reason: 'ttl_expired' };
  }

  if (healthOk) {
    return state.failedChecks > 0 ? { action: 'update_failed_checks', failedChecks: 0 } : { action: 'none' };
  }

  const failedChecks = state.failedChecks + 1;
  if (failedChecks >= maxFailedChecks) {
    return { action: 'revert', reason: 'health_failed' };
  }
  return { action: 'update_failed_checks', failedChecks };
}

function sameUrl(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().replace(/\/+$/, '') === b.trim().replace(/\/+$/, '');
}

export type ChatwootAgentBotPick =
  | { ok: true; bot: ChatwootAgentBotSummary }
  | { ok: false; error: string };

/**
 * Обирає Agent Bot акаунта: збережений id → збіг outgoing_url з прод/dev URL → єдиний бот акаунта.
 * Системні боти (account_id = null) API акаунта не змінює, тому їх пропускаємо.
 */
export function pickAccountAgentBot(
  bots: ChatwootAgentBotSummary[],
  accountId: number,
  knownAgentBotId: number | null,
  candidateUrls: Array<string | null>,
): ChatwootAgentBotPick {
  const accountBots = bots.filter((b) => b.accountId === accountId);
  if (knownAgentBotId != null) {
    const known = accountBots.find((b) => b.id === knownAgentBotId);
    if (known) return { ok: true, bot: known };
  }
  const byUrl = accountBots.filter((b) => candidateUrls.some((u) => sameUrl(b.outgoingUrl, u)));
  if (byUrl.length === 1) return { ok: true, bot: byUrl[0] };
  if (accountBots.length === 1) return { ok: true, bot: accountBots[0] };
  if (accountBots.length === 0) {
    return {
      ok: false,
      error: bots.length
        ? 'Agent Bot є лише системним (Super Admin) — API акаунта не може змінити його outgoing_url.'
        : 'В акаунті немає Agent Bot (Settings → Bots).',
    };
  }
  return {
    ok: false,
    error: `Знайдено ${accountBots.length} Agent Bot, жоден не збігся за Outgoing URL. Вкажіть прод URL у «Outgoing URL hint».`,
  };
}

export function isSameWebhookUrl(a: string | null | undefined, b: string | null | undefined): boolean {
  return sameUrl(a, b);
}
