import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHATWOOT_BOT_DEV_WEBHOOK_STATE,
  type ChatwootBotDevWebhookState,
} from '../../../shared/types/chatwootBotDevWebhook.js';
import { decideDevWebhookGuard, pickAccountAgentBot } from './chatwootDevWebhookDecision.js';

const NOW = Date.parse('2026-10-30T12:00:00Z');

function enabledState(patch: Partial<ChatwootBotDevWebhookState> = {}): ChatwootBotDevWebhookState {
  return {
    ...DEFAULT_CHATWOOT_BOT_DEV_WEBHOOK_STATE,
    enabled: true,
    expiresAt: '2026-10-30T13:00:00Z',
    ...patch,
  };
}

describe('decideDevWebhookGuard', () => {
  it('does nothing when disabled', () => {
    expect(decideDevWebhookGuard(DEFAULT_CHATWOOT_BOT_DEV_WEBHOOK_STATE, NOW, false)).toEqual({
      action: 'none',
    });
  });

  it('reverts after TTL even when healthy', () => {
    expect(decideDevWebhookGuard(enabledState({ expiresAt: '2026-10-30T11:59:00Z' }), NOW, true)).toEqual({
      action: 'revert',
      reason: 'ttl_expired',
    });
    expect(decideDevWebhookGuard(enabledState({ expiresAt: null }), NOW, true)).toEqual({
      action: 'revert',
      reason: 'ttl_expired',
    });
  });

  it('counts failed health checks and reverts on the third', () => {
    expect(decideDevWebhookGuard(enabledState(), NOW, false)).toEqual({
      action: 'update_failed_checks',
      failedChecks: 1,
    });
    expect(decideDevWebhookGuard(enabledState({ failedChecks: 2 }), NOW, false)).toEqual({
      action: 'revert',
      reason: 'health_failed',
    });
  });

  it('resets failed checks after a healthy probe', () => {
    expect(decideDevWebhookGuard(enabledState({ failedChecks: 2 }), NOW, true)).toEqual({
      action: 'update_failed_checks',
      failedChecks: 0,
    });
    expect(decideDevWebhookGuard(enabledState(), NOW, true)).toEqual({ action: 'none' });
  });
});

describe('pickAccountAgentBot', () => {
  const prod = 'https://backoffice.nk-food.shop/api/webhooks/chatwoot';
  const bots = [
    { id: 1, name: 'System', outgoingUrl: prod, accountId: null },
    { id: 5, name: 'NK Bot', outgoingUrl: `${prod}/`, accountId: 1 },
    { id: 6, name: 'Other', outgoingUrl: 'https://example.com/hook', accountId: 1 },
  ];

  it('prefers stored id, then outgoing_url match', () => {
    expect(pickAccountAgentBot(bots, 1, 6, [prod])).toMatchObject({ ok: true, bot: { id: 6 } });
    expect(pickAccountAgentBot(bots, 1, null, [prod])).toMatchObject({ ok: true, bot: { id: 5 } });
  });

  it('skips system bots and fails on ambiguity', () => {
    expect(pickAccountAgentBot(bots.slice(0, 1), 1, null, [prod]).ok).toBe(false);
    expect(pickAccountAgentBot(bots, 1, null, ['https://nowhere/x']).ok).toBe(false);
  });

  it('uses the only account bot when URLs do not match', () => {
    expect(pickAccountAgentBot(bots.slice(0, 2), 1, null, [null])).toMatchObject({ ok: true, bot: { id: 5 } });
  });
});
